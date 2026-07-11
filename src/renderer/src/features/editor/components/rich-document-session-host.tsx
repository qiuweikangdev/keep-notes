import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { useDiffStore } from "@/store/diff.store";
import type { EditorState } from "@/store/editor.store";
import { useEditorStore } from "@/store/editor.store";
import {
  editorSaveCoordinator,
  richDocumentSessionManager,
} from "../lib/editor-runtime";
import { selectRichDocumentRepresentative } from "../lib/editor-view-selectors";
import { normalizeRichDocumentPath } from "../lib/rich-document-surface-registry";
import { toRichPaneKey } from "../lib/rich-pane-view-state";
import {
  BlockNoteEditor,
  type RichEditorBinding,
  type RichEditorSessionController,
} from "./blocknote-editor";

interface RichDocumentSessionHostProps {
  path: string;
}

function selectActiveRichBinding(
  path: string,
  state: EditorState,
): RichEditorBinding | null {
  const normalizedPath = normalizeRichDocumentPath(path);
  const activeGroup = state.panelGroups.find(
    (group) => group.id === state.activeGroupId && !group.splitWarmup,
  );
  const activeTab = activeGroup?.tabs.find(
    (tab) => tab.id === activeGroup.activeTabId,
  );

  if (
    activeGroup &&
    activeTab?.mode === "rich" &&
    activeTab.filePath &&
    normalizeRichDocumentPath(activeTab.filePath) === normalizedPath
  ) {
    return {
      groupId: activeGroup.id,
      tabId: activeTab.id,
      paneKey: toRichPaneKey(activeGroup.id, activeTab.id),
      path: normalizedPath,
    };
  }

  for (const group of state.panelGroups) {
    if (group.splitWarmup) continue;
    const tab = group.tabs.find(
      (candidate) =>
        candidate.id === group.activeTabId &&
        candidate.mode === "rich" &&
        candidate.filePath !== null &&
        normalizeRichDocumentPath(candidate.filePath) === normalizedPath,
    );
    if (!tab) continue;

    return {
      groupId: group.id,
      tabId: tab.id,
      paneKey: toRichPaneKey(group.id, tab.id),
      path: normalizedPath,
    };
  }

  return null;
}

export function RichDocumentSessionHost({
  path,
}: RichDocumentSessionHostProps) {
  const normalizedPath = normalizeRichDocumentPath(path);
  const representativeSelector = useMemo(
    () => selectRichDocumentRepresentative(normalizedPath),
    [normalizedPath],
  );
  const representative = useEditorStore(representativeSelector);
  const [surface] = useState(() => {
    const element = document.createElement("div");
    element.className = "h-full min-h-0";
    element.dataset.richDocumentSurface = normalizedPath;
    return element;
  });
  const controller = useMemo<RichEditorSessionController>(() => {
    const getActiveBinding = (): RichEditorBinding | null => {
      const active = richDocumentSessionManager.getActiveBinding();
      if (active?.path === normalizedPath) {
        return { ...active.binding, path: normalizedPath };
      }
      return selectActiveRichBinding(normalizedPath, useEditorStore.getState());
    };

    return {
      path: normalizedPath,
      getActiveBinding,
      getBoundTabIds: () =>
        richDocumentSessionManager.getBoundTabIds(normalizedPath),
      onMarkdownChange: (content) => {
        const store = useEditorStore.getState();
        const tabIds =
          richDocumentSessionManager.getBoundTabIds(normalizedPath);
        // 同一路径的面板共享当前文档树，只更新 Markdown 快照，不触发任何面板重载。
        store.syncFileContent(normalizedPath, content, undefined, tabIds);
        const diffState = useDiffStore.getState();
        if (
          diffState.isOpen &&
          diffState.filePath &&
          normalizeRichDocumentPath(diffState.filePath) === normalizedPath
        ) {
          diffState.updateContent(diffState.oldContent, content);
        }
        editorSaveCoordinator.schedule(normalizedPath, content);
      },
      onWordCountChange: (count) => {
        const binding = getActiveBinding();
        if (!binding) return;
        useEditorStore
          .getState()
          .setTabWordCount(binding.groupId, binding.tabId, count);
      },
      onParseStateChange: (message) => {
        const binding = getActiveBinding();
        if (!binding) return;
        useEditorStore
          .getState()
          .setTabParseError(binding.groupId, binding.tabId, message);
      },
      onRuntimeReady: (runtime) =>
        richDocumentSessionManager.registerRuntime(normalizedPath, runtime),
    };
  }, [normalizedPath]);

  if (!representative || representative.loadStatus !== "ready") return null;

  return createPortal(
    <BlockNoteEditor
      content={representative.content}
      controller={controller}
      reloadKey={representative.reloadKey}
      surface={surface}
    />,
    surface,
  );
}
