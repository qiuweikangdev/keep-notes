import { useEditorStore } from "@/store/editor.store";
import { CodeResult } from "@/types";
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

    let path = tab.filePath;
    let savedContent: string | undefined;
    if (!path && tab.isDirty) {
      const closeAction = await window.electronAPI.confirmCloseUntitled(
        tab.temporaryTitle ?? undefined,
      );
      if (closeAction === "cancel") return false;
      if (closeAction === "discard") {
        useEditorStore.getState().removeTab(groupId, tabId);
        return true;
      }
      // 对话框等待期间也可能收到浮窗编辑，另存为必须重新读取最新快照。
      await flushEditorChange(groupId, tabId);
      const snapshot = getTab(groupId, tabId);
      if (!snapshot) return true;
      const result = snapshot.temporaryTitle
        ? await window.electronAPI.saveAs(
            snapshot.content,
            snapshot.temporaryTitle,
          )
        : await window.electronAPI.saveAs(snapshot.content);
      if (result.code !== CodeResult.Success || !result.data) return false;
      if (!getTab(groupId, tabId)) return true;
      path = result.data.filePath;
      savedContent = snapshot.content;
      useEditorStore.getState().setTabFilePath(groupId, tabId, path);
    }

    if (path) {
      // 写盘与富文本序列化均可能异步完成；直到同一最新版本已落盘才允许移除标签。
      while (true) {
        await flushEditorChange(groupId, tabId);
        const snapshot = getTab(groupId, tabId);
        if (!snapshot) return true;
        if (
          snapshot.content !== savedContent &&
          (snapshot.isDirty ||
            savedContent !== undefined ||
            editorSaveCoordinator.hasPending(path))
        ) {
          editorSaveCoordinator.schedule(path, snapshot.content);
        }
        if (!(await editorSaveCoordinator.flush(path))) return false;
        await flushEditorChange(groupId, tabId);
        const latest = getTab(groupId, tabId);
        if (!latest) return true;
        if (
          latest.content === snapshot.content &&
          (!editorSaveCoordinator.hasPending(path) ||
            editorSaveCoordinator.getPendingContent(path) === snapshot.content)
        ) {
          // 重复 flush 可能重新排入同一内容，已落盘的相同版本无需再次等待。
          editorSaveCoordinator.cancel(path);
          useEditorStore.getState().setTabDirty(groupId, tabId, false);
          break;
        }
        savedContent = snapshot.content;
      }
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
