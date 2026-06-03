import { Tooltip } from "@/components/ui/tooltip";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useEditorStore } from "@/store/editor.store";
import { SettingsModal } from "@/features/settings";
import { SearchModal } from "@/features/search";
import { HomePage } from "@/pages/home";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useUIStore } from "@/store/ui.store";
import { useShortcutsStore } from "@/store/shortcuts.store";

/**
 * 将 KeyboardEvent 转换为内部快捷键字符串
 */
function eventToKeyString(e: KeyboardEvent): string | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CmdOrCtrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");

  let keyName = e.key;
  if (keyName === " ") keyName = "Space";
  else if (keyName === "Escape") keyName = "Escape";
  else if (keyName.length === 1) keyName = keyName.toUpperCase();
  else return null;

  if (parts.length === 0) return null;
  parts.push(keyName);
  return parts.join("+");
}

export function App() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { appearance } = useEditorStore();
  const { isSettingsOpen } = useUIStore();
  const shortcuts = useShortcutsStore((s) => s.shortcuts);

  // 初始化键盘快捷键
  useKeyboardShortcuts();

  // 构建搜索快捷键集合
  const searchKeyStrings = useMemo(() => {
    const keys = new Set<string>();
    for (const s of shortcuts) {
      if (s.id === "openSearch" || s.id === "openSearchAlt") {
        for (const k of s.keys) {
          keys.add(k);
        }
      }
    }
    return keys;
  }, [shortcuts]);

  // 处理搜索快捷键
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isSettingsOpen) return;

      const keyString = eventToKeyString(e);
      if (keyString && searchKeyStrings.has(keyString)) {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    },
    [searchKeyStrings, isSettingsOpen],
  );

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
