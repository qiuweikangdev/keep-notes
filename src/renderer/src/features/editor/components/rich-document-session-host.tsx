import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useDiffStore } from "@/store/diff.store";
import type { EditorState } from "@/store/editor.store";
import { useEditorStore } from "@/store/editor.store";
import {
  editorCache,
  editorSaveCoordinator,
  registerEditorChangeFlusher,
  richDocumentSessionManager,
  subscribeToEditorFile,
} from "../lib/editor-runtime";
import { registerEditorOutlineNavigator } from "../lib/editor-outline-navigation";
import {
  selectRichDocumentRepresentative,
  type RichDocumentRepresentative,
} from "../lib/editor-view-selectors";
import { normalizeRichDocumentPath } from "../lib/rich-document-surface-registry";
import { toRichPaneKey } from "../lib/rich-pane-view-state";
import {
  BlockNoteEditor,
  type RichBlockNoteRuntime,
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
    (group) => group.id === state.activeGroupId,
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

function resolveStoredDocumentPath(
  normalizedPath: string,
  state: EditorState,
  tabIds: string[],
): string {
  let matchingStoredPath: string | null = null;
  for (const group of state.panelGroups) {
    for (const tab of group.tabs) {
      if (
        tab.filePath &&
        normalizeRichDocumentPath(tab.filePath) === normalizedPath
      ) {
        matchingStoredPath ??= tab.filePath;
        if (tabIds.length === 0 || tabIds.includes(tab.id)) {
          return tab.filePath;
        }
      }
    }
  }
  return matchingStoredPath ?? normalizedPath;
}

function selectSynchronizedTabIds(
  normalizedPath: string,
  state: EditorState,
): string[] {
  const tabIds: string[] = [];
  for (const group of state.panelGroups) {
    for (const tab of group.tabs) {
      if (
        tab.filePath &&
        normalizeRichDocumentPath(tab.filePath) === normalizedPath
      ) {
        tabIds.push(tab.id);
      }
    }
  }
  return tabIds;
}

export function RichDocumentSessionHost({
  path,
}: RichDocumentSessionHostProps) {
  const normalizedPath = normalizeRichDocumentPath(path);
  const [ioPath] = useState(() =>
    resolveStoredDocumentPath(
      normalizedPath,
      useEditorStore.getState(),
      richDocumentSessionManager.getBoundTabIds(normalizedPath),
    ),
  );
  const representativeSelector = useMemo(
    () => selectRichDocumentRepresentative(normalizedPath),
    [normalizedPath],
  );
  const representative = useEditorStore(representativeSelector);
  const visibleBindingSignature = useEditorStore((state) => {
    const bindingKeys: string[] = [];
    for (const group of state.panelGroups) {
      const tab = group.tabs.find(
        (candidate) => candidate.id === group.activeTabId,
      );
      if (
        tab?.mode === "rich" &&
        tab.filePath &&
        normalizeRichDocumentPath(tab.filePath) === normalizedPath
      ) {
        bindingKeys.push(`${group.id}:${tab.id}`);
      }
    }
    return bindingKeys.join("|");
  });
  const readyRepresentativeRef = useRef<{
    path: string;
    value: RichDocumentRepresentative | null;
  }>({ path: normalizedPath, value: null });
  if (readyRepresentativeRef.current.path !== normalizedPath) {
    readyRepresentativeRef.current = { path: normalizedPath, value: null };
  }
  if (representative?.loadStatus === "ready") {
    readyRepresentativeRef.current.value = representative;
  }
  const readyRepresentative = readyRepresentativeRef.current.value;
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
        const synchronizedTabIds = selectSynchronizedTabIds(
          normalizedPath,
          store,
        );
        // 同一路径的面板共享当前文档树，只更新 Markdown 快照，不触发任何面板重载。
        store.syncFileContent(
          normalizedPath,
          content,
          undefined,
          synchronizedTabIds,
        );
        const diffState = useDiffStore.getState();
        if (
          diffState.isOpen &&
          diffState.filePath &&
          normalizeRichDocumentPath(diffState.filePath) === normalizedPath
        ) {
          diffState.updateContent(diffState.oldContent, content);
        }
        // host 生命周期内固定 I/O 路径拼写，确保监听与自身写盘始终使用同一身份。
        editorSaveCoordinator.schedule(ioPath, content);
      },
      onWordCountChange: (count) => {
        const binding = getActiveBinding();
        if (!binding) return;
        useEditorStore
          .getState()
          .setTabWordCount(binding.groupId, binding.tabId, count);
      },
      onParseStateChange: (message) => {
        useEditorStore.getState().setFileParseState(normalizedPath, message);
      },
      onRuntimeReady: (runtime) =>
        richDocumentSessionManager.registerRuntime(normalizedPath, runtime),
    };
  }, [ioPath, normalizedPath]);

  useEffect(() => {
    return subscribeToEditorFile(ioPath, (content) => {
      const store = useEditorStore.getState();
      const matchingTabs = store.panelGroups.flatMap((group) =>
        group.tabs.filter(
          (tab) =>
            tab.filePath &&
            normalizeRichDocumentPath(tab.filePath) === normalizedPath,
        ),
      );
      if (
        matchingTabs.length > 0 &&
        matchingTabs.every((tab) => tab.content === content)
      ) {
        return;
      }

      editorCache.setContent(ioPath, content);
      // 外部文件事件只更新快照并提升 reloadKey；唯一 session 随代表快照重载一次。
      store.syncFileContent(normalizedPath, content);
    });
  }, [ioPath, normalizedPath]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const state = useEditorStore.getState();
    for (const group of state.panelGroups) {
      const tab = group.tabs.find(
        (candidate) => candidate.id === group.activeTabId,
      );
      if (
        tab?.mode !== "rich" ||
        !tab.filePath ||
        normalizeRichDocumentPath(tab.filePath) !== normalizedPath
      ) {
        continue;
      }
      const paneKey = toRichPaneKey(group.id, tab.id);

      cleanups.push(
        registerEditorChangeFlusher(
          group.id,
          tab.id,
          () =>
            richDocumentSessionManager.serializePendingChange(normalizedPath),
          () =>
            richDocumentSessionManager
              .getRuntime(normalizedPath)
              ?.cancelPendingWork(),
        ),
        registerEditorOutlineNavigator(group.id, tab.id, (blockId) => {
          const runtime = richDocumentSessionManager.getRuntime(
            normalizedPath,
          ) as RichBlockNoteRuntime | null;
          if (
            !runtime ||
            !richDocumentSessionManager.setActivePane(normalizedPath, paneKey)
          ) {
            return false;
          }

          // 大纲导航必须先恢复所属窗格的独立视图状态，再执行块定位，避免同文件分栏互相滚动。
          const store = useEditorStore.getState();
          const targetGroup = store.panelGroups.find(
            (candidate) => candidate.id === group.id,
          );
          if (
            store.activeGroupId !== group.id ||
            targetGroup?.activeTabId !== tab.id
          ) {
            store.setActiveTab(group.id, tab.id);
          }
          return runtime.scrollToBlock(blockId);
        }),
      );
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [normalizedPath, visibleBindingSignature]);

  // 初次内容未就绪时不创建编辑器；一旦已创建，reload 的 loading 窗口只保留旧树，避免销毁会话。
  if (!readyRepresentative) return null;

  return createPortal(
    <BlockNoteEditor
      content={readyRepresentative.content}
      controller={controller}
      reloadKey={readyRepresentative.reloadKey}
      surface={surface}
    />,
    surface,
  );
}
