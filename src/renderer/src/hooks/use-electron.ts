import { useCallback } from "react";
import { CodeResult } from "@/types";
import type { TreeNode, GitConfig, GitCommitOptions } from "@/types";
import type { ReminderInput } from "@shared/types";
import { useTreeStore } from "@/store/tree.store";
import { useEditorStore } from "@/store/editor.store";
import { useUserStore } from "@/store/user.store";
import {
  editorSaveCoordinator,
  fileOpenController,
  flushEditorChange,
} from "@/features/editor/lib/editor-runtime";
import {
  selectAddRecentFolder,
  selectIncrementReloadKey,
  selectSetContent,
  selectSetFilePath,
  selectSetTreeData,
  selectSetTreeRoot,
} from "./electron-store-selectors";

let watchedWorkspacePath: string | null = null;
let unsubscribeWorkspaceChanged: (() => void) | null = null;
let workspaceRefreshInFlight = false;
let pendingWorkspaceRefreshPath: string | null = null;

async function refreshWorkspaceTree(rootPath: string): Promise<void> {
  if (workspaceRefreshInFlight) {
    pendingWorkspaceRefreshPath = rootPath;
    return;
  }

  workspaceRefreshInFlight = true;
  try {
    const currentRoot = useTreeStore.getState().treeRoot;
    if (currentRoot?.key !== rootPath) return;

    const result = await window.electronAPI.generateTree(rootPath);
    const latestRoot = useTreeStore.getState().treeRoot;
    if (
      result.code === CodeResult.Success &&
      result.data &&
      latestRoot?.key === rootPath
    ) {
      // 工作区事件只刷新树结构，不触碰编辑器内容，避免外部保存时界面闪动。
      useTreeStore.getState().setTreeData(result.data.treeData);
      useTreeStore.getState().setTreeRoot(result.data.treeRoot);
    }
  } finally {
    workspaceRefreshInFlight = false;
    const pendingPath = pendingWorkspaceRefreshPath;
    pendingWorkspaceRefreshPath = null;
    if (pendingPath && useTreeStore.getState().treeRoot?.key === pendingPath) {
      void refreshWorkspaceTree(pendingPath);
    }
  }
}

function ensureWorkspaceChangeSubscription(): void {
  if (unsubscribeWorkspaceChanged) return;

  unsubscribeWorkspaceChanged = window.electronAPI.onWorkspaceChanged(
    (rootPath) => {
      void refreshWorkspaceTree(rootPath);
    },
  );
}

async function startWorkspaceWatch(rootPath: string): Promise<void> {
  ensureWorkspaceChangeSubscription();

  if (watchedWorkspacePath === rootPath) return;
  if (watchedWorkspacePath) {
    await window.electronAPI.unwatchWorkspace(watchedWorkspacePath);
  }

  watchedWorkspacePath = rootPath;
  await window.electronAPI.watchWorkspace(rootPath);
}

export function useElectron() {
  // 公共 hook 只订阅稳定 action，避免调用方随完整 store 的每次变化重渲染。
  const setTreeData = useTreeStore(selectSetTreeData);
  const setTreeRoot = useTreeStore(selectSetTreeRoot);
  const addRecentFolder = useTreeStore(selectAddRecentFolder);
  const setContent = useEditorStore(selectSetContent);
  const setFilePath = useEditorStore(selectSetFilePath);
  const incrementReloadKey = useEditorStore(selectIncrementReloadKey);
  const githubInfo = useUserStore((state) => state.githubInfo);

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
      await startWorkspaceWatch(result.data.treeRoot.key);
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
        await startWorkspaceWatch(result.data.treeRoot.key);
      }
    },
    [setTreeData, setTreeRoot, addRecentFolder],
  );

  const openFile = useCallback(
    async (filePath: string, targetGroupId?: string) => {
      let state = useEditorStore.getState();
      let targetGroup = targetGroupId
        ? state.panelGroups.find((group) => group.id === targetGroupId)
        : state.panelGroups.find((group) => group.id === state.activeGroupId);

      if (targetGroup && targetGroup.tabs.length === 0) {
        state.addTab(targetGroup.id);
        state = useEditorStore.getState();
        targetGroup = state.panelGroups.find(
          (group) => group.id === targetGroup!.id,
        );
      }

      if (targetGroup) {
        const tabId = targetGroup.activeTabId;
        const activeTab = targetGroup.tabs.find((tab) => tab.id === tabId);

        if (
          (activeTab?.filePath === filePath &&
            activeTab.loadStatus === "ready") ||
          activeTab?.pendingFilePath === filePath
        ) {
          state.setActiveTab(targetGroup.id, tabId);
          useTreeStore.getState().setSelectedKey(filePath);
          return;
        }

        // 复用标签前先冲刷旧文件，避免尚未到期的自动保存丢失。
        if (activeTab?.filePath) {
          await flushEditorChange(targetGroup.id, tabId);
          await editorSaveCoordinator.flush(activeTab.filePath);
        }

        state = useEditorStore.getState();
        state.setActiveTab(targetGroup.id, tabId);
        state.beginTabLoad(targetGroup.id, tabId, filePath);
        useTreeStore.getState().setSelectedKey(filePath);

        await fileOpenController.open({
          groupId: targetGroup.id,
          tabId,
          path: filePath,
          onSuccess: (content) => {
            useEditorStore
              .getState()
              .completeTabLoad(targetGroup!.id, tabId, filePath, content);
          },
          onError: (error) => {
            const editorState = useEditorStore.getState();
            editorState.failTabLoad(
              targetGroup!.id,
              tabId,
              filePath,
              error.message,
            );
            const retainedTab = useEditorStore
              .getState()
              .panelGroups.find((group) => group.id === targetGroup!.id)
              ?.tabs.find((tab) => tab.id === tabId);
            useTreeStore
              .getState()
              .setSelectedKey(retainedTab?.filePath ?? null);
          },
        });
      } else {
        const content = await window.electronAPI.readFile(filePath);
        setContent(content);
        setFilePath(filePath);
        incrementReloadKey();
      }
    },
    [setContent, setFilePath, incrementReloadKey],
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

  const copyPath = useCallback(async (targetPath: string) => {
    return window.electronAPI.copyPath(targetPath);
  }, []);

  const openInNewWindow = useCallback(async (targetPath: string) => {
    return window.electronAPI.openInNewWindow(targetPath);
  }, []);

  const listReminders = useCallback(async () => {
    return window.electronAPI.listReminders();
  }, []);

  const createReminder = useCallback(async (input: ReminderInput) => {
    return window.electronAPI.createReminder(input);
  }, []);

  const updateReminder = useCallback(
    async (id: string, input: Partial<ReminderInput>) => {
      return window.electronAPI.updateReminder(id, input);
    },
    [],
  );

  const deleteReminder = useCallback(async (id: string) => {
    return window.electronAPI.deleteReminder(id);
  }, []);

  const completeReminder = useCallback(async (id: string) => {
    return window.electronAPI.completeReminder(id);
  }, []);

  const onRemindersChanged = useCallback(
    (callback: Parameters<typeof window.electronAPI.onRemindersChanged>[0]) => {
      return window.electronAPI.onRemindersChanged(callback);
    },
    [],
  );

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

  // 取消文件暂存
  const unstageFiles = useCallback(async (dirPath: string, files: string[]) => {
    return window.gitAPI.unstageFiles(dirPath, files);
  }, []);

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

  // 获取文件在 HEAD 中的内容
  const getFileHeadContent = useCallback(
    async (dirPath: string, filePath: string) => {
      return window.gitAPI.getFileHeadContent(dirPath, filePath);
    },
    [],
  );

  // 放弃更改
  const discardChanges = useCallback(
    async (dirPath: string, filePath: string) => {
      return window.gitAPI.discardChanges(dirPath, filePath);
    },
    [],
  );

  // 打开文件
  const openGitFile = useCallback(async (dirPath: string, filePath: string) => {
    return window.gitAPI.openFile(dirPath, filePath);
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
    copyPath,
    openInNewWindow,
    listReminders,
    createReminder,
    updateReminder,
    deleteReminder,
    completeReminder,
    onRemindersChanged,
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
    unstageFiles,
    commitChanges,
    pushToRemote,
    pullFromRemote,
    getFileDiff,
    getFileHeadContent,
    discardChanges,
    openGitFile,
  };
}
