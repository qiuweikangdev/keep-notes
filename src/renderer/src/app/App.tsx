import { Tooltip } from "@/components/ui/tooltip";
import { useTheme } from "@/hooks/use-theme";
import { SettingsModal } from "@/features/settings";
import { HomePage } from "@/pages/home";
import { useEffect } from "react";

export function App() {
  const { theme } = useTheme();

  useEffect(() => {
    // 应用主题到 html 元素
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  return (
    <Tooltip.Provider>
      <div className={theme}>
        <HomePage />
        <SettingsModal />
      </div>
    </Tooltip.Provider>
  );
}
