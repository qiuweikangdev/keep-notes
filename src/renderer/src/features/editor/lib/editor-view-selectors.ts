import type { EditorState } from "@/store/editor.store";

export function selectEditorLayoutSignature(state: EditorState): string {
  return state.panelGroups
    .map((group) => `${group.id}:${group.direction}`)
    .join("|");
}

export function selectPanelGroupSignature(groupId: string) {
  return (state: EditorState): string => {
    const group = state.panelGroups.find((item) => item.id === groupId);
    return group ? `${group.activeTabId}:${group.tabs.length}` : "";
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
