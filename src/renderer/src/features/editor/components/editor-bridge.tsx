import { useEffect } from "react";
import type { CloseSaveSnapshot } from "@shared/types";
import {
  backgroundEditorSaveCoordinator,
  editorSaveCoordinator,
  richDocumentSessionManager,
} from "@/features/editor/lib/editor-runtime";
import { getEditorDocumentPath } from "@/features/editor/lib/editor-document-path";
import type { EditorState } from "@/store/editor.store";
import { useEditorStore } from "@/store/editor.store";

// 获取当前激活的标签页
const getActiveTab = (state: ReturnType<typeof useEditorStore.getState>) => {
  const panelGroups = state.panelGroups || [];
  const activeGroup = panelGroups.find((g) => g.id === state.activeGroupId);
  if (!activeGroup) return null;
  const activeTab = activeGroup.tabs.find(
    (t) => t.id === activeGroup.activeTabId,
  );
  return activeTab || null;
};

export function hasUnsavedEditorChanges(state: EditorState): boolean {
  const tabs = state.panelGroups.flatMap((group) => group.tabs);
  // 多标签模式聚合全部标签；无标签时回退旧版全局状态以保持兼容。
  return tabs.length > 0 ? tabs.some((tab) => tab.isDirty) : state.isDirty;
}

export function selectNextDirtyEditor(
  state: EditorState,
): CloseSaveSnapshot | null {
  const activeGroup = state.panelGroups.find(
    (group) => group.id === state.activeGroupId,
  );
  const activeTab = activeGroup?.tabs.find(
    (tab) => tab.id === activeGroup.activeTabId,
  );
  // 优先保存当前脏标签，否则按面板与标签顺序选择首个待保存项。
  const target = activeTab?.isDirty
    ? { group: activeGroup!, tab: activeTab }
    : state.panelGroups
        .flatMap((group) => group.tabs.map((tab) => ({ group, tab })))
        .find(({ tab }) => tab.isDirty);

  if (!target) return null;

  return {
    groupId: target.group.id,
    tabId: target.tab.id,
    content: target.tab.content,
    filePath: target.tab.filePath,
  };
}

// 暴露给主进程调用的全局函数
export function EditorBridge() {
  useEffect(() => {
    // 获取编辑器内容（获取当前激活标签页的内容）
    (window as any).__getEditorContent = () => {
      const state = useEditorStore.getState();
      const activeTab = getActiveTab(state);
      return activeTab ? activeTab.content : state.content;
    };

    // 获取文件路径（获取当前激活标签页的文件路径）
    (window as any).__getFilePath = () => {
      const state = useEditorStore.getState();
      const activeTab = getActiveTab(state);
      return activeTab ? activeTab.filePath : state.filePath;
    };

    // 保存成功回调（直接保存到已有文件）
    (window as any).__onSaveSuccess = () => {
      const state = useEditorStore.getState();
      const panelGroups = state.panelGroups || [];
      const activeGroup = panelGroups.find((g) => g.id === state.activeGroupId);
      if (activeGroup) {
        state.setTabDirty(activeGroup.id, activeGroup.activeTabId, false);
      } else {
        state.setDirty(false);
      }
    };

    // 另存为成功回调
    (window as any).__onSaveAsSuccess = (newFilePath: string) => {
      const state = useEditorStore.getState();
      const panelGroups = state.panelGroups || [];
      const activeGroup = panelGroups.find((g) => g.id === state.activeGroupId);
      if (activeGroup) {
        state.setTabFilePath(
          activeGroup.id,
          activeGroup.activeTabId,
          newFilePath,
        );
        state.setTabDirty(activeGroup.id, activeGroup.activeTabId, false);
      } else {
        state.setFilePath(newFilePath);
        state.setDirty(false);
      }
    };

    (window as any).__getNextDirtyEditor = async () => {
      while (true) {
        const state = useEditorStore.getState();
        const snapshot = selectNextDirtyEditor(state);
        if (!snapshot) {
          return backgroundEditorSaveCoordinator.getNextCloseSnapshot();
        }

        // 关闭保存前激活目标标签，并从实时富文本树刷新 Markdown，不能返回延迟的 store 快照。
        state.setActiveTab(snapshot.groupId, snapshot.tabId);
        const targetTab = state.panelGroups
          .find((group) => group.id === snapshot.groupId)
          ?.tabs.find((tab) => tab.id === snapshot.tabId);
        if (!targetTab) continue;

        const documentPath = getEditorDocumentPath(targetTab);
        if (richDocumentSessionManager.getRuntime(documentPath)) {
          await richDocumentSessionManager.serializePendingChange(documentPath);
        }

        const refreshed = selectNextDirtyEditor(useEditorStore.getState());
        if (
          refreshed &&
          refreshed.groupId === snapshot.groupId &&
          refreshed.tabId === snapshot.tabId
        ) {
          return refreshed;
        }
      }
    };

    (window as any).__onCloseSaveSuccess = (
      groupId: string,
      tabId: string,
      filePath: string | null,
      savedContent: string,
    ) => {
      if (backgroundEditorSaveCoordinator.isCloseSaveIdentity(groupId)) {
        const confirmed = backgroundEditorSaveCoordinator.confirmCloseSave(
          groupId,
          tabId,
          filePath,
          savedContent,
        );
        if (confirmed && filePath) editorSaveCoordinator.cancel(filePath);
        return;
      }

      // 路径回填与脏状态更新必须原子完成；写盘后又被编辑的标签继续保持待保存。
      useEditorStore.setState((state) => ({
        panelGroups: state.panelGroups.map((group) =>
          group.id === groupId
            ? {
                ...group,
                tabs: group.tabs.map((tab) => {
                  if (tab.id !== tabId) return tab;

                  const isDirty = tab.content !== savedContent;
                  return {
                    ...tab,
                    ...(filePath
                      ? { filePath, pendingFilePath: null }
                      : undefined),
                    isDirty,
                    saveStatus: isDirty ? "dirty" : "clean",
                  };
                }),
              }
            : group,
        ),
      }));
    };

    // 监听 store 变化，同步脏状态到主进程
    let reportedDirty: boolean | undefined;
    const syncDirtyState = () => {
      const currentDirty =
        hasUnsavedEditorChanges(useEditorStore.getState()) ||
        backgroundEditorSaveCoordinator.hasPending();
      if (currentDirty === reportedDirty) return;
      reportedDirty = currentDirty;
      window.electronAPI.updateDirtyState(currentDirty);
    };
    const unsub = useEditorStore.subscribe(syncDirtyState);
    const unsubBackground =
      backgroundEditorSaveCoordinator.subscribe(syncDirtyState);

    // 初始同步一次
    syncDirtyState();

    return () => {
      delete (window as any).__getEditorContent;
      delete (window as any).__getFilePath;
      delete (window as any).__onSaveSuccess;
      delete (window as any).__onSaveAsSuccess;
      delete (window as any).__getNextDirtyEditor;
      delete (window as any).__onCloseSaveSuccess;
      unsub();
      unsubBackground();
    };
  }, []);

  return null;
}
