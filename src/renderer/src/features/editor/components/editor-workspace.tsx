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
  const tab = useEditorStore((state) =>
    state.panelGroups
      .find((group) => group.id === groupId)
      ?.tabs.find((item) => item.id === tabId),
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
    () => findTextMatches(tab?.content ?? "", findQuery, findOptions),
    [findOptions, findQuery, tab?.content],
  );

  useEffect(() => {
    if (!tab?.filePath) return;
    const path = tab.filePath;
    return subscribeToEditorFile(path, (content) => {
      editorCache.setContent(path, content);
      const state = useEditorStore.getState();
      const currentTab = state.panelGroups
        .find((group) => group.id === groupId)
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
  }, [groupId, tab?.filePath, tabId]);

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
    if (!isFindOpen || !findQuery || tab?.mode !== "rich") {
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
    tab?.content,
    tab?.mode,
  ]);

  useEffect(
    () => () => {
      clearEditorFindHighlights();
    },
    [],
  );

  useEffect(() => {
    if (!isFindOpen || !findQuery || tab?.mode !== "source") return;
    const match = rawMatches[activeFindIndex];
    if (!match) return;

    requestAnimationFrame(() => {
      sourceEditorRef.current?.setSelectionRange(match.start, match.end);
    });
  }, [activeFindIndex, findQuery, isFindOpen, rawMatches, tab?.mode]);

  const handleSourceChange = useCallback(
    (content: string) => {
      if (!tab) return;
      setTabContent(groupId, tabId, content);
      if (!tab.filePath) return;
      syncFileContent(tab.filePath, content, tabId);
      editorSaveCoordinator.schedule(tab.filePath, content);
    },
    [groupId, setTabContent, syncFileContent, tab, tabId],
  );

  useEffect(() => {
    if (!tab || tab.mode !== "source") return;
    const repairedContent = repairMarkdownSourceBeforeParse(tab.content);
    if (repairedContent === tab.content) return;

    // 源码模式也要修复历史拖拽导致的粘连列表，避免富文本解析正常但源码面板仍显示坏内容。
    setTabContent(groupId, tabId, repairedContent);
    if (!tab.filePath) return;
    syncFileContent(tab.filePath, repairedContent, tabId);
    editorSaveCoordinator.schedule(tab.filePath, repairedContent);
  }, [groupId, setTabContent, syncFileContent, tab, tabId]);

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
      if (!tab) return;
      if (content === tab.content) return;
      if (shouldPushUndo) {
        replacementUndoStackRef.current.push(tab.content);
      }
      setTabContent(groupId, tabId, content);
      if (tab.filePath) {
        syncFileContent(tab.filePath, content, tabId);
        editorSaveCoordinator.schedule(tab.filePath, content);
      }
      if (tab.mode === "rich") {
        incrementTabReloadKey(groupId, tabId);
      }
    },
    [
      groupId,
      incrementTabReloadKey,
      setTabContent,
      syncFileContent,
      tab,
      tabId,
    ],
  );

  const replaceCurrentMatch = useCallback(() => {
    if (!tab) return;
    const match = rawMatches[activeFindIndex];
    if (!match) return;
    applyFindReplacement(replaceTextMatch(tab.content, match, replacement));
  }, [activeFindIndex, applyFindReplacement, rawMatches, replacement, tab]);

  const replaceAllMatches = useCallback(() => {
    if (!tab || rawMatches.length === 0) return;
    applyFindReplacement(
      replaceAllTextMatches(tab.content, rawMatches, replacement),
    );
  }, [applyFindReplacement, rawMatches, replacement, tab]);

  const undoLastReplacement = useCallback(() => {
    const previousContent = replacementUndoStackRef.current.pop();
    if (!previousContent) return;
    applyFindReplacement(previousContent, false);
  }, [applyFindReplacement]);

  const selectAllMatches = useCallback(() => {
    if (!findQuery || rawMatches.length === 0) return;
    if (tab?.mode === "source") {
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
  }, [findOptions, findQuery, rawMatches, tab?.mode]);

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
        onRetry={() => tab.filePath && void openFile(tab.filePath, groupId)}
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
        {tab.mode === "source" ? (
          <div className="flex h-full min-h-0 flex-col">
            {tab.parseErrorMessage ? (
              <div
                role="status"
                className="border-b border-[var(--border-color)] bg-[color-mix(in_srgb,var(--danger-color)_8%,var(--bg-primary))] px-4 py-2 text-xs text-[var(--danger-color)]"
              >
                {tab.parseErrorMessage}
                。已保留完整源码，请修正后重试富文本模式。
              </div>
            ) : null}
            <div className="min-h-0 flex-1">
              <MarkdownSourceEditor
                ref={sourceEditorRef}
                fontFamily={appearance.codeFont}
                fontSize={appearance.fontSize}
                lineHeight={appearance.lineHeight}
                value={tab.content}
                resetKey={tab.pendingFilePath ?? tab.filePath ?? tab.id}
                scrollTop={tab.scrollTop}
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
