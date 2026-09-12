import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { getThemeConfig, resolveTheme, type ThemeName } from "@/config/themes";
import { getLayoutConfig } from "@/config/layouts";
import { useUIStore } from "@/store/ui.store";

const THEME_CLASSES = [
  "light",
  "dark",
  "minimal",
  "nord",
  "dracula",
  "solarized",
];
const THEME_NAMES: readonly ThemeName[] = [
  "light",
  "dark",
  "minimal",
  "nord",
  "dracula",
  "solarized",
  "system",
];
const UI_STORAGE_KEY = "ui-storage";

function getPersistedAppTheme(value: string | null): ThemeName | null {
  if (!value) return null;

  try {
    const persisted = JSON.parse(value) as {
      state?: { theme?: unknown };
    };
    return THEME_NAMES.includes(persisted.state?.theme as ThemeName)
      ? (persisted.state?.theme as ThemeName)
      : null;
  } catch {
    return null;
  }
}

interface UseThemeOptions {
  transparentBackground?: boolean;
  themeOverride?: ThemeName;
}

export function useTheme({
  transparentBackground = false,
  themeOverride,
}: UseThemeOptions = {}) {
  const theme = useUIStore((state) => state.theme);
  const layout = useUIStore((state) => state.layout);
  const setTheme = useUIStore((state) => state.setTheme);
  const setLayout = useUIStore((state) => state.setLayout);
  const [, refreshSystemTheme] = useState(0);
  const effectiveTheme = themeOverride ?? theme;

  // 每次渲染都同步解析主题，避免主题变量和 BlockNote 的色彩方案出现短暂错位。
  const resolvedTheme = resolveTheme(effectiveTheme);

  useEffect(() => {
    if (effectiveTheme !== "system") return;

    // 仅在跟随系统时订阅系统配色变化，通过刷新触发一次同步重新解析。
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      refreshSystemTheme((version) => version + 1);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [effectiveTheme]);

  useLayoutEffect(() => {
    if (themeOverride) return;

    const persistedTheme = getPersistedAppTheme(
      localStorage.getItem(UI_STORAGE_KEY),
    );
    if (persistedTheme && persistedTheme !== useUIStore.getState().theme) {
      setTheme(persistedTheme);
    }
  }, [setTheme, themeOverride]);

  useEffect(() => {
    if (themeOverride) return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== UI_STORAGE_KEY) return;

      const nextTheme = getPersistedAppTheme(event.newValue);
      if (nextTheme && nextTheme !== useUIStore.getState().theme) {
        setTheme(nextTheme);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [setTheme, themeOverride]);

  // 在浏览器绘制前批量提交全局主题变量，与本次 React 渲染保持同一帧生效。
  useLayoutEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const config = getThemeConfig(resolvedTheme);

    root.style.setProperty("--bg-primary", config.colors.bgPrimary);
    root.style.setProperty("--bg-secondary", config.colors.bgSecondary);
    root.style.setProperty("--bg-tertiary", config.colors.bgTertiary);
    root.style.setProperty("--text-primary", config.colors.textPrimary);
    root.style.setProperty("--text-secondary", config.colors.textSecondary);
    root.style.setProperty("--text-muted", config.colors.textMuted);
    root.style.setProperty("--border-color", config.colors.borderColor);
    root.style.setProperty("--accent-color", config.colors.accentColor);
    root.style.setProperty("--hover-bg", config.components.selection.hover);
    root.style.setProperty("--active-bg", config.components.selection.selected);
    root.style.setProperty(
      "--selection-row-hover",
      config.components.selection.hover,
    );
    root.style.setProperty(
      "--selection-row-selected",
      config.components.selection.selected,
    );
    root.style.setProperty(
      "--file-tree-row-hover",
      config.components.selection.hover,
    );
    root.style.setProperty(
      "--file-tree-row-selected",
      config.components.selection.selected,
    );

    const { input, dropdown, codeBlock } = config.components;
    root.style.setProperty("--input-background", input.background);
    root.style.setProperty("--input-hover-background", input.hoverBackground);
    root.style.setProperty("--input-border", input.border);
    root.style.setProperty("--input-hover-border", input.hoverBorder);
    root.style.setProperty("--input-focus-border", input.focusBorder);
    root.style.setProperty("--input-focus-ring", input.focusRing);
    root.style.setProperty("--input-placeholder", input.placeholder);
    root.style.setProperty("--dropdown-background", dropdown.background);
    root.style.setProperty("--dropdown-border", dropdown.border);
    root.style.setProperty("--dropdown-shadow", dropdown.shadow);
    root.style.setProperty("--dropdown-item-hover", dropdown.hover);
    root.style.setProperty("--dropdown-item-selected", dropdown.selected);
    root.style.setProperty("--editor-code-block-bg", codeBlock.background);
    root.style.setProperty("--editor-code-block-text", codeBlock.text);
    root.style.setProperty("--editor-code-block-cursor", codeBlock.cursor);
    root.style.setProperty("--editor-code-block-muted", codeBlock.muted);
    root.style.setProperty("--editor-code-block-border", codeBlock.border);
    root.style.setProperty(
      "--editor-code-block-control-bg",
      codeBlock.controlBackground,
    );
    root.style.setProperty(
      "--editor-code-block-control-border",
      codeBlock.controlBorder,
    );
    root.style.setProperty(
      "--editor-code-block-control-hover-bg",
      codeBlock.controlHoverBackground,
    );
    root.style.setProperty(
      "--editor-code-block-control-hover-text",
      codeBlock.controlHoverText,
    );
    root.style.setProperty(
      "--editor-code-block-popover-bg",
      codeBlock.popoverBackground,
    );
    root.style.setProperty(
      "--editor-code-block-popover-hover",
      codeBlock.popoverHover,
    );
    root.style.setProperty(
      "--editor-code-block-popover-shadow",
      codeBlock.popoverShadow,
    );
    root.style.setProperty(
      "--editor-code-block-fold-bg",
      codeBlock.foldBackground,
    );
    root.style.setProperty("--editor-code-block-fold-text", codeBlock.foldText);

    const layoutConfig = getLayoutConfig(layout);
    root.style.setProperty(
      "--workspace-background",
      layoutConfig.workspaceBackground,
    );
    root.style.setProperty(
      "--title-bar-background",
      layoutConfig.titleBarBackground,
    );
    root.style.setProperty("--title-bar-border", layoutConfig.titleBarBorder);
    root.style.setProperty(
      "--sidebar-background",
      layoutConfig.sidebarBackground,
    );
    root.style.setProperty("--sidebar-border", layoutConfig.sidebarBorder);
    root.style.setProperty(
      "--sidebar-header-background",
      layoutConfig.sidebarHeaderBackground,
    );
    root.style.setProperty(
      "--sidebar-header-border",
      layoutConfig.sidebarHeaderBorder,
    );
    root.style.setProperty(
      "--workspace-panel-group-padding",
      layoutConfig.panelGroupPadding,
    );
    root.style.setProperty(
      "--workspace-editor-panel-padding",
      layoutConfig.editorPanelPadding,
    );
    root.style.setProperty(
      "--workspace-content-border",
      layoutConfig.contentBorder,
    );
    root.style.setProperty(
      "--workspace-content-radius",
      layoutConfig.contentRadius,
    );
    root.style.setProperty(
      "--workspace-material-opacity",
      layoutConfig.materialOpacity,
    );

    body.style.backgroundColor = transparentBackground
      ? "transparent"
      : config.colors.bgPrimary;
    body.style.color = config.colors.textPrimary;

    root.classList.remove(...THEME_CLASSES);
    body.classList.remove(...THEME_CLASSES);
    root.classList.add(resolvedTheme);
    body.classList.add(resolvedTheme);
    root.setAttribute(
      "data-theme",
      effectiveTheme === "system" ? "system" : resolvedTheme,
    );
    root.dataset.layout = layoutConfig.name;
    body.dataset.layout = layoutConfig.name;
  }, [effectiveTheme, layout, resolvedTheme, transparentBackground]);

  const changeTheme = useCallback(
    (newTheme: ThemeName) => {
      setTheme(newTheme);
    },
    [setTheme],
  );

  const changeLayout = useCallback(
    (newLayout: typeof layout) => {
      setLayout(newLayout);
    },
    [setLayout],
  );

  const toggleTheme = useCallback(() => {
    if (theme === "system") {
      setTheme(resolvedTheme === "light" ? "dark" : "light");
      return;
    }

    setTheme(theme === "light" ? "dark" : "light");
  }, [resolvedTheme, setTheme, theme]);

  return {
    theme,
    layout,
    setTheme: changeTheme,
    setLayout: changeLayout,
    toggleTheme,
    isDark: getThemeConfig(resolvedTheme).colorScheme === "dark",
    config: getThemeConfig(resolvedTheme),
  };
}
