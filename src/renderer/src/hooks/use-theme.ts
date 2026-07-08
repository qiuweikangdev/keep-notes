import { useEffect, useCallback, useState } from "react";
import { useUIStore } from "@/store/ui.store";
import { getThemeConfig, resolveTheme, type ThemeName } from "@/config/themes";

// 所有需要移除的主题类名
const THEME_CLASSES = ["light", "dark", "nord", "dracula", "solarized"];

export function useTheme() {
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  // 跟踪系统实际应用的主题（用于 system 模式下的 UI 显示）
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    resolveTheme(theme),
  );

  // 监听系统主题变化
  useEffect(() => {
    if (theme !== "system") {
      setResolvedTheme(resolveTheme(theme));
      return;
    }

    // system 模式下监听 OS 偏好变化
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = () => {
      setResolvedTheme(resolveTheme("system"));
    };

    mediaQuery.addEventListener("change", handleChange);
    // 初始同步
    setResolvedTheme(resolveTheme("system"));

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  // 应用主题到 DOM
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    // 将 system 解析为实际的 light 或 dark
    const actualTheme = resolveTheme(theme);
    const config = getThemeConfig(actualTheme);

    // 先设置 CSS 变量，再切换 class，避免中间状态闪烁
    // 设置 CSS 变量（内联样式优先级最高，立即生效）
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

    // 移除旧主题类
    root.classList.remove(...THEME_CLASSES);
    body.classList.remove(...THEME_CLASSES);

    // 添加新主题类
    root.classList.add(actualTheme);
    body.classList.add(actualTheme);

    // 设置 data 属性
    root.setAttribute(
      "data-theme",
      theme === "system" ? "system" : actualTheme,
    );

    // 保存到 localStorage
    localStorage.setItem("theme", theme);
  }, [theme, resolvedTheme]);

  // 初始化主题 - 从 localStorage 读取
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

  // 切换主题（在亮色和暗色之间切换，system 视为当前系统主题的反向）
  const toggleTheme = useCallback(() => {
    if (theme === "system") {
      // system 模式下，切换到与当前系统相反的主题
      const newTheme = resolvedTheme === "light" ? "dark" : "light";
      setTheme(newTheme);
    } else {
      const newTheme = theme === "light" ? "dark" : "light";
      setTheme(newTheme);
    }
  }, [theme, resolvedTheme, setTheme]);

  const config = getThemeConfig(resolvedTheme);

  return {
    theme,
    setTheme: changeTheme,
    toggleTheme,
    isDark: resolvedTheme === "dark",
    config,
  };
}
