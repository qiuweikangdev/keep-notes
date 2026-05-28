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
  const { filePath, setFilePath, resetEditor } = useEditorStore();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

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

      // Cmd/Ctrl + W: 关闭当前文件
      if (isMeta && e.key === "w") {
        e.preventDefault();
        if (filePath) {
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

      // Cmd/Ctrl + S: 保存（虽然有自动保存，但提供手动保存的反馈）
      if (isMeta && e.key === "s") {
        e.preventDefault();
        // 触发保存反馈
        const event = new CustomEvent("app:save");
        window.dispatchEvent(event);
      }
    },
    [
      openFolder,
      treeRoot,
      treeData,
      filePath,
      setFilePath,
      resetEditor,
      toggleCollapse,
      toggleTheme,
    ],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}
