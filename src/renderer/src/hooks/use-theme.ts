import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { getThemeConfig, resolveTheme, type ThemeName } from "@/config/themes";
import { useUIStore } from "@/store/ui.store";

const THEME_CLASSES = ["light", "dark", "nord", "dracula", "solarized"];
const THEME_NAMES: readonly ThemeName[] = [
  "light",
  "dark",
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
  const setTheme = useUIStore((state) => state.setTheme);
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
    root.style.setProperty("--hover-bg", config.colors.hoverBg);
    root.style.setProperty("--active-bg", config.colors.activeBg);
    root.style.setProperty("--accent-color", config.colors.accentColor);

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
  }, [effectiveTheme, resolvedTheme, transparentBackground]);

  const changeTheme = useCallback(
    (newTheme: ThemeName) => {
      setTheme(newTheme);
    },
    [setTheme],
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
    setTheme: changeTheme,
    toggleTheme,
    isDark: resolvedTheme === "dark",
    config: getThemeConfig(resolvedTheme),
  };
}
