export type LayoutName = "classic" | "minimal";

export interface LayoutConfig {
  name: LayoutName;
  label: string;
  description: string;
  workspaceBackground: string;
  titleBarBackground: string;
  titleBarBorder: string;
  sidebarBackground: string;
  sidebarBorder: string;
  sidebarHeaderBackground: string;
  sidebarHeaderBorder: string;
  panelGroupPadding: string;
  editorPanelPadding: string;
  contentBorder: string;
  contentRadius: string;
  materialOpacity: string;
}

export const layouts: Record<LayoutName, LayoutConfig> = {
  classic: {
    name: "classic",
    label: "经典布局",
    description: "侧栏与编辑区紧密连接",
    workspaceBackground: "var(--bg-primary)",
    titleBarBackground: "var(--bg-primary)",
    titleBarBorder: "1px solid var(--border-color)",
    sidebarBackground: "var(--bg-secondary)",
    sidebarBorder: "1px solid var(--border-color)",
    sidebarHeaderBackground: "var(--bg-secondary)",
    sidebarHeaderBorder: "1px solid var(--border-color)",
    panelGroupPadding: "0",
    editorPanelPadding: "0",
    contentBorder: "0 solid transparent",
    contentRadius: "0",
    materialOpacity: "100%",
  },
  minimal: {
    name: "minimal",
    label: "简约布局",
    description: "通透侧栏与圆角内容区",
    workspaceBackground: "var(--bg-secondary)",
    titleBarBackground: "transparent",
    titleBarBorder: "0 solid transparent",
    sidebarBackground: "transparent",
    sidebarBorder: "0 solid transparent",
    sidebarHeaderBackground: "transparent",
    sidebarHeaderBorder: "1px solid transparent",
    panelGroupPadding: "2px 8px 8px",
    editorPanelPadding: "0 0 0 6px",
    contentBorder:
      "1px solid color-mix(in srgb, var(--border-color) 80%, transparent)",
    contentRadius: "10px",
    materialOpacity: "90%",
  },
};

export const layoutOptions = Object.values(layouts);

export function getLayoutConfig(layout: LayoutName): LayoutConfig {
  return layouts[layout] ?? layouts.classic;
}
