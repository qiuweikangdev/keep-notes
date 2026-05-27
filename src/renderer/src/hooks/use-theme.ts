import { useEffect, useCallback } from "react";
import { useUIStore } from "@/store/ui.store";
import type { ThemeName } from "@/types";

export function useTheme() {
  const { theme, setTheme, toggleTheme } = useUIStore();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const changeTheme = useCallback(
    (newTheme: ThemeName) => {
      setTheme(newTheme);
    },
    [setTheme],
  );

  return {
    theme,
    setTheme: changeTheme,
    toggleTheme,
    isDark: theme === "dark",
  };
}
