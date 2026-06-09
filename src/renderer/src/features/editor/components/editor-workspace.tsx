import { useCallback, useEffect } from "react";

import { useElectron } from "@/hooks/use-electron";
import { useEditorStore, type EditorMode } from "@/store/editor.store";
import {
  editorCache,
  editorSaveCoordinator,
  flushEditorChange,
  subscribeToEditorFile,
} from "../lib/editor-runtime";
import { BlockNoteEditor } from "./blocknote-editor";
import { EditorStateView } from "./editor-state-view";
import { EditorToolbar } from "./editor-toolbar";
import { MarkdownSourceEditor } from "./markdown-source-editor";

export function EditorWorkspace({
  groupId,
  tabId,
}: {
  groupId: string;
  tabId: string;
}) {
  const tab = useEditorStore((state) =>
    state.panelGroups
      .find((group) => group.id === groupId)
      ?.tabs.find((item) => item.id === tabId),
  );
  const setTabMode = useEditorStore((state) => state.setTabMode);
  const setTabParseError = useEditorStore((state) => state.setTabParseError);
  const setTabContent = useEditorStore((state) => state.setTabContent);
  const setTabScrollTop = useEditorStore((state) => state.setTabScrollTop);
  const syncFileContent = useEditorStore((state) => state.syncFileContent);
  const { openFile } = useElectron();

  useEffect(() => {
    if (!tab?.filePath) return;
    const path = tab.filePath;
    return subscribeToEditorFile(path, (content) => {
      editorCache.setContent(path, content);
      const state = useEditorStore.getState();
      state.completeTabLoad(groupId, tabId, path, content);
      state.syncFileContent(path, content, tabId);
    });
  }, [groupId, tab?.filePath, tabId]);

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

  const handleModeChange = useCallback(
    (mode: EditorMode) => {
      const changeMode = async () => {
        if (tab?.mode === "rich" && mode === "source") {
          await flushEditorChange(groupId, tabId);
        }
        if (mode === "rich") {
          setTabParseError(groupId, tabId, null);
        }
        setTabMode(groupId, tabId, mode);
      };
      void changeMode();
    },
    [groupId, setTabMode, setTabParseError, tab?.mode, tabId],
  );

  if (!tab) {
    return <EditorStateView status="empty" />;
  }

  const fileName = tab.filePath?.split(/[\\/]/).pop() || "未命名";
  if (tab.loadStatus === "loading") {
    return <EditorStateView status="loading" fileName={fileName} />;
  }
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
    <div className="flex h-full flex-col overflow-hidden bg-[var(--bg-primary)]">
      <EditorToolbar
        fileName={fileName}
        mode={tab.mode}
        saveStatus={tab.saveStatus}
        onModeChange={handleModeChange}
        onRetrySave={() => {
          if (tab.filePath) void editorSaveCoordinator.flush(tab.filePath);
        }}
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
                value={tab.content}
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
