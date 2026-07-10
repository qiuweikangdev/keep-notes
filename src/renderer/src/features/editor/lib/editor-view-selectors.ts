import type { EditorState } from "@/store/editor.store";

export function selectEditorLayoutSignature(state: EditorState): string {
  return state.panelGroups
    .map(
      (group) =>
        `${group.id}:${group.direction}:${group.splitParentGroupId ?? ""}:${group.splitWarmup ? "warmup" : "visible"}`,
    )
    .join("|");
}

export function selectPanelGroupSignature(groupId: string) {
  return (state: EditorState): string => {
    const group = state.panelGroups.find((item) => item.id === groupId);
    return group
      ? `${group.activeTabId}:${group.tabs.length}:${group.splitWarmup ? "warmup" : "visible"}`
      : "";
  };
}

export function selectTabBarSignature(groupId: string) {
  return (state: EditorState): string => {
    const group = state.panelGroups.find((item) => item.id === groupId);
    if (!group) return "";

    const tabs = group.tabs
      .map(
        (tab) =>
          `${tab.id}\u001f${tab.pendingFilePath ?? tab.filePath ?? ""}\u001f${tab.isDirty}\u001f${tab.saveStatus}\u001f${tab.mode}`,
      )
      .join("\u001e");
    return `${group.activeTabId}\u001d${tabs}`;
  };
}

export function selectEditorWorkspaceSignature(groupId: string, tabId: string) {
  return (state: EditorState): string => {
    const tab = state.panelGroups
      .find((group) => group.id === groupId)
      ?.tabs.find((item) => item.id === tabId);
    if (!tab) return "";

    // 富文本大文档的正文不参与签名，避免后台保存把整棵编辑器重新渲染。
    const contentSignature =
      tab.mode === "source"
        ? `\u001f${tab.content.length}\u001f${tab.content}`
        : "";

    return [
      tab.id,
      tab.pendingFilePath ?? "",
      tab.filePath ?? "",
      tab.loadStatus,
      tab.mode,
      tab.reloadKey,
      tab.errorMessage ?? "",
      tab.parseErrorMessage ?? "",
      tab.scrollTop,
      contentSignature,
    ].join("\u001e");
  };
}

export function selectBlockNoteRuntimeSignature(
  groupId: string,
  tabId: string,
) {
  return (state: EditorState): string => {
    const tab = state.panelGroups
      .find((group) => group.id === groupId)
      ?.tabs.find((item) => item.id === tabId);
    if (!tab) return "";

    // BlockNote 已经持有当前文档树，正文快照只在文件切换/重载时重新读取。
    return [
      tab.id,
      tab.pendingFilePath ?? "",
      tab.filePath ?? "",
      tab.reloadKey,
      tab.loadStatus,
      tab.parseErrorMessage ?? "",
    ].join("\u001e");
  };
}

export function selectEditorToolbarSignature(groupId: string) {
  return (state: EditorState): string => {
    const group = state.panelGroups.find((item) => item.id === groupId);
    const tab = group?.tabs.find((item) => item.id === group.activeTabId);
    if (!tab) return "";

    // 工具栏只关心可见状态；点击动作再读取正文快照。
    return [
      tab.id,
      tab.pendingFilePath ?? "",
      tab.filePath ?? "",
      tab.mode,
      tab.reloadKey,
      tab.parseErrorMessage ?? "",
    ].join("\u001e");
  };
}
