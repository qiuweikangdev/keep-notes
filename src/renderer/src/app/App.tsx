import { Tooltip } from "@/components/ui/tooltip";
import { DragResizeProvider } from "@/components/drag-resize-provider";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useEditorStore } from "@/store/editor.store";
import { SettingsModal } from "@/features/settings";
import { SearchModal } from "@/features/search";
import {
  ReminderEditorDialog,
  ReminderListDialog,
  ReminderNotificationToast,
} from "@/features/reminders";
import { ExportController, ExportSuccessToast } from "@/features/export";
import { HomePage } from "@/pages/home";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useUIStore } from "@/store/ui.store";
import { useShortcutsStore } from "@/store/shortcuts.store";
import { useReminderStore } from "@/store/reminder.store";
import { APP_BEHAVIOR_CONFIG } from "@/config/app-behavior";

const CODE_BLOCK_CURSOR_VISUAL_WIDTH = 2;

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
  const appearance = useEditorStore((s) => s.appearance);
  const isSettingsOpen = useUIStore((state) => state.isSettingsOpen);
  const shortcuts = useShortcutsStore((s) => s.shortcuts);
  const loadReminders = useReminderStore((s) => s.loadReminders);
  const subscribeToReminderChanges = useReminderStore(
    (s) => s.subscribeToReminderChanges,
  );
  const subscribeToReminderTriggers = useReminderStore(
    (s) => s.subscribeToReminderTriggers,
  );

  // 初始化键盘快捷键
  useKeyboardShortcuts();

  // 平台判断
  const isMac = useMemo(() => {
    return window.electronAPI?.getPlatform() === "darwin";
  }, []);

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

  useEffect(() => {
    const getZoomFactor = window.electronAPI?.getZoomFactor;
    if (!getZoomFactor) return;

    let isActive = true;
    let devicePixelRatio = window.devicePixelRatio;
    const syncCodeBlockCursorWidth = () => {
      void getZoomFactor().then((zoomFactor) => {
        if (!isActive || !Number.isFinite(zoomFactor) || zoomFactor <= 0)
          return;

        // Electron 页面缩放会同步压缩 CSS 像素，按缩放比例反向补偿，保持代码光标约 2 个物理像素宽。
        document.documentElement.style.setProperty(
          "--editor-code-block-cursor-width",
          `${CODE_BLOCK_CURSOR_VISUAL_WIDTH / zoomFactor}px`,
        );
      });
    };
    const handleZoomChange = () => {
      if (window.devicePixelRatio === devicePixelRatio) return;
      devicePixelRatio = window.devicePixelRatio;
      syncCodeBlockCursorWidth();
    };

    syncCodeBlockCursorWidth();
    window.addEventListener("resize", handleZoomChange);

    return () => {
      isActive = false;
      window.removeEventListener("resize", handleZoomChange);
      document.documentElement.style.removeProperty(
        "--editor-code-block-cursor-width",
      );
    };
  }, []);

  useEffect(() => {
    void loadReminders();
    const unsubscribeChanges = subscribeToReminderChanges();
    const unsubscribeTriggers = subscribeToReminderTriggers();
    return () => {
      unsubscribeChanges();
      unsubscribeTriggers();
    };
  }, [loadReminders, subscribeToReminderChanges, subscribeToReminderTriggers]);

  // 监听来自菜单的搜索事件
  useEffect(() => {
    const handleOpenSearch = () => setIsSearchOpen(true);
    window.addEventListener("open-search", handleOpenSearch);
    return () => {
      window.removeEventListener("open-search", handleOpenSearch);
    };
  }, []);

  // 应用透明度到整个窗口
  // macOS 原生窗口自带圆角，不需要设置 borderRadius
  // Windows/Linux 无边框窗口需要 borderRadius 来实现圆角效果
  const windowStyle = {
    backgroundColor: "var(--bg-primary)",
    color: "var(--text-primary)",
    opacity: appearance.opacity / 100,
    height: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    borderRadius: isMac ? "0" : "8px",
  };

  return (
    <Tooltip.Provider delayDuration={300}>
      <DragResizeProvider>
        <div style={windowStyle}>
          <HomePage />
          <SettingsModal />
          <SearchModal
            isOpen={isSearchOpen}
            onClose={() => setIsSearchOpen(false)}
          />
          <ReminderEditorDialog />
          <ReminderListDialog />
          {APP_BEHAVIOR_CONFIG.notifications.showInAppReminderNotification ? (
            <ReminderNotificationToast />
          ) : null}
          <ExportController />
          <ExportSuccessToast />
        </div>
      </DragResizeProvider>
    </Tooltip.Provider>
  );
}
