import type { EditorPanelGroup, EditorTab } from "@/store/editor.store";

export function isReusableUntitledTab(tab: EditorTab): boolean {
  return (
    tab.filePath === null &&
    tab.pendingFilePath === null &&
    !tab.isDirty &&
    tab.content.trim().length === 0
  );
}

export function selectFileOpenTabId(
  group: EditorPanelGroup,
  addTab: (groupId: string) => string,
): string {
  const activeTab = group.tabs.find((tab) => tab.id === group.activeTabId);

  // 已编辑的未命名标签不能被文件打开覆盖，改用新标签承载目标文件。
  if (activeTab?.filePath === null && !isReusableUntitledTab(activeTab)) {
    return addTab(group.id);
  }

  return group.activeTabId;
}
