import type { EditorTab } from "@/store/editor.store";

export function beginFileTransition(tab: EditorTab, path: string): EditorTab {
  return {
    ...tab,
    pendingFilePath: path,
    loadStatus: "loading",
    errorMessage: null,
    parseErrorMessage: null,
    scrollTop: 0,
  };
}

export function completeFileTransition(
  tab: EditorTab,
  path: string,
  content: string,
): EditorTab {
  if (tab.pendingFilePath !== path && tab.filePath !== path) {
    return tab;
  }

  return {
    ...tab,
    filePath: path,
    pendingFilePath: null,
    content,
    wordCount: content.length,
    loadStatus: "ready",
    saveStatus: "clean",
    isDirty: false,
    errorMessage: null,
    parseErrorMessage: null,
    scrollTop: 0,
    reloadKey: tab.reloadKey + 1,
  };
}

export function failFileTransition(
  tab: EditorTab,
  path: string,
  message: string,
): EditorTab {
  if (tab.pendingFilePath !== path) {
    return tab;
  }

  return {
    ...tab,
    pendingFilePath: null,
    // 已有文档时继续展示并保持可编辑，仅首次打开失败才进入错误页。
    loadStatus: tab.filePath ? "ready" : "error",
    errorMessage: message,
  };
}
