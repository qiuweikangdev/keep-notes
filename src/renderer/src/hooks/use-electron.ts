import { useCallback } from "react";
import { CodeResult } from "@/types";
import type {
  TreeNode,
  GitConfig,
  GitCommitOptions,
  GitCommitFileStatus,
  GitFileContentSource,
} from "@/types";
import type { ReminderInput, WorkspaceChangeBatch } from "@shared/types";
import { useTreeStore } from "@/store/tree.store";
import { useEditorStore } from "@/store/editor.store";
import { useUserStore } from "@/store/user.store";
import {
  editorSaveCoordinator,
  fileOpenController,
  flushEditorChange,
} from "@/features/editor/lib/editor-runtime";
import { selectFileOpenTabId } from "@/features/editor/lib/editor-tab-opening";
import { findNodeByKey } from "@/features/file-tree/utils";
import { getDirectoriesToRefresh } from "@/features/file-tree/tree-data";
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
let pendingWorkspaceChangeBatch: WorkspaceChangeBatch | null = null;
const directoryLoadPromises = new Map<string, Promise<boolean>>();
let fullTreeLoad: { rootPath: string; promise: Promise<boolean> } | undefined;

function mergeWorkspaceChangeBatches(
  current: WorkspaceChangeBatch | null,
  incoming: WorkspaceChangeBatch,
): WorkspaceChangeBatch {
  if (!current || current.rootPath !== incoming.rootPath) return incoming;

  const eventsByPath = new Map(
    current.events.map((event) => [event.path, event]),
  );
  for (const event of incoming.events) {
    const previous = eventsByPath.get(event.path);
    eventsByPath.set(event.path, {
      ...event,
      eventType: previous?.eventType === "rename" ? "rename" : event.eventType,
    });
  }

  return {
    rootPath: incoming.rootPath,
    events: [...eventsByPath.values()],
    hasUnknownPath: current.hasUnknownPath || incoming.hasUnknownPath,
  };
}

async function loadDirectoryChildren(
  directoryPath: string,
  force = false,
): Promise<boolean> {
  const state = useTreeStore.getState();
  const rootPath = state.treeRoot?.key;
  if (!rootPath) return false;

  if (!force && directoryPath !== rootPath) {
    const directoryNode = findNodeByKey(state.treeData, directoryPath);
    if (directoryNode?.isLoaded) return true;
  }

  const requestKey = `${rootPath}\u0000${directoryPath}`;
  const existingRequest = directoryLoadPromises.get(requestKey);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    let loadingTimer: ReturnType<typeof setTimeout> | undefined;
    if (directoryPath !== rootPath) {
      loadingTimer = setTimeout(() => {
        if (useTreeStore.getState().treeRoot?.key === rootPath) {
          useTreeStore.getState().setDirectoryLoading(directoryPath, true);
        }
      }, 120);
    }

    try {
      const result = await window.electronAPI.readDirectory(directoryPath);
      const latestState = useTreeStore.getState();
      if (
        result.code !== CodeResult.Success ||
        !result.data ||
        latestState.treeRoot?.key !== rootPath
      ) {
        return false;
      }

      latestState.replaceDirectoryChildren(directoryPath, result.data.children);
      return true;
    } catch (error) {
      console.error("Failed to load directory:", error);
      return false;
    } finally {
      if (loadingTimer) clearTimeout(loadingTimer);
      if (useTreeStore.getState().treeRoot?.key === rootPath) {
        useTreeStore.getState().setDirectoryLoading(directoryPath, false);
      }
    }
  })();

  directoryLoadPromises.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (directoryLoadPromises.get(requestKey) === request) {
      directoryLoadPromises.delete(requestKey);
    }
  }
}

async function ensureFullWorkspaceTree(): Promise<boolean> {
  const state = useTreeStore.getState();
  const rootPath = state.treeRoot?.key;
  if (!rootPath) return false;
  if (state.isTreeFullyLoaded) return true;
  if (fullTreeLoad?.rootPath === rootPath) return fullTreeLoad.promise;

  const promise = (async () => {
    try {
      const result = await window.electronAPI.generateFullTree(rootPath);
      const latestState = useTreeStore.getState();
      if (
        result.code !== CodeResult.Success ||
        !result.data ||
        latestState.treeRoot?.key !== rootPath
      ) {
        return false;
      }

      latestState.setTreeData(result.data.treeData);
      latestState.setTreeFullyLoaded(true);
      return true;
    } catch (error) {
      console.error("Failed to load complete workspace tree:", error);
      return false;
    }
  })();

  fullTreeLoad = { rootPath, promise };
  try {
    return await promise;
  } finally {
    if (fullTreeLoad?.promise === promise) fullTreeLoad = undefined;
  }
}

async function refreshDirectories(directoryPaths: string[]) {
  let nextIndex = 0;
  const workerCount = Math.min(8, directoryPaths.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < directoryPaths.length) {
        const directoryPath = directoryPaths[nextIndex++];
        await loadDirectoryChildren(directoryPath, true);
      }
    }),
  );
}

async function refreshWorkspaceTree(
  changeBatch: WorkspaceChangeBatch,
): Promise<void> {
  if (workspaceRefreshInFlight) {
    pendingWorkspaceChangeBatch = mergeWorkspaceChangeBatches(
      pendingWorkspaceChangeBatch,
      changeBatch,
    );
    return;
  }

  workspaceRefreshInFlight = true;
  try {
    const currentRoot = useTreeStore.getState().treeRoot;
    if (currentRoot?.key !== changeBatch.rootPath) return;

    const state = useTreeStore.getState();
    const hasStructuralChange =
      changeBatch.hasUnknownPath ||
      changeBatch.events.some((event) => event.eventType === "rename");
    if (hasStructuralChange) state.setTreeFullyLoaded(false);

    const directoryPaths = getDirectoriesToRefresh(changeBatch, state.treeData);
    await refreshDirectories(directoryPaths);
  } finally {
    workspaceRefreshInFlight = false;
    const pendingBatch = pendingWorkspaceChangeBatch;
    pendingWorkspaceChangeBatch = null;
    if (
      pendingBatch &&
      useTreeStore.getState().treeRoot?.key === pendingBatch.rootPath
    ) {
      void refreshWorkspaceTree(pendingBatch);
    }
  }
}

function ensureWorkspaceChangeSubscription(): void {
  if (unsubscribeWorkspaceChanged) return;

  unsubscribeWorkspaceChanged = window.electronAPI.onWorkspaceChanged(
    (changeBatch) => {
      void refreshWorkspaceTree(changeBatch);
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
  const recordRecentOpenedFile = useEditorStore(
    (state) => state.recordRecentOpenedFile,
  );
  const githubInfo = useUserStore((state) => state.githubInfo);

  const loadDirectory = useCallback((directoryPath: string, force = false) => {
    return loadDirectoryChildren(directoryPath, force);
  }, []);

  const ensureFullTreeLoaded = useCallback(() => {
    return ensureFullWorkspaceTree();
  }, []);

  const openFolder = useCallback(async () => {
    const result = await window.electronAPI.openDialog();
    if (result.code === CodeResult.Success && result.data) {
      setTreeData(result.data.treeData);
      setTreeRoot(result.data.treeRoot);
      useTreeStore.getState().setTreeFullyLoaded(false);
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
        useTreeStore.getState().setTreeFullyLoaded(false);
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
        let tabId = targetGroup.activeTabId;
        let activeTab = targetGroup.tabs.find((tab) => tab.id === tabId);

        if (
          (activeTab?.filePath === filePath &&
            activeTab.loadStatus === "ready") ||
          activeTab?.pendingFilePath === filePath
        ) {
          state.setActiveTab(targetGroup.id, tabId);
          useTreeStore.getState().setSelectedKey(filePath);
          state.recordRecentOpenedFile(filePath);
          return;
        }

        tabId = selectFileOpenTabId(targetGroup, state.addTab);
        if (tabId !== targetGroup.activeTabId) {
          state = useEditorStore.getState();
          targetGroup = state.panelGroups.find(
            (group) => group.id === targetGroup!.id,
          );
          activeTab = targetGroup?.tabs.find((tab) => tab.id === tabId);
        }

        if (!targetGroup || !activeTab) return;

        // 复用标签前先冲刷旧文件，避免尚未到期的自动保存丢失。
        if (activeTab.filePath) {
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
        recordRecentOpenedFile(filePath);
      }
    },
    [setContent, setFilePath, incrementReloadKey, recordRecentOpenedFile],
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

  // 获取文件在 HEAD 或暂存区中的内容
  const getFileHeadContent = useCallback(
    async (
      dirPath: string,
      filePath: string,
      source: GitFileContentSource = "HEAD",
    ) => {
      return window.gitAPI.getFileHeadContent(dirPath, filePath, source);
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

  // 获取提交历史
  const getCommitHistory = useCallback(
    async (dirPath: string, skip?: number, limit?: number) => {
      return window.gitAPI.getCommitHistory(dirPath, skip, limit);
    },
    [],
  );

  // 获取提交详情
  const getCommitDetail = useCallback(async (dirPath: string, hash: string) => {
    return window.gitAPI.getCommitDetail(dirPath, hash);
  }, []);

  // 获取提交文件内容
  const getCommitFileContent = useCallback(
    async (
      dirPath: string,
      hash: string,
      filePath: string,
      status: GitCommitFileStatus,
      oldPath?: string,
    ) => {
      return window.gitAPI.getCommitFileContent(
        dirPath,
        hash,
        filePath,
        status,
        oldPath,
      );
    },
    [],
  );

  return {
    openFolder,
    loadTree,
    loadDirectory,
    ensureFullTreeLoaded,
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
    getCommitHistory,
    getCommitDetail,
    getCommitFileContent,
  };
}
