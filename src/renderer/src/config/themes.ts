export type ThemeName = "light" | "dark" | "nord" | "dracula" | "solarized";

export interface ThemeConfig {
  name: string;
  label: string;
  preview: {
    bg: string;
    sidebar: string;
    accent: string;
    text: string;
  };
  colors: {
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
  };
  milkdownTheme: "frame" | "frame-dark" | "nord" | "nord-dark";
}

export const themes: Record<ThemeName, ThemeConfig> = {
  light: {
    name: "light",
    label: "Light",
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
    milkdownTheme: "frame",
  },
  dark: {
    name: "dark",
    label: "Dark",
    preview: {
      bg: "#1e1e1e",
      sidebar: "#252526",
      accent: "#569cd6",
      text: "#d4d4d4",
    },
    colors: {
      bgPrimary: "#1e1e1e",
      bgSecondary: "#252526",
      bgTertiary: "#2d2d2d",
      textPrimary: "#d4d4d4",
      textSecondary: "#858585",
      textMuted: "#6a6a6a",
      borderColor: "#3c3c3c",
      hoverBg: "#2a2d2e",
      activeBg: "#094771",
      accentColor: "#569cd6",
    },
    milkdownTheme: "frame-dark",
  },
  nord: {
    name: "nord",
    label: "Nord",
    preview: {
      bg: "#2e3440",
      sidebar: "#3b4252",
      accent: "#88c0d0",
      text: "#eceff4",
    },
    colors: {
      bgPrimary: "#2e3440",
      bgSecondary: "#3b4252",
      bgTertiary: "#434c5e",
      textPrimary: "#eceff4",
      textSecondary: "#d8dee9",
      textMuted: "#7b88a1",
      borderColor: "#4c566a",
      hoverBg: "#434c5e",
      activeBg: "#5e81ac",
      accentColor: "#88c0d0",
    },
    milkdownTheme: "nord-dark",
  },
  dracula: {
    name: "dracula",
    label: "Dracula",
    preview: {
      bg: "#282a36",
      sidebar: "#343746",
      accent: "#bd93f9",
      text: "#f8f8f2",
    },
    colors: {
      bgPrimary: "#282a36",
      bgSecondary: "#343746",
      bgTertiary: "#44475a",
      textPrimary: "#f8f8f2",
      textSecondary: "#bfbfbf",
      textMuted: "#6272a4",
      borderColor: "#44475a",
      hoverBg: "#44475a",
      activeBg: "#6272a4",
      accentColor: "#bd93f9",
    },
    milkdownTheme: "frame-dark",
  },
  solarized: {
    name: "solarized",
    label: "Solarized",
    preview: {
      bg: "#002b36",
      sidebar: "#073642",
      accent: "#2aa198",
      text: "#839496",
    },
    colors: {
      bgPrimary: "#002b36",
      bgSecondary: "#073642",
      bgTertiary: "#586e75",
      textPrimary: "#839496",
      textSecondary: "#93a1a1",
      textMuted: "#657b83",
      borderColor: "#073642",
      hoverBg: "#073642",
      activeBg: "#2aa198",
      accentColor: "#2aa198",
    },
    milkdownTheme: "frame-dark",
  },
};

export function getThemeConfig(theme: ThemeName): ThemeConfig {
  return themes[theme] || themes.light;
}

export function isDarkTheme(theme: ThemeName): boolean {
  return theme !== "light";
}
