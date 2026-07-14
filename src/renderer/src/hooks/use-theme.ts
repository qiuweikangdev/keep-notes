import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { getThemeConfig, resolveTheme, type ThemeName } from "@/config/themes";
import { useUIStore } from "@/store/ui.store";

const THEME_CLASSES = ["light", "dark", "nord", "dracula", "solarized"];

export function useTheme() {
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const [, refreshSystemTheme] = useState(0);

  // 每次渲染都同步解析主题，避免主题变量和 BlockNote 的色彩方案出现短暂错位。
  const resolvedTheme = resolveTheme(theme);

  useEffect(() => {
    if (theme !== "system") return;

    // 仅在跟随系统时订阅系统配色变化，通过刷新触发一次同步重新解析。
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      refreshSystemTheme((version) => version + 1);
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

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

    body.style.backgroundColor = config.colors.bgPrimary;
    body.style.color = config.colors.textPrimary;

    root.classList.remove(...THEME_CLASSES);
    body.classList.remove(...THEME_CLASSES);
    root.classList.add(resolvedTheme);
    body.classList.add(resolvedTheme);
    root.setAttribute(
      "data-theme",
      theme === "system" ? "system" : resolvedTheme,
    );

    localStorage.setItem("theme", theme);
  }, [theme, resolvedTheme]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as ThemeName | null;
    if (savedTheme && savedTheme !== theme) {
      setTheme(savedTheme);
    }
  }, []);

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
