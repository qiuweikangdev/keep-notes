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
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useUIStore } from "@/store/ui.store";
import { useShortcutsStore } from "@/store/shortcuts.store";
import { useReminderStore } from "@/store/reminder.store";
import { APP_BEHAVIOR_CONFIG } from "@/config/app-behavior";
import { useTheme } from "@/hooks/use-theme";
import { QuickEditorWindow } from "@/features/editor/components/quick-editor-window";
import { editorFindController } from "@/features/editor/lib/editor-find-controller";
import { requestEditorViewportPreservation } from "@/features/editor/lib/editor-viewport";
import type {
  QuickEditorWindowContent,
  ReminderEditorRequest,
  ThemeName,
} from "@shared/types";

const CODE_BLOCK_CURSOR_VISUAL_WIDTH = 2;
const APP_THEME_NAMES: readonly ThemeName[] = [
  "light",
  "dark",
  "nord",
  "dracula",
  "solarized",
  "system",
];

function getInitialReminderWindowTheme(): ThemeName {
  const theme = new URLSearchParams(window.location.search).get("theme");
  return APP_THEME_NAMES.includes(theme as ThemeName)
    ? (theme as ThemeName)
    : "system";
}

function useReminderWindowTheme(): ThemeName {
  const [theme, setTheme] = useState(getInitialReminderWindowTheme);

  useEffect(() => {
    // 独立渲染进程不依赖 localStorage 事件，直接接收主进程转发的应用主题。
    return window.electronAPI.onReminderWindowThemeChanged(setTheme);
  }, []);

  return theme;
}

function getQuickEditorSourceKey(
  source: NonNullable<QuickEditorWindowContent["source"]>,
): string {
  return `${source.groupId}:${source.tabId}:${source.filePath ?? ""}`;
}

function restoreQuickEditorSource(content: QuickEditorWindowContent): void {
  const state = useEditorStore.getState();
  const source = content.source;
  if (!source) {
    state.openQuickEditorDraft(content.content);
    return;
  }

  const exactMatch = state.panelGroups
    .find((group) => group.id === source.groupId)
    ?.tabs.find(
      (tab) => tab.id === source.tabId && tab.filePath === source.filePath,
    );
  const pathMatch = source.filePath
    ? state.panelGroups
        .flatMap((group) =>
          group.tabs.map((tab) => ({ groupId: group.id, tab })),
        )
        .find(({ tab }) => tab.filePath === source.filePath)
    : undefined;
  const target = exactMatch
    ? { groupId: source.groupId, tab: exactMatch }
    : pathMatch;

  if (!target) {
    state.openQuickEditorDraft(content.content);
    return;
  }

  // 优先恢复原始标签；标签已移动或重建时，再通过文件路径定位同一文档。
  if (target.tab.content !== content.content) {
    if (target.tab.mode === "rich" && target.tab.filePath) {
      // 浮窗实时同步只替换正文，不应把关联富文本面板视为一次用户触发的刷新。
      requestEditorViewportPreservation(target.tab.filePath);
    }
    state.setTabContent(target.groupId, target.tab.id, content.content);
    if (target.tab.filePath) {
      state.syncFileContent(
        target.tab.filePath,
        content.content,
        target.tab.id,
      );
    }
    if (target.tab.mode === "rich") {
      state.incrementTabReloadKey(target.groupId, target.tab.id);
    }
  }
  state.setActiveTab(target.groupId, target.tab.id);
}

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
  const windowType = new URLSearchParams(window.location.search).get("window");

  if (windowType === "reminders") return <ReminderWindowApplication />;
  if (windowType === "reminder-editor") {
    return <ReminderEditorWindowApplication />;
  }
  if (windowType === "quick-editor") return <QuickEditorWindowApplication />;
  return <MainApplication />;
}

function MainApplication() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const appearance = useEditorStore((s) => s.appearance);
  const theme = useUIStore((state) => state.theme);
  const isSettingsOpen = useUIStore((state) => state.isSettingsOpen);
  const shortcuts = useShortcutsStore((s) => s.shortcuts);
  const loadReminders = useReminderStore((s) => s.loadReminders);
  const subscribeToReminderChanges = useReminderStore(
    (s) => s.subscribeToReminderChanges,
  );
  const subscribeToReminderTriggers = useReminderStore(
    (s) => s.subscribeToReminderTriggers,
  );
  const receivedQuickEditorContentsRef = useRef(new Map<string, string>());

  const reminderShortcutKeys = useMemo(
    () =>
      shortcuts.find((shortcut) => shortcut.id === "openReminderWindow")
        ?.keys ?? [],
    [shortcuts],
  );
  const quickEditorShortcutKeys = useMemo(
    () =>
      shortcuts.find((shortcut) => shortcut.id === "openQuickEditorWindow")
        ?.keys ?? [],
    [shortcuts],
  );

  // 初始化键盘快捷键
  useKeyboardShortcuts();

  useEffect(() => {
    // 主进程缓存该配置，供新建和已经打开的提醒浮窗使用。
    window.electronAPI.setReminderWindowTheme(theme);
  }, [theme]);

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

  const openActiveEditorFind = useCallback(() => {
    const editorState = useEditorStore.getState();
    const activeGroup = editorState.panelGroups.find(
      (group) => group.id === editorState.activeGroupId,
    );
    const tabId = activeGroup?.activeTabId;
    if (!activeGroup || !tabId) return;

    editorFindController.open(activeGroup.id, tabId);
  }, []);

  // 处理搜索快捷键
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isSettingsOpen) return;

      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        openActiveEditorFind();
        return;
      }

      const keyString = eventToKeyString(e);
      if (keyString && searchKeyStrings.has(keyString)) {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    },
    [openActiveEditorFind, searchKeyStrings, isSettingsOpen],
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

  useEffect(() => {
    const setGlobalShortcut = window.electronAPI?.setReminderGlobalShortcut;
    if (!setGlobalShortcut) return;

    void setGlobalShortcut(reminderShortcutKeys);
  }, [reminderShortcutKeys]);

  useEffect(() => {
    const setGlobalShortcut = window.electronAPI?.setQuickEditorGlobalShortcut;
    if (!setGlobalShortcut) return;

    void setGlobalShortcut(quickEditorShortcutKeys);
  }, [quickEditorShortcutKeys]);

  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe((state, previousState) => {
      for (const group of state.panelGroups) {
        const previousGroup = previousState.panelGroups.find(
          (item) => item.id === group.id,
        );
        if (!previousGroup) continue;

        for (const tab of group.tabs) {
          const previousTab = previousGroup.tabs.find(
            (item) => item.id === tab.id,
          );
          if (!previousTab || previousTab.content === tab.content) continue;

          const source = {
            groupId: group.id,
            tabId: tab.id,
            filePath: tab.filePath,
          };
          const sourceKey = getQuickEditorSourceKey(source);
          if (
            receivedQuickEditorContentsRef.current.get(sourceKey) ===
            tab.content
          ) {
            receivedQuickEditorContentsRef.current.delete(sourceKey);
            continue;
          }

          window.electronAPI.syncQuickEditorContent({
            content: tab.content,
            source,
          });
        }
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    let isActive = true;
    const importContent = (content: QuickEditorWindowContent) => {
      restoreQuickEditorSource(content);
    };
    const consumeContent = () => {
      void window.electronAPI
        .consumeQuickEditorContent()
        .then((content) => {
          if (isActive && content !== null) importContent(content);
        })
        .catch(() => undefined);
    };
    const unsubscribe =
      window.electronAPI.onQuickEditorContentImported(importContent);

    // 初始化和窗口重新获得焦点时都主动拉取，避免一次性 IPC 通知因热重载或切焦而丢失。
    consumeContent();
    window.addEventListener("focus", consumeContent);

    return () => {
      isActive = false;
      unsubscribe();
      window.removeEventListener("focus", consumeContent);
    };
  }, []);

  useEffect(() => {
    const applyLiveContent = (content: QuickEditorWindowContent) => {
      if (content.source) {
        receivedQuickEditorContentsRef.current.set(
          getQuickEditorSourceKey(content.source),
          content.content,
        );
      }
      restoreQuickEditorSource(content);
    };

    return window.electronAPI.onQuickEditorContentUpdated(applyLiveContent);
  }, []);

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

function ReminderWindowApplication() {
  const [viewKey, setViewKey] = useState(0);
  const loadReminders = useReminderStore((state) => state.loadReminders);
  const subscribeToReminderChanges = useReminderStore(
    (state) => state.subscribeToReminderChanges,
  );
  const openList = useReminderStore((state) => state.openList);
  const theme = useReminderWindowTheme();

  // 独立浮窗使用与主应用相同的主题，并保持透明窗口背景。
  useTheme({ transparentBackground: true, themeOverride: theme });

  useEffect(() => {
    openList();
    window.electronAPI.prewarmReminderEditorWindow?.();
    void loadReminders();
    const unsubscribeChanges = subscribeToReminderChanges();
    const unsubscribeShown = window.electronAPI.onReminderWindowShown?.(() => {
      setViewKey((current) => current + 1);
      openList();
    });

    return () => {
      unsubscribeChanges();
      unsubscribeShown?.();
    };
  }, [loadReminders, openList, subscribeToReminderChanges]);

  return (
    <Tooltip.Provider delayDuration={300}>
      <DragResizeProvider>
        <div className="h-screen w-screen overflow-hidden bg-transparent">
          <ReminderListDialog
            key={viewKey}
            presentation="floating-window"
            onRequestClose={() => window.electronAPI.hideReminderWindow?.()}
          />
        </div>
      </DragResizeProvider>
    </Tooltip.Provider>
  );
}

function ReminderEditorWindowApplication() {
  const [activeRequest, setActiveRequest] =
    useState<ReminderEditorRequest | null>(null);
  const [appliedRequestId, setAppliedRequestId] = useState<number | null>(null);
  const loadReminders = useReminderStore((state) => state.loadReminders);
  const isEditorOpen = useReminderStore((state) => state.isEditorOpen);
  const editingReminderId = useReminderStore(
    (state) => state.editingReminderId,
  );
  const openCreateDialog = useReminderStore((state) => state.openCreateDialog);
  const openEditDialog = useReminderStore((state) => state.openEditDialog);
  const theme = useReminderWindowTheme();

  useTheme({ transparentBackground: true, themeOverride: theme });

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = window.electronAPI.onReminderEditorRequested(
      (request) => {
        // 渲染器声明就绪后主进程才会派发请求，此时提醒数据已经可用于初始化表单。
        if (request.reminderId) {
          openEditDialog(request.reminderId);
        } else {
          openCreateDialog();
        }
        setActiveRequest(request);
      },
    );

    void loadReminders().then(() => {
      if (cancelled) return;
      window.electronAPI.notifyReminderEditorRendererReady();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadReminders, openCreateDialog, openEditDialog]);

  useEffect(() => {
    if (
      activeRequest === null ||
      !isEditorOpen ||
      editingReminderId !== activeRequest.reminderId ||
      appliedRequestId === activeRequest.requestId
    ) {
      return;
    }

    window.electronAPI.notifyReminderEditorRequestApplied(
      activeRequest.requestId,
    );
    setAppliedRequestId(activeRequest.requestId);
  }, [activeRequest, appliedRequestId, editingReminderId, isEditorOpen]);

  useEffect(() => {
    if (
      activeRequest !== null &&
      appliedRequestId === activeRequest.requestId &&
      !isEditorOpen
    ) {
      window.electronAPI.closeReminderEditorWindow();
    }
  }, [activeRequest, appliedRequestId, isEditorOpen]);

  return (
    <Tooltip.Provider delayDuration={300}>
      <DragResizeProvider>
        <div className="h-screen w-screen overflow-hidden bg-transparent">
          <ReminderEditorDialog
            key={activeRequest?.requestId ?? "prewarm"}
            presentation="floating-window"
          />
        </div>
      </DragResizeProvider>
    </Tooltip.Provider>
  );
}

function QuickEditorWindowApplication() {
  useEffect(() => {
    document.title = "快速编辑";
  }, []);

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="h-screen w-screen overflow-hidden bg-transparent">
        <QuickEditorWindow />
      </div>
    </Tooltip.Provider>
  );
}
