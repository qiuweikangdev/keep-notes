import { useEffect, useCallback, useMemo } from "react";
import { useTreeStore } from "@/store/tree.store";
import { useEditorStore } from "@/store/editor.store";
import { useUIStore } from "@/store/ui.store";
import { useElectron } from "@/hooks/use-electron";
import { usePanel } from "@/hooks/use-panel";
import { useTheme } from "@/hooks/use-theme";
import {
  useShortcutsStore,
  type ShortcutAction,
} from "@/store/shortcuts.store";
import {
  editorSaveCoordinator,
  flushEditorChange,
} from "@/features/editor/lib/editor-runtime";

/**
 * 将 KeyboardEvent 转换为内部快捷键字符串
 * 例如按 Ctrl+Shift+L -> "CmdOrCtrl+Shift+L"
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
  else if (keyName === "Backspace") keyName = "Backspace";
  else if (keyName === "Delete") keyName = "Delete";
  else if (keyName === "Enter") keyName = "Enter";
  else if (keyName === "Tab") keyName = "Tab";
  else if (keyName.startsWith("Arrow")) keyName = keyName;
  else if (keyName === "/") keyName = "/";
  else if (keyName === "\\") keyName = "\\";
  else if (keyName.length === 1) keyName = keyName.toUpperCase();
  else return null;

  if (parts.length === 0) return null;
  parts.push(keyName);
  return parts.join("+");
}

/** 获取所有快捷键配置并构建 keyString -> action 的映射 */
function useShortcutMap(): Map<string, ShortcutAction> {
  const shortcuts = useShortcutsStore((s) => s.shortcuts);

  return useMemo(() => {
    const map = new Map<string, ShortcutAction>();
    for (const shortcut of shortcuts) {
      for (const keyCombo of shortcut.keys) {
        // 一个快捷键可能有多个绑定，全部注册
        if (!map.has(keyCombo)) {
          map.set(keyCombo, shortcut.id);
        }
      }
    }
    return map;
  }, [shortcuts]);
}

function getActiveEditorTarget() {
  const state = useEditorStore.getState();
  const activeGroup = state.panelGroups.find(
    (group) => group.id === state.activeGroupId,
  );
  const activeTab = activeGroup?.tabs.find(
    (tab) => tab.id === activeGroup.activeTabId,
  );

  if (activeGroup && activeTab) {
    return {
      groupId: activeGroup.id,
      tabId: activeTab.id,
      filePath: activeTab.filePath,
      content: activeTab.content,
    };
  }

  return {
    groupId: null,
    tabId: null,
    filePath: state.filePath,
    content: state.content,
  };
}

function markSaveAsSuccess(filePath: string) {
  const state = useEditorStore.getState();
  const activeGroup = state.panelGroups.find(
    (group) => group.id === state.activeGroupId,
  );

  if (activeGroup) {
    state.setTabFilePath(activeGroup.id, activeGroup.activeTabId, filePath);
    state.setTabDirty(activeGroup.id, activeGroup.activeTabId, false);
    return;
  }

  state.setFilePath(filePath);
  state.setDirty(false);
}

export function useKeyboardShortcuts() {
  const { openFolder } = useElectron();
  const { toggleCollapse } = usePanel();
  const { toggleTheme } = useTheme();
  const treeRoot = useTreeStore((state) => state.treeRoot);
  const treeData = useTreeStore((state) => state.treeData);
  const setFilePath = useEditorStore((state) => state.setFilePath);
  const resetEditor = useEditorStore((state) => state.resetEditor);
  const removeTab = useEditorStore((state) => state.removeTab);
  const isSettingsOpen = useUIStore((state) => state.isSettingsOpen);
  const setSettingsOpen = useUIStore((state) => state.setSettingsOpen);
  const shortcutMap = useShortcutMap();

  const saveActiveEditorAs = useCallback(async () => {
    const target = getActiveEditorTarget();
    if (target.groupId && target.tabId) {
      // 先冲刷编辑器内部的延迟序列化，确保保存弹窗写入的是最新内容。
      await flushEditorChange(target.groupId, target.tabId);
    }

    const latestTarget = getActiveEditorTarget();
    const result = await window.electronAPI.saveAs(latestTarget.content);
    if (result.code === 0 && result.data) {
      markSaveAsSuccess(result.data.filePath);
    }
  }, []);

  const saveActiveEditorFile = useCallback(async () => {
    const target = getActiveEditorTarget();
    if (!target.filePath) {
      await saveActiveEditorAs();
      return;
    }

    if (target.groupId && target.tabId) {
      // 手动保存需要立刻落盘，不能等待自动保存的防抖窗口。
      await flushEditorChange(target.groupId, target.tabId);
    }

    const latestTarget = getActiveEditorTarget();
    const filePath = latestTarget.filePath ?? target.filePath;
    editorSaveCoordinator.schedule(filePath, latestTarget.content);
    await editorSaveCoordinator.flush(filePath);
  }, [saveActiveEditorAs]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // 设置弹窗打开时禁用全局快捷键
      if (isSettingsOpen) return;

      const keyString = eventToKeyString(e);
      if (!keyString) return;

      const action = shortcutMap.get(keyString);
      if (!action) return;

      // 执行对应的快捷键动作
      switch (action) {
        case "newFile":
          e.preventDefault();
          if (treeRoot) {
            const title = prompt("请输入文件名:");
            if (title) {
              window.electronAPI.createFile(treeRoot.key, title, treeData);
            }
          }
          break;

        case "openFolder":
          e.preventDefault();
          openFolder();
          break;

        case "closeTab": {
          e.preventDefault();
          const state = useEditorStore.getState();
          const activeGroup = state.panelGroups.find(
            (g) => g.id === state.activeGroupId,
          );
          if (activeGroup) {
            removeTab(activeGroup.id, activeGroup.activeTabId);
          } else if (state.filePath) {
            setFilePath(null);
            resetEditor();
          }
          break;
        }

        case "toggleSidebar":
          e.preventDefault();
          toggleCollapse();
          break;

        case "toggleTheme":
          e.preventDefault();
          toggleTheme();
          break;

        case "saveFile":
          e.preventDefault();
          void saveActiveEditorFile();
          break;

        case "openSearch":
        case "openSearchAlt":
          // 搜索快捷键在 App.tsx 中单独处理（需要设置 state）
          break;

        case "openReminderWindow":
          e.preventDefault();
          window.electronAPI.showReminderWindow?.();
          break;

        case "openQuickEditorWindow":
          e.preventDefault();
          window.electronAPI.showQuickEditorWindow?.();
          break;

        case "navigateBack":
          e.preventDefault();
          window.__navigateBack?.();
          break;

        case "navigateForward":
          e.preventDefault();
          window.__navigateForward?.();
          break;
      }
    },
    [
      shortcutMap,
      openFolder,
      treeRoot,
      treeData,
      setFilePath,
      resetEditor,
      toggleCollapse,
      toggleTheme,
      removeTab,
      isSettingsOpen,
      saveActiveEditorFile,
    ],
  );

  // 监听键盘快捷键
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  // 监听 macOS 应用菜单动作
  useEffect(() => {
    if (!window.electronAPI?.onMenuAction) return;

    const unsubscribe = window.electronAPI.onMenuAction((action) => {
      switch (action) {
        case "newFile":
          if (treeRoot) {
            const title = prompt("请输入文件名:");
            if (title) {
              window.electronAPI.createFile(treeRoot.key, title, treeData);
            }
          }
          break;

        case "openFolder":
          openFolder();
          break;

        case "saveFile":
          void saveActiveEditorFile();
          break;

        case "saveAs":
          void saveActiveEditorAs();
          break;

        case "closeTab": {
          const state = useEditorStore.getState();
          const activeGroup = state.panelGroups.find(
            (g) => g.id === state.activeGroupId,
          );
          if (activeGroup) {
            removeTab(activeGroup.id, activeGroup.activeTabId);
          } else if (state.filePath) {
            setFilePath(null);
            resetEditor();
          }
          break;
        }

        case "toggleSidebar":
          toggleCollapse();
          break;

        case "openSearch":
          // 触发搜索弹窗 - 通过自定义事件
          window.dispatchEvent(new CustomEvent("open-search"));
          break;

        case "toggleTheme":
          toggleTheme();
          break;

        case "openSettings":
          setSettingsOpen(true);
          break;
      }
    });

    return unsubscribe;
  }, [
    treeRoot,
    treeData,
    openFolder,
    removeTab,
    setFilePath,
    resetEditor,
    toggleCollapse,
    toggleTheme,
    setSettingsOpen,
    saveActiveEditorFile,
    saveActiveEditorAs,
  ]);
}
