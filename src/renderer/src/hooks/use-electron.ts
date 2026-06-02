import { useCallback } from "react";
import { CodeResult } from "@/types";
import type {
  TreeNode,
  GitConfig,
  GitStatus,
  GitBranch,
  GitCommitOptions,
  GitDetectResult,
} from "@/types";
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

  // 原有的 Git 下载和上传方法
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

  // 新增的 Git 操作方法

  // 检测是否为 Git 仓库
  const detectGitRepo = useCallback(async (dirPath: string) => {
    return window.gitAPI.detect(dirPath);
  }, []);

  // 获取当前分支
  const getCurrentBranch = useCallback(async (dirPath: string) => {
    return window.gitAPI.getCurrentBranch(dirPath);
  }, []);

  // 获取所有分支
  const getBranches = useCallback(async (dirPath: string) => {
    return window.gitAPI.getBranches(dirPath);
  }, []);

  // 切换分支
  const switchBranch = useCallback(
    async (dirPath: string, branchName: string) => {
      return window.gitAPI.switchBranch(dirPath, branchName);
    },
    [],
  );

  // 创建新分支
  const createBranch = useCallback(
    async (dirPath: string, branchName: string) => {
      return window.gitAPI.createBranch(dirPath, branchName);
    },
    [],
  );

  // 获取 Git 状态
  const getGitStatus = useCallback(async (dirPath: string) => {
    return window.gitAPI.getStatus(dirPath);
  }, []);

  // 添加文件到暂存区
  const addFilesToStaging = useCallback(
    async (dirPath: string, files: string[]) => {
      return window.gitAPI.addFiles(dirPath, files);
    },
    [],
  );

  // 提交更改
  const commitChanges = useCallback(
    async (dirPath: string, options: GitCommitOptions) => {
      return window.gitAPI.commit(dirPath, options);
    },
    [],
  );

  // 推送到远程
  const pushToRemote = useCallback(async (dirPath: string) => {
    return window.gitAPI.push(dirPath);
  }, []);

  // 从远程拉取
  const pullFromRemote = useCallback(async (dirPath: string) => {
    return window.gitAPI.pull(dirPath);
  }, []);

  // 获取文件差异
  const getFileDiff = useCallback(async (dirPath: string, filePath: string) => {
    return window.gitAPI.getFileDiff(dirPath, filePath);
  }, []);

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
    // 新增的 Git 操作方法
    detectGitRepo,
    getCurrentBranch,
    getBranches,
    switchBranch,
    createBranch,
    getGitStatus,
    addFilesToStaging,
    commitChanges,
    pushToRemote,
    pullFromRemote,
    getFileDiff,
  };
}
