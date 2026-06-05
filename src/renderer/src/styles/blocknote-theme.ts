import type { ThemeName } from "@/config/themes";
import { themes } from "@/config/themes";

/**
 * BlockNote 主题颜色配置
 * 将现有主题配置转换为 BlockNote 格式
 */
interface BlockNoteColorScheme {
  editor: { text: string; background: string };
  menu: { text: string; background: string };
  tooltip: { text: string; background: string };
  hovered: { text: string; background: string };
  selected: { text: string; background: string };
  disabled: { text: string; background: string };
  shadow: string;
  border: string;
  sideMenu: string;
  highlights: {
    gray: { text: string; background: string };
    brown: { text: string; background: string };
    red: { text: string; background: string };
    orange: { text: string; background: string };
    yellow: { text: string; background: string };
    green: { text: string; background: string };
    blue: { text: string; background: string };
    purple: { text: string; background: string };
    pink: { text: string; background: string };
  };
}

interface BlockNoteTheme {
  colors: BlockNoteColorScheme;
  borderRadius: number;
  fontFamily: string;
}

/**
 * 默认高亮颜色（亮色主题）
 */
const lightHighlights = {
  gray: { text: "#9b9a97", background: "#ebeced" },
  brown: { text: "#64473a", background: "#e9e5e3" },
  red: { text: "#e03e3e", background: "#fbe4e4" },
  orange: { text: "#d9730d", background: "#f6e9d9" },
  yellow: { text: "#dfab01", background: "#fbf3db" },
  green: { text: "#4d6461", background: "#ddedea" },
  blue: { text: "#0b6e99", background: "#ddebf1" },
  purple: { text: "#6940a5", background: "#eae4f2" },
  pink: { text: "#ad1a72", background: "#f4dfeb" },
};

/**
 * 默认高亮颜色（暗色主题）
 */
const darkHighlights = {
  gray: { text: "#9b9a97", background: "#2a2a2f" },
  brown: { text: "#c4a88a", background: "#3a2f28" },
  red: { text: "#ff6b6b", background: "#3a1f1f" },
  orange: { text: "#ffa94d", background: "#3a2f1f" },
  yellow: { text: "#ffd43b", background: "#3a351f" },
  green: { text: "#69db7c", background: "#1f3a2f" },
  blue: { text: "#4dabf7", background: "#1f2f3a" },
  purple: { text: "#b197fc", background: "#2f1f3a" },
  pink: { text: "#f783ac", background: "#3a1f2f" },
};

/**
 * 将现有主题转换为 BlockNote 主题格式
 */
function convertThemeToBlockNote(themeName: ThemeName): BlockNoteTheme {
  const themeConfig = themes[themeName];
  const isDark = themeName !== "light";

  return {
    colors: {
      editor: {
        text: themeConfig.colors.textPrimary,
        background: themeConfig.colors.bgPrimary,
      },
      menu: {
        text: themeConfig.colors.textPrimary,
        background: themeConfig.colors.bgSecondary,
      },
      tooltip: {
        text: themeConfig.colors.textPrimary,
        background: themeConfig.colors.bgTertiary,
      },
      hovered: {
        text: themeConfig.colors.textPrimary,
        background: themeConfig.colors.hoverBg,
      },
      selected: {
        text: "#ffffff",
        background: themeConfig.colors.accentColor,
      },
      disabled: {
        text: themeConfig.colors.textMuted,
        background: themeConfig.colors.bgTertiary,
      },
      shadow: themeConfig.colors.borderColor,
      border: themeConfig.colors.borderColor,
      sideMenu: themeConfig.colors.textMuted,
      highlights: isDark ? darkHighlights : lightHighlights,
    },
    borderRadius: 6,
    fontFamily:
      '"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };
}

/**
 * 获取 BlockNote 主题配置
 */
export function getBlockNoteTheme(themeName: ThemeName): {
  light: BlockNoteTheme;
  dark: BlockNoteTheme;
} {
  const isDark = themeName !== "light";

  // 根据当前主题选择亮色和暗色版本
  if (isDark) {
    return {
      light: convertThemeToBlockNote("light"),
      dark: convertThemeToBlockNote(themeName),
    };
  }

  return {
    light: convertThemeToBlockNote("light"),
    dark: convertThemeToBlockNote("dark"),
  };
}

/**
 * 强制主题模式
 */
export function getBlockNoteThemeMode(themeName: ThemeName): "light" | "dark" {
  return themeName === "light" ? "light" : "dark";
}
