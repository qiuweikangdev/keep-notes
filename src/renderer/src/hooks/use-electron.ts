import { useCallback } from "react";
import { CodeResult } from "@/types";
import type { TreeNode, GitConfig } from "@/types";
import { useTreeStore } from "@/store/tree.store";
import { useEditorStore } from "@/store/editor.store";
import { useUserStore } from "@/store/user.store";

export function useElectron() {
  const { setTreeData, setTreeRoot, addRecentFolder } = useTreeStore();
  const { setContent, setFilePath } = useEditorStore();
  const { githubInfo } = useUserStore();

  const openFolder = useCallback(async () => {
    const result = await window.electronAPI.openDialog();
    if (result.code === CodeResult.Success && result.data) {
      setTreeData(result.data.treeData);
      setTreeRoot(result.data.treeRoot);
      // 记录到最近使用的目录
      addRecentFolder({
        title: result.data.treeRoot.title,
        path: result.data.treeRoot.key,
      });
      return result.data.selectedPath;
    }
    return null;
  }, [setTreeData, setTreeRoot, addRecentFolder]);

  const loadTree = useCallback(
    async (path: string) => {
      const result = await window.electronAPI.generateTree(path);
      if (result.code === CodeResult.Success && result.data) {
        setTreeData(result.data.treeData);
        setTreeRoot(result.data.treeRoot);
        // 记录到最近使用的目录
        addRecentFolder({
          title: result.data.treeRoot.title,
          path: result.data.treeRoot.key,
        });
      }
    },
    [setTreeData, setTreeRoot, addRecentFolder],
  );

  const openFile = useCallback(
    async (filePath: string) => {
      const content = await window.electronAPI.readFile(filePath);
      setContent(content);
      setFilePath(filePath);
    },
    [setContent, setFilePath],
  );

  const saveFile = useCallback(async (content: string) => {
    const { filePath } = useEditorStore.getState();
    if (filePath) {
      await window.electronAPI.writeFile(filePath, content);
    }
  }, []);

  const createFile = useCallback(
    async (path: string, title: string, treeData: TreeNode[]) => {
      return window.electronAPI.createFile(path, title, treeData);
    },
    [],
  );

  const createFolder = useCallback(
    async (path: string, title: string, treeData: TreeNode[]) => {
      return window.electronAPI.createFolder(path, title, treeData);
    },
    [],
  );

  const renameItem = useCallback(
    async (path: string, title: string, treeData: TreeNode[]) => {
      return window.electronAPI.rename(path, title, treeData);
    },
    [],
  );

  const deleteItem = useCallback(
    async (path: string, title: string, treeData: TreeNode[]) => {
      return window.electronAPI.delete(path, title, treeData);
    },
    [],
  );

  const moveItem = useCallback(
    async (sourcePath: string, targetPath: string, treeData: TreeNode[]) => {
      return window.electronAPI.move(sourcePath, targetPath, treeData);
    },
    [],
  );

  const openInExplorer = useCallback(async (targetPath: string) => {
    return window.electronAPI.openInExplorer(targetPath);
  }, []);

  const gitDownload = useCallback(async () => {
    const config: GitConfig = {
      username: githubInfo.username,
      email: githubInfo.email,
      localPath: githubInfo.localPath,
      repoUrl: githubInfo.repoUrl,
    };
    return window.gitAPI.download(config);
  }, [githubInfo]);

  const gitUpload = useCallback(async () => {
    const config: GitConfig = {
      username: githubInfo.username,
      email: githubInfo.email,
      localPath: githubInfo.localPath,
      repoUrl: githubInfo.repoUrl,
    };
    return window.gitAPI.upload(config);
  }, [githubInfo]);

  return {
    openFolder,
    loadTree,
    openFile,
    saveFile,
    createFile,
    createFolder,
    renameItem,
    deleteItem,
    moveItem,
    openInExplorer,
    gitDownload,
    gitUpload,
  };
}
