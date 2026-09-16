export type ThemeName = "light" | "dark" | "minimal" | "system";

export type ResolvedThemeName = Exclude<ThemeName, "system">;

export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  borderColor: string;
  hoverBg: string;
  activeBg: string;
  accentColor: string;
}

export interface ThemeComponents {
  input: {
    background: string;
    hoverBackground: string;
    border: string;
    hoverBorder: string;
    focusBorder: string;
    focusRing: string;
    placeholder: string;
  };
  dropdown: {
    background: string;
    border: string;
    shadow: string;
    hover: string;
    selected: string;
  };
  selection: {
    hover: string;
    selected: string;
  };
  codeBlock: {
    background: string;
    text: string;
    cursor: string;
    muted: string;
    border: string;
    controlBackground: string;
    controlBorder: string;
    controlHoverBackground: string;
    controlHoverText: string;
    popoverBackground: string;
    popoverHover: string;
    popoverShadow: string;
    foldBackground: string;
    foldText: string;
  };
}

export interface ThemeConfig {
  name: ResolvedThemeName;
  label: string;
  colorScheme: "light" | "dark";
  preview: {
    bg: string;
    sidebar: string;
    accent: string;
    text: string;
  };
  colors: ThemeColors;
  components: ThemeComponents;
}

type ThemeDefinition = Omit<ThemeConfig, "components"> & {
  components?: {
    input?: Partial<ThemeComponents["input"]>;
    dropdown?: Partial<ThemeComponents["dropdown"]>;
    selection?: Partial<ThemeComponents["selection"]>;
    codeBlock?: Partial<ThemeComponents["codeBlock"]>;
  };
};

const LIGHT_CODE_BLOCK = {
  background: "#f5f8ff",
  text: "#0f172a",
  cursor: "#0969da",
  muted: "#475569",
  border: "rgba(148, 163, 184, 0.9)",
  controlBackground: "rgba(255, 255, 255, 0.92)",
  controlBorder: "rgba(100, 116, 139, 0.42)",
  controlHoverBackground: "#dbeafe",
  controlHoverText: "#1e3a8a",
  popoverBackground: "#ffffff",
  popoverHover: "#eef4ff",
  popoverShadow: "0 18px 44px rgba(148, 163, 184, 0.2)",
  foldBackground: "rgba(37, 99, 235, 0.11)",
  foldText: "#1d4ed8",
} satisfies ThemeComponents["codeBlock"];

const DARK_CODE_BLOCK = {
  background: "#0d1117",
  text: "#f0f6fc",
  cursor: "#79c0ff",
  muted: "#8b949e",
  border: "rgba(86, 96, 116, 0.9)",
  controlBackground: "rgba(22, 27, 34, 0.94)",
  controlBorder: "rgba(139, 148, 158, 0.34)",
  controlHoverBackground: "#21262d",
  controlHoverText: "#ffffff",
  popoverBackground: "#161b22",
  popoverHover: "rgba(88, 166, 255, 0.16)",
  popoverShadow: "0 20px 48px rgba(2, 6, 23, 0.5)",
  foldBackground: "rgba(88, 166, 255, 0.18)",
  foldText: "#79c0ff",
} satisfies ThemeComponents["codeBlock"];

export function defineTheme(definition: ThemeDefinition): ThemeConfig {
  const { colors, colorScheme } = definition;
  const defaultComponents: ThemeComponents = {
    input: {
      background: colors.bgPrimary,
      hoverBackground: colors.bgTertiary,
      border: colors.borderColor,
      hoverBorder: colors.textMuted,
      focusBorder: colors.accentColor,
      focusRing: `color-mix(in srgb, ${colors.accentColor} 20%, transparent)`,
      placeholder: colors.textMuted,
    },
    dropdown: {
      background: colors.bgPrimary,
      border: colors.borderColor,
      shadow:
        colorScheme === "light"
          ? "0 4px 8px rgba(0, 0, 0, 0.14)"
          : "0 6px 12px rgba(0, 0, 0, 0.32)",
      hover: colors.hoverBg,
      selected: colors.activeBg,
    },
    selection: {
      hover: colors.hoverBg,
      selected: colors.activeBg,
    },
    codeBlock: colorScheme === "light" ? LIGHT_CODE_BLOCK : DARK_CODE_BLOCK,
  };
  return {
    ...definition,
    components: {
      ...defaultComponents,
      ...definition.components,
      input: { ...defaultComponents.input, ...definition.components?.input },
      dropdown: {
        ...defaultComponents.dropdown,
        ...definition.components?.dropdown,
      },
      selection: {
        ...defaultComponents.selection,
        ...definition.components?.selection,
      },
      codeBlock: {
        ...defaultComponents.codeBlock,
        ...definition.components?.codeBlock,
      },
    },
  };
}

const minimalTheme = defineTheme({
  name: "minimal",
  label: "深黑色",
  colorScheme: "dark",
  preview: {
    bg: "#181818",
    sidebar: "#292929",
    accent: "#8e8e93",
    text: "#d6d6d8",
  },
  colors: {
    bgPrimary: "#181818",
    bgSecondary: "#292929",
    bgTertiary: "#303030",
    textPrimary: "#d6d6d8",
    textSecondary: "#b5b5b9",
    textMuted: "#929297",
    borderColor: "#3a3a3d",
    hoverBg: "#303032",
    activeBg: "#3a3a3d",
    accentColor: "#8e8e93",
  },
  components: {
    input: {
      background: "#222224",
      hoverBackground: "#272729",
      border: "#3a3a3d",
      hoverBorder: "#55555a",
      focusBorder: "#737378",
      focusRing: "rgba(142, 142, 147, 0.18)",
      placeholder: "#929297",
    },
    dropdown: {
      background: "#252527",
      border: "#3c3c40",
      shadow: "0 6px 12px rgba(0, 0, 0, 0.3)",
      hover: "#303032",
      selected: "#3a3a3d",
    },
    selection: {
      hover: "#303032",
      selected: "#3a3a3d",
    },
    codeBlock: {
      background: "#151517",
      text: "#d8d8dc",
      cursor: "#b9b9bd",
      muted: "#8d8d92",
      border: "#333336",
      controlBackground: "#202023",
      controlBorder: "#38383c",
      controlHoverBackground: "#2b2b2e",
      controlHoverText: "#f2f2f4",
      popoverBackground: "#232326",
      popoverHover: "#303034",
      popoverShadow: "0 12px 28px rgba(0, 0, 0, 0.36)",
      foldBackground: "rgba(142, 142, 147, 0.16)",
      foldText: "#c5c5c9",
    },
  },
});

export const themes: Record<ResolvedThemeName, ThemeConfig> = {
  light: defineTheme({
    name: "light",
    label: "浅色",
    colorScheme: "light",
    preview: {
      bg: "#ffffff",
      sidebar: "#f3f3f3",
      accent: "#0366d6",
      text: "#24292e",
    },
    colors: {
      bgPrimary: "#ffffff",
      bgSecondary: "#f3f3f3",
      bgTertiary: "#fafafa",
      textPrimary: "#24292e",
      textSecondary: "#586069",
      textMuted: "#6a737d",
      borderColor: "#e1e4e8",
      hoverBg: "#f6f8fa",
      activeBg: "#e8f0fe",
      accentColor: "#0366d6",
    },
  }),
  dark: defineTheme({
    name: "dark",
    label: "深色",
    colorScheme: "dark",
    preview: {
      bg: "#23272f",
      sidebar: "#1e2228",
      accent: "#6cb4ee",
      text: "#d0d0d0",
    },
    colors: {
      bgPrimary: "#23272f",
      bgSecondary: "#1e2228",
      bgTertiary: "#2c3038",
      textPrimary: "#d0d0d0",
      textSecondary: "#b0b0b0",
      textMuted: "#909090",
      borderColor: "#383c44",
      hoverBg: "#2c3038",
      activeBg: "#383c44",
      accentColor: "#6cb4ee",
    },
  }),
  minimal: minimalTheme,
};

export const themeOptions: ReadonlyArray<{ value: ThemeName; label: string }> =
  [
    { value: "system", label: "跟随系统" },
    ...Object.values(themes).map((theme) => ({
      value: theme.name,
      label: theme.label,
    })),
  ];

export function isThemeName(value: unknown): value is ThemeName {
  return (
    value === "light" ||
    value === "dark" ||
    value === "minimal" ||
    value === "system"
  );
}

export function getThemeConfig(theme: ThemeName): ThemeConfig {
  return themes[theme as ResolvedThemeName] ?? themes.light;
}

export function isDarkTheme(theme: ThemeName): boolean {
  return getThemeConfig(resolveTheme(theme)).colorScheme === "dark";
}

// 系统主题只解析明暗，其余预设保留自身配置，避免扩展主题被折叠为普通深色。
export function resolveTheme(theme: ThemeName): ResolvedThemeName {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}
