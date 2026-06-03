import { useEffect, useCallback } from "react";
import { useTreeStore } from "@/store/tree.store";
import { useEditorStore } from "@/store/editor.store";
import { useUIStore } from "@/store/ui.store";
import { useElectron } from "@/hooks/use-electron";
import { usePanel } from "@/hooks/use-panel";

export function useKeyboardShortcuts() {
  const { openFolder } = useElectron();
  const { toggleCollapse } = usePanel();
  const { toggleTheme } = useUIStore();
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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + R: 禁止页面刷新
      if (isMeta && e.key === "r") {
        e.preventDefault();
        return;
      }

      // Cmd/Ctrl + N: 新建文件
      if (isMeta && e.key === "n") {
        e.preventDefault();
        if (treeRoot) {
          const title = prompt("请输入文件名:");
          if (title) {
            // 触发新建文件
            window.electronAPI.createFile(treeRoot.key, title, treeData);
          }
        }
      }

      // Cmd/Ctrl + O: 打开文件夹
      if (isMeta && e.key === "o") {
        e.preventDefault();
        openFolder();
      }

      // Cmd/Ctrl + W: 关闭当前聚焦面板的标签页
      if (isMeta && e.key === "w") {
        e.preventDefault();
        const activeGroup = panelGroups.find((g) => g.id === activeGroupId);
        if (activeGroup) {
          removeTab(activeGroup.id, activeGroup.activeTabId);
        } else if (filePath) {
          // 兼容旧模式
          setFilePath(null);
          resetEditor();
        }
      }

      // Cmd/Ctrl + B: 切换侧边栏
      if (isMeta && e.key === "b") {
        e.preventDefault();
        toggleCollapse();
      }

      // Cmd/Ctrl + Shift + L: 切换主题
      if (isMeta && e.shiftKey && e.key === "L") {
        e.preventDefault();
        toggleTheme();
      }

      // Cmd/Ctrl + S: 保存文件（弹出系统保存对话框）
      if (isMeta && e.key === "s") {
        e.preventDefault();
        // 弹出系统保存对话框
        window.electronAPI.saveAs(content).then((result) => {
          if (result.code === 0 && result.data) {
            // 保存成功，更新 filePath
            useEditorStore.getState().setFilePath(result.data.filePath);
            useEditorStore.getState().setDirty(false);
          }
        });
      }
    },
    [
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
    ],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}
