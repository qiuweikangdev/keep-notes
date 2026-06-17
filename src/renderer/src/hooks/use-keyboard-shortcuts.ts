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

export function useKeyboardShortcuts() {
  const { openFolder } = useElectron();
  const { toggleCollapse } = usePanel();
  const { toggleTheme } = useTheme();
  const { treeRoot, treeData } = useTreeStore();
  const {
    filePath,
    setFilePath,
    resetEditor,
    content,
    panelGroups,
    activeGroupId,
    removeTab,
  } = useEditorStore();
  const { isSettingsOpen, setSettingsOpen } = useUIStore();
  const shortcutMap = useShortcutMap();

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
          const activeGroup = panelGroups.find((g) => g.id === activeGroupId);
          if (activeGroup) {
            removeTab(activeGroup.id, activeGroup.activeTabId);
          } else if (filePath) {
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
          window.electronAPI.saveAs(content).then((result) => {
            if (result.code === 0 && result.data) {
              useEditorStore.getState().setFilePath(result.data.filePath);
              useEditorStore.getState().setDirty(false);
            }
          });
          break;

        case "openSearch":
        case "openSearchAlt":
          // 搜索快捷键在 App.tsx 中单独处理（需要设置 state）
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
      filePath,
      content,
      setFilePath,
      resetEditor,
      toggleCollapse,
      toggleTheme,
      panelGroups,
      activeGroupId,
      removeTab,
      isSettingsOpen,
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
          window.electronAPI.saveAs(content).then((result) => {
            if (result.code === 0 && result.data) {
              useEditorStore.getState().setFilePath(result.data.filePath);
              useEditorStore.getState().setDirty(false);
            }
          });
          break;

        case "saveAs":
          window.electronAPI.saveAs(content).then((result) => {
            if (result.code === 0 && result.data) {
              useEditorStore.getState().setFilePath(result.data.filePath);
              useEditorStore.getState().setDirty(false);
            }
          });
          break;

        case "closeTab": {
          const activeGroup = panelGroups.find((g) => g.id === activeGroupId);
          if (activeGroup) {
            removeTab(activeGroup.id, activeGroup.activeTabId);
          } else if (filePath) {
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
    content,
    filePath,
    openFolder,
    panelGroups,
    activeGroupId,
    removeTab,
    setFilePath,
    resetEditor,
    toggleCollapse,
    toggleTheme,
    setSettingsOpen,
  ]);
}
