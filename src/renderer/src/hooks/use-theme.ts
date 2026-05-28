import { useEffect, useCallback } from "react";
import { useUIStore } from "@/store/ui.store";
import { getThemeConfig, isDarkTheme, type ThemeName } from "@/config/themes";

export function useTheme() {
  const { theme, setTheme } = useUIStore();

  // 应用主题到 DOM
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const config = getThemeConfig(theme);

    // 移除旧主题类
    root.classList.remove("light", "dark", "nord", "dracula", "solarized");
    body.classList.remove("light", "dark", "nord", "dracula", "solarized");

    // 添加新主题类
    root.classList.add(theme);
    body.classList.add(theme);

    // 设置 data 属性
    root.setAttribute("data-theme", theme);

    // 设置 CSS 变量
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

    // 设置 body 背景色
    body.style.backgroundColor = config.colors.bgPrimary;
    body.style.color = config.colors.textPrimary;

    // 保存到 localStorage
    localStorage.setItem("theme", theme);
  }, [theme]);

  // 初始化主题 - 从 localStorage 读取
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as ThemeName | null;
    if (savedTheme && savedTheme !== theme) {
      setTheme(savedTheme);
    }
    // eslint-disable-next-line
  }, []);

  const changeTheme = useCallback(
    (newTheme: ThemeName) => {
      setTheme(newTheme);
    },
    [setTheme],
  );

  const config = getThemeConfig(theme);

  return {
    theme,
    setTheme: changeTheme,
    isDark: isDarkTheme(theme),
    config,
    milkdownTheme: config.milkdownTheme,
  };
}
