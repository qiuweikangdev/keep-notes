import { useEditorStore } from "@/store/editor.store";
import { editorSaveCoordinator, flushEditorChange } from "./editor-runtime";

const closeTasks = new Map<string, Promise<boolean>>();

function getTab(groupId: string, tabId: string) {
  return useEditorStore
    .getState()
    .panelGroups.find((group) => group.id === groupId)
    ?.tabs.find((tab) => tab.id === tabId);
}

async function performCloseEditorTab(
  groupId: string,
  tabId: string,
): Promise<boolean> {
  try {
    // 富文本可能仍停留在延迟序列化阶段，任何关闭入口都必须先获取最新快照。
    await flushEditorChange(groupId, tabId);
    const tab = getTab(groupId, tabId);
    if (!tab) return true;

    if (tab.filePath) {
      if (tab.isDirty && !editorSaveCoordinator.hasPending(tab.filePath)) {
        editorSaveCoordinator.schedule(tab.filePath, tab.content);
      }
      if (!(await editorSaveCoordinator.flush(tab.filePath))) return false;
    } else if (tab.isDirty) {
      const result = tab.temporaryTitle
        ? await window.electronAPI.saveAs(tab.content, tab.temporaryTitle)
        : await window.electronAPI.saveAs(tab.content);
      if (result.code !== 0 || !result.data) return false;

      const state = useEditorStore.getState();
      state.setTabFilePath(groupId, tabId, result.data.filePath);
      state.setTabDirty(groupId, tabId, false);
    }

    useEditorStore.getState().removeTab(groupId, tabId);
    return true;
  } catch (error) {
    console.error("Failed to close editor tab:", error);
    return false;
  }
}

export function closeEditorTab(
  groupId: string,
  tabId: string,
): Promise<boolean> {
  const key = `${groupId}:${tabId}`;
  const existing = closeTasks.get(key);
  if (existing) return existing;

  const task = performCloseEditorTab(groupId, tabId).finally(() => {
    if (closeTasks.get(key) === task) closeTasks.delete(key);
  });
  closeTasks.set(key, task);
  return task;
}
