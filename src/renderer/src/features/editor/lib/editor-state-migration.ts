import type {
  EditorLoadStatus,
  EditorMode,
  EditorPanelGroup,
  EditorSaveStatus,
  EditorTab,
} from "@/store/editor.store";

type AddedEditorTabFields = {
  pendingFilePath: string | null;
  temporaryTitle?: string | null;
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
  const normalized = {
    ...defaults,
    ...persisted,
    // sidebarView 不持久化，每次启动时重置为默认值
    sidebarView: "file" as TAppearance extends { sidebarView: infer S }
      ? S
      : never,
  };

  const defaultPadding = (defaults as { padding?: unknown }).padding;
  const currentPadding = (normalized as { padding?: unknown }).padding;
  if (typeof defaultPadding === "number" && currentPadding === 0) {
    // 旧版本默认值为 0，会让编辑内容贴边；迁移到当前默认内边距。
    (normalized as { padding: number }).padding = defaultPadding;
  }

  const defaultFontSize = (defaults as { fontSize?: unknown }).fontSize;
  const defaultUiFontSize = (defaults as { uiFontSize?: unknown }).uiFontSize;
  const currentFontSize = (normalized as { fontSize?: unknown }).fontSize;
  const currentUiFontSize = (normalized as { uiFontSize?: unknown }).uiFontSize;
  if (
    typeof defaultFontSize === "number" &&
    typeof defaultUiFontSize === "number" &&
    typeof currentFontSize === "number" &&
    typeof currentUiFontSize === "number" &&
    currentFontSize === defaultFontSize &&
    currentUiFontSize !== defaultUiFontSize
  ) {
    // 旧版 UI 字号曾作为独立字段保存；现在字号只影响编辑器内容，迁移旧值到实际生效字段。
    (normalized as { fontSize: number }).fontSize = currentUiFontSize;
  }

  const defaultExternalOpenApp = (
    defaults as { defaultExternalOpenApp?: unknown }
  ).defaultExternalOpenApp;
  const currentExternalOpenApp = (
    normalized as { defaultExternalOpenApp?: unknown }
  ).defaultExternalOpenApp;
  if (
    typeof defaultExternalOpenApp === "string" &&
    !["vscode", "zed", "cursor", "warp", "terminal", "file-manager"].includes(
      String(currentExternalOpenApp),
    )
  ) {
    (normalized as { defaultExternalOpenApp: string }).defaultExternalOpenApp =
      defaultExternalOpenApp;
  }

  return normalized;
}

export function normalizePersistedPanelGroups(
  groups: LegacyEditorPanelGroup[],
): EditorPanelGroup[] {
  return groups.map((group) => ({
    ...group,
    tabs: group.tabs.map((tab) => ({
      ...tab,
      pendingFilePath: tab.pendingFilePath ?? null,
      temporaryTitle: tab.temporaryTitle ?? null,
      mode: tab.mode ?? "rich",
      // 旧标签页已经携带内容，恢复后应直接可编辑，不能停在 loading。
      loadStatus: tab.filePath ? (tab.loadStatus ?? "ready") : "ready",
      saveStatus: tab.saveStatus ?? (tab.isDirty ? "dirty" : "clean"),
      errorMessage: tab.errorMessage ?? null,
      parseErrorMessage: tab.parseErrorMessage ?? null,
      scrollTop: tab.scrollTop ?? 0,
    })),
  }));
}
