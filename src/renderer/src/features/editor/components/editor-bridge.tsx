import { useEffect } from "react";
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

    // 监听 store 变化，同步脏状态到主进程
    const unsub = useEditorStore.subscribe((state, prevState) => {
      const currentTab = getActiveTab(state);
      const prevTab = getActiveTab(prevState);

      const currentDirty = currentTab ? currentTab.isDirty : state.isDirty;
      const prevDirty = prevTab ? prevTab.isDirty : prevState.isDirty;

      if (currentDirty !== prevDirty) {
        window.electronAPI.updateDirtyState(currentDirty);
      }
    });

    // 初始同步一次
    const initialState = useEditorStore.getState();
    const initialTab = getActiveTab(initialState);
    window.electronAPI.updateDirtyState(
      initialTab ? initialTab.isDirty : initialState.isDirty,
    );

    return () => {
      delete (window as any).__getEditorContent;
      delete (window as any).__getFilePath;
      delete (window as any).__onSaveSuccess;
      delete (window as any).__onSaveAsSuccess;
      unsub();
    };
  }, []);

  return null;
}
