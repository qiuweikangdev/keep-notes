import type {
  EditorLoadStatus,
  EditorMode,
  EditorPanelGroup,
  EditorSaveStatus,
  EditorTab,
} from "@/store/editor.store";

type AddedEditorTabFields = {
  pendingFilePath: string | null;
  mode: EditorMode;
  loadStatus: EditorLoadStatus;
  saveStatus: EditorSaveStatus;
  errorMessage: string | null;
  parseErrorMessage: string | null;
  scrollTop: number;
};

type LegacyEditorTab = Omit<EditorTab, keyof AddedEditorTabFields> &
  Partial<AddedEditorTabFields>;
type LegacyEditorPanelGroup = Omit<EditorPanelGroup, "tabs"> & {
  tabs: LegacyEditorTab[];
};

export function normalizePersistedAppearance<TAppearance extends object>(
  defaults: TAppearance,
  persisted: Partial<TAppearance> | null | undefined,
): TAppearance {
  return {
    ...defaults,
    ...persisted,
    // sidebarView 不持久化，每次启动时重置为默认值
    sidebarView: "file" as TAppearance extends { sidebarView: infer S }
      ? S
      : never,
  };
}

export function normalizePersistedPanelGroups(
  groups: LegacyEditorPanelGroup[],
): EditorPanelGroup[] {
  return groups.map((group) => ({
    ...group,
    tabs: group.tabs.map((tab) => ({
      ...tab,
      pendingFilePath: tab.pendingFilePath ?? null,
      mode: tab.mode ?? "rich",
      // 旧标签页已经携带内容，恢复后应直接可编辑，不能停在 loading。
      loadStatus: tab.loadStatus ?? (tab.filePath ? "ready" : "idle"),
      saveStatus: tab.saveStatus ?? (tab.isDirty ? "dirty" : "clean"),
      errorMessage: tab.errorMessage ?? null,
      parseErrorMessage: tab.parseErrorMessage ?? null,
      scrollTop: tab.scrollTop ?? 0,
    })),
  }));
}
