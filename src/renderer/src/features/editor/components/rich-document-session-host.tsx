import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useElectron } from "@/hooks/use-electron";
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
  isUntitledDocumentPath,
  matchesEditorDocumentPath,
} from "../lib/editor-document-path";
import {
  completeEditorViewportPreservation,
  requestEditorViewportPreservation,
} from "../lib/editor-viewport";
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
    matchesEditorDocumentPath(activeTab, normalizedPath)
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
        matchesEditorDocumentPath(candidate, normalizedPath),
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
      if (tab.filePath && matchesEditorDocumentPath(tab, normalizedPath)) {
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
      if (matchesEditorDocumentPath(tab, normalizedPath)) {
        tabIds.push(tab.id);
      }
    }
  }
  return tabIds;
}

export function RichDocumentSessionHost({
  path,
}: RichDocumentSessionHostProps) {
  const { openFile } = useElectron();
  const normalizedPath = normalizeRichDocumentPath(path);
  const isUntitledDocument = isUntitledDocumentPath(normalizedPath);
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
        matchesEditorDocumentPath(tab, normalizedPath)
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
      onFileDrop: (filePath, binding) =>
        openFile(filePath, binding.groupId, { openInNewTab: true }),
      onMarkdownChange: (content) => {
        const store = useEditorStore.getState();
        const synchronizedTabIds = selectSynchronizedTabIds(
          normalizedPath,
          store,
        );
        if (isUntitledDocument) {
          // 未命名文档只更新所属标签快照，不触发文件监听或磁盘保存。
          for (const group of store.panelGroups) {
            for (const tab of group.tabs) {
              if (synchronizedTabIds.includes(tab.id)) {
                store.setTabContent(group.id, tab.id, content);
              }
            }
          }
          return;
        }

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
        if (isUntitledDocument) {
          const store = useEditorStore.getState();
          for (const group of store.panelGroups) {
            for (const tab of group.tabs) {
              if (matchesEditorDocumentPath(tab, normalizedPath)) {
                store.setTabParseError(group.id, tab.id, message);
              }
            }
          }
          return;
        }
        useEditorStore.getState().setFileParseState(normalizedPath, message);
      },
      onRuntimeReady: (runtime) =>
        richDocumentSessionManager.registerRuntime(normalizedPath, runtime),
    };
  }, [ioPath, isUntitledDocument, normalizedPath, openFile]);

  useEffect(() => {
    if (isUntitledDocument) return;

    let viewportPreservationVersion: number | null = null;
    const unsubscribe = subscribeToEditorFile(
      ioPath,
      (content) => {
        const store = useEditorStore.getState();
        const matchingTabs = store.panelGroups.flatMap((group) =>
          group.tabs.filter(
            (tab) =>
              tab.filePath && matchesEditorDocumentPath(tab, normalizedPath),
          ),
        );
        if (
          matchingTabs.length > 0 &&
          matchingTabs.every((tab) => tab.content === content)
        ) {
          return;
        }

        editorCache.setContent(ioPath, content);
        // 同一路径的外部更新只替换文档内容，重载前保留当前富文本视口。
        viewportPreservationVersion =
          requestEditorViewportPreservation(normalizedPath);
        // 外部更新不能覆盖任何未保存标签，只刷新干净标签并标记冲突标签。
        store.syncExternalFileContent(normalizedPath, content);
      },
      // 与源码标签并存时先登记视口保护，避免源码同步先提升富文本 reloadKey。
      { priority: 1 },
    );

    return () => {
      unsubscribe();
      if (viewportPreservationVersion !== null) {
        // 解析完成前关闭文件时撤销当前版本，避免下次普通打开误恢复旧视口。
        completeEditorViewportPreservation(
          normalizedPath,
          viewportPreservationVersion,
        );
      }
    };
  }, [ioPath, isUntitledDocument, normalizedPath]);

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const state = useEditorStore.getState();
    for (const group of state.panelGroups) {
      const tab = group.tabs.find(
        (candidate) => candidate.id === group.activeTabId,
      );
      if (
        tab?.mode !== "rich" ||
        !matchesEditorDocumentPath(tab, normalizedPath)
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
        registerEditorOutlineNavigator(
          group.id,
          tab.id,
          (blockId, { isRetry }) => {
            if (isRetry) {
              const retryState = useEditorStore.getState();
              const activeGroup = retryState.panelGroups.find(
                (candidate) => candidate.id === retryState.activeGroupId,
              );
              if (
                retryState.activeGroupId !== group.id ||
                activeGroup?.activeTabId !== tab.id
              ) {
                // store 仍指向目标时继续修复尚未就绪的 manager；只有用户已切走才终止旧重试。
                return "cancel";
              }
            }

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
          },
        ),
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
