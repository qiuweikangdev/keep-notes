import { Tooltip } from "@/components/ui/tooltip";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useEditorStore } from "@/store/editor.store";
import { SettingsModal } from "@/features/settings";
import { SearchModal } from "@/features/search";
import { HomePage } from "@/pages/home";
import { useEffect, useState, useCallback } from "react";

export function App() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { appearance } = useEditorStore();

  // 初始化键盘快捷键
  useKeyboardShortcuts();

  // 处理搜索快捷键
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isMeta = e.metaKey || e.ctrlKey;

    // Cmd/Ctrl + P: 打开搜索
    if (isMeta && e.key === "p") {
      e.preventDefault();
      setIsSearchOpen(true);
    }

    // Cmd/Ctrl + Shift + F: 打开搜索
    if (isMeta && e.shiftKey && e.key === "F") {
      e.preventDefault();
      setIsSearchOpen(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  // 应用透明度到整个窗口
  const windowStyle = {
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-primary)",
    opacity: appearance.opacity / 100,
    height: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    borderRadius: "8px",
  };

  return (
    <Tooltip.Provider delayDuration={300}>
      <div style={windowStyle}>
        <HomePage />
        <SettingsModal />
        <SearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
        />
      </div>
    </Tooltip.Provider>
  );
}
