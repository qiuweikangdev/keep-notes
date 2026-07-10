import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { useElectron } from "@/hooks/use-electron";
import { useEditorStore } from "@/store/editor.store";
import {
  editorCache,
  editorSaveCoordinator,
  subscribeToEditorFile,
} from "../lib/editor-runtime";
import { selectEditorWorkspaceSignature } from "../lib/editor-view-selectors";
import { shouldApplyExternalFileChange } from "../lib/editor-external-change";
import { repairMarkdownSourceBeforeParse } from "../lib/markdown";
import {
  findTextMatches,
  getSteppedMatchIndex,
  replaceAllTextMatches,
  replaceTextMatch,
  type FindTextOptions,
} from "../lib/find-in-file";
import {
  applyEditorFindHighlights,
  clearEditorFindHighlights,
  collectEditorFindRanges,
  selectEditorFindRanges,
  scrollRangeIntoView,
} from "../lib/editor-find-highlights";
import { BlockNoteEditor } from "./blocknote-editor";
import { EditorStateView } from "./editor-state-view";
import { FindWidget } from "./find-widget";
import { MarkdownSourceEditor } from "./markdown-source-editor";

export function EditorWorkspace({
  groupId,
  tabId,
}: {
  groupId: string;
  tabId: string;
}) {
  const editorRootRef = useRef<HTMLDivElement>(null);
  const sourceEditorRef = useRef<HTMLTextAreaElement>(null);
  const replacementUndoStackRef = useRef<string[]>([]);
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [findOptions, setFindOptions] = useState<FindTextOptions>({});
  const [activeFindIndex, setActiveFindIndex] = useState(-1);
  useEditorStore(selectEditorWorkspaceSignature(groupId, tabId));
  const tab = useEditorStore
    .getState()
    .panelGroups.find((group) => group.id === groupId)
    ?.tabs.find((item) => item.id === tabId);
  const tabFilePath = tab?.filePath ?? null;
  const tabMode = tab?.mode ?? "rich";
  const tabContent = tab?.content ?? "";
  const tabParseErrorMessage = tab?.parseErrorMessage ?? null;
  const tabScrollTop = tab?.scrollTop ?? 0;
  const tabResetKey = tab
    ? (tab.pendingFilePath ?? tab.filePath ?? tab.id)
    : null;
  const getCurrentTab = useCallback(
    () =>
      useEditorStore
        .getState()
        .panelGroups.find((item) => item.id === groupId)
        ?.tabs.find((item) => item.id === tabId),
    [groupId, tabId],
  );
  const setTabContent = useEditorStore((state) => state.setTabContent);
  const setTabScrollTop = useEditorStore((state) => state.setTabScrollTop);
  const incrementTabReloadKey = useEditorStore(
    (state) => state.incrementTabReloadKey,
  );
  const syncFileContent = useEditorStore((state) => state.syncFileContent);
  const appearance = useEditorStore((state) => state.appearance);
  const { openFile } = useElectron();

  const rawMatches = useMemo(
    () =>
      findQuery ? findTextMatches(tabContent, findQuery, findOptions) : [],
    [findOptions, findQuery, tabContent],
  );

  useEffect(() => {
    if (!tabFilePath) return;
    const path = tabFilePath;
    return subscribeToEditorFile(path, (content) => {
      editorCache.setContent(path, content);
      const state = useEditorStore.getState();
      const currentTab = state.panelGroups
        .find((item) => item.id === groupId)
        ?.tabs.find((item) => item.id === tabId);
      if (
        currentTab &&
        !shouldApplyExternalFileChange(currentTab.content, content)
      ) {
        return;
      }
      state.completeTabLoad(groupId, tabId, path, content);
      state.syncFileContent(path, content, tabId);
    });
  }, [groupId, tabFilePath, tabId]);

  useEffect(() => {
    setActiveFindIndex(findQuery && rawMatches.length > 0 ? 0 : -1);
  }, [
    findOptions.matchCase,
    findOptions.useRegex,
    findOptions.wholeWord,
    findQuery,
    rawMatches.length,
    tabId,
  ]);

  useEffect(() => {
    setActiveFindIndex((currentIndex) => {
      if (rawMatches.length === 0) return -1;
      if (currentIndex < 0) return 0;
      return Math.min(currentIndex, rawMatches.length - 1);
    });
  }, [rawMatches.length]);

  useEffect(() => {
    if (!isFindOpen || !findQuery || tabMode !== "rich") {
      clearEditorFindHighlights();
      return;
    }

    const frame = requestAnimationFrame(() => {
      const root = editorRootRef.current;
      if (!root) return;
      const ranges = collectEditorFindRanges(root, findQuery, findOptions);
      applyEditorFindHighlights(ranges, activeFindIndex);
      scrollRangeIntoView(ranges[activeFindIndex]);
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [
    activeFindIndex,
    findOptions,
    findQuery,
    isFindOpen,
    tabContent,
    tabMode,
  ]);

  useEffect(
    () => () => {
      clearEditorFindHighlights();
    },
    [],
  );

  useEffect(() => {
    if (!isFindOpen || !findQuery || tabMode !== "source") return;
    const match = rawMatches[activeFindIndex];
    if (!match) return;

    requestAnimationFrame(() => {
      sourceEditorRef.current?.setSelectionRange(match.start, match.end);
    });
  }, [activeFindIndex, findQuery, isFindOpen, rawMatches, tabMode]);

  const handleSourceChange = useCallback(
    (content: string) => {
      const currentTab = getCurrentTab();
      if (!currentTab) return;
      setTabContent(groupId, tabId, content);
      if (!currentTab.filePath) return;
      syncFileContent(currentTab.filePath, content, tabId);
      editorSaveCoordinator.schedule(currentTab.filePath, content);
    },
    [getCurrentTab, groupId, setTabContent, syncFileContent, tabId],
  );

  useEffect(() => {
    if (!tab || tabMode !== "source") return;
    const repairedContent = repairMarkdownSourceBeforeParse(tabContent);
    if (repairedContent === tabContent) return;

    // 源码模式也要修复历史拖拽导致的粘连列表，避免富文本解析正常但源码面板仍显示坏内容。
    setTabContent(groupId, tabId, repairedContent);
    if (!tabFilePath) return;
    syncFileContent(tabFilePath, repairedContent, tabId);
    editorSaveCoordinator.schedule(tabFilePath, repairedContent);
  }, [
    groupId,
    setTabContent,
    syncFileContent,
    tab,
    tabContent,
    tabFilePath,
    tabId,
    tabMode,
  ]);

  const openFindWidget = useCallback(() => {
    setIsFindOpen(true);
  }, []);

  const closeFindWidget = useCallback(() => {
    setIsFindOpen(false);
    clearEditorFindHighlights();
  }, []);

  const handleKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        event.stopPropagation();
        openFindWidget();
      }
    },
    [openFindWidget],
  );

  const stepMatch = useCallback(
    (direction: 1 | -1) => {
      setActiveFindIndex((currentIndex) =>
        getSteppedMatchIndex(currentIndex, rawMatches.length, direction),
      );
    },
    [rawMatches.length],
  );

  const applyFindReplacement = useCallback(
    (content: string, shouldPushUndo = true) => {
      const currentTab = getCurrentTab();
      if (!currentTab) return;
      if (content === currentTab.content) return;
      if (shouldPushUndo) {
        replacementUndoStackRef.current.push(currentTab.content);
      }
      setTabContent(groupId, tabId, content);
      if (currentTab.filePath) {
        syncFileContent(currentTab.filePath, content, tabId);
        editorSaveCoordinator.schedule(currentTab.filePath, content);
      }
      if (currentTab.mode === "rich") {
        incrementTabReloadKey(groupId, tabId);
      }
    },
    [
      getCurrentTab,
      groupId,
      incrementTabReloadKey,
      setTabContent,
      syncFileContent,
      tabId,
    ],
  );

  const replaceCurrentMatch = useCallback(() => {
    const currentTab = getCurrentTab();
    if (!currentTab) return;
    const match = rawMatches[activeFindIndex];
    if (!match) return;
    applyFindReplacement(
      replaceTextMatch(currentTab.content, match, replacement),
    );
  }, [
    activeFindIndex,
    applyFindReplacement,
    getCurrentTab,
    rawMatches,
    replacement,
  ]);

  const replaceAllMatches = useCallback(() => {
    const currentTab = getCurrentTab();
    if (!currentTab || rawMatches.length === 0) return;
    applyFindReplacement(
      replaceAllTextMatches(currentTab.content, rawMatches, replacement),
    );
  }, [applyFindReplacement, getCurrentTab, rawMatches, replacement]);

  const undoLastReplacement = useCallback(() => {
    const previousContent = replacementUndoStackRef.current.pop();
    if (!previousContent) return;
    applyFindReplacement(previousContent, false);
  }, [applyFindReplacement]);

  const selectAllMatches = useCallback(() => {
    if (!findQuery || rawMatches.length === 0) return;
    if (tabMode === "source") {
      const textarea = sourceEditorRef.current;
      const firstMatch = rawMatches[0];
      const lastMatch = rawMatches[rawMatches.length - 1];
      textarea?.focus();
      textarea?.setSelectionRange(firstMatch.start, lastMatch.end);
      return;
    }

    const root = editorRootRef.current;
    if (!root) return;
    const ranges = collectEditorFindRanges(root, findQuery, findOptions);
    selectEditorFindRanges(ranges);
  }, [findOptions, findQuery, rawMatches, tabMode]);

  if (!tab) {
    return <EditorStateView status="empty" />;
  }

  const fileName = tab.filePath?.split(/[\\/]/).pop() || "未命名";
  if (tab.loadStatus === "error") {
    return (
      <EditorStateView
        status="error"
        fileName={fileName}
        message={tab.errorMessage}
        onRetry={() => tabFilePath && void openFile(tabFilePath, groupId)}
      />
    );
  }

  return (
    <div
      ref={editorRootRef}
      className="relative flex h-full flex-col overflow-hidden bg-[var(--bg-primary)]"
      onKeyDownCapture={handleKeyDownCapture}
    >
      <FindWidget
        isOpen={isFindOpen}
        isReplaceOpen={isReplaceOpen}
        query={findQuery}
        replacement={replacement}
        activeIndex={activeFindIndex}
        matchCount={rawMatches.length}
        options={findOptions}
        onQueryChange={setFindQuery}
        onReplacementChange={setReplacement}
        onStep={stepMatch}
        onClose={closeFindWidget}
        onToggleReplace={() => setIsReplaceOpen((current) => !current)}
        onOptionsChange={setFindOptions}
        onReplaceCurrent={replaceCurrentMatch}
        onReplaceAll={replaceAllMatches}
        onSelectAllMatches={selectAllMatches}
        onUndoReplace={undoLastReplacement}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        {tabMode === "source" ? (
          <div className="flex h-full min-h-0 flex-col">
            {tabParseErrorMessage ? (
              <div
                role="status"
                className="border-b border-[var(--border-color)] bg-[color-mix(in_srgb,var(--danger-color)_8%,var(--bg-primary))] px-4 py-2 text-xs text-[var(--danger-color)]"
              >
                {tabParseErrorMessage}
                。已保留完整源码，请修正后重试富文本模式。
              </div>
            ) : null}
            <div className="min-h-0 flex-1">
              <MarkdownSourceEditor
                ref={sourceEditorRef}
                fontFamily={appearance.codeFont}
                fontSize={appearance.fontSize}
                lineHeight={appearance.lineHeight}
                value={tabContent}
                resetKey={tabResetKey}
                scrollTop={tabScrollTop}
                onChange={handleSourceChange}
                onScrollTopChange={(scrollTop) =>
                  setTabScrollTop(groupId, tabId, scrollTop)
                }
              />
            </div>
          </div>
        ) : (
          <BlockNoteEditor groupId={groupId} tabId={tabId} />
        )}
      </div>
    </div>
  );
}
