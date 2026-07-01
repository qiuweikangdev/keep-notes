import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import {
  download,
  upload,
  detectGitRepo,
  getCurrentBranch,
  getBranches,
  switchBranch,
  createBranch,
  getStatus,
  addFiles,
  unstageFiles,
  commit,
  push,
  pull,
  getFileDiff,
  getFileHeadContent,
  discardChanges,
  openFile,
  getCommitHistory,
  getCommitDetail,
  getCommitFileContent,
} from "../git";
import type {
  GitConfig,
  GitCommitOptions,
  GitCommitFileStatus,
} from "../../shared/types";

export function registerGitIpc(): void {
  // 原有的下载和上传通道
  ipcMain.handle(IPC_CHANNELS.GIT.DOWNLOAD, async (_, gitConfig: GitConfig) => {
    return download(gitConfig);
  });

  ipcMain.handle(IPC_CHANNELS.GIT.UPLOAD, async (_, gitConfig: GitConfig) => {
    return upload(gitConfig);
  });

  // 新增的 Git 操作通道

  // 检测是否为 Git 仓库
  ipcMain.handle(IPC_CHANNELS.GIT.DETECT, async (_, dirPath: string) => {
    return detectGitRepo(dirPath);
  });

  // 获取当前分支
  ipcMain.handle(
    IPC_CHANNELS.GIT.GET_CURRENT_BRANCH,
    async (_, dirPath: string) => {
      return getCurrentBranch(dirPath);
    },
  );

  // 获取所有分支
  ipcMain.handle(IPC_CHANNELS.GIT.GET_BRANCHES, async (_, dirPath: string) => {
    return getBranches(dirPath);
  });

  // 切换分支
  ipcMain.handle(
    IPC_CHANNELS.GIT.SWITCH_BRANCH,
    async (_, dirPath: string, branchName: string) => {
      return switchBranch(dirPath, branchName);
    },
  );

  // 创建新分支
  ipcMain.handle(
    IPC_CHANNELS.GIT.CREATE_BRANCH,
    async (_, dirPath: string, branchName: string) => {
      return createBranch(dirPath, branchName);
    },
  );

  // 获取 Git 状态
  ipcMain.handle(IPC_CHANNELS.GIT.GET_STATUS, async (_, dirPath: string) => {
    return getStatus(dirPath);
  });

  // 添加文件到暂存区
  ipcMain.handle(
    IPC_CHANNELS.GIT.ADD_FILES,
    async (_, dirPath: string, files: string[]) => {
      return addFiles(dirPath, files);
    },
  );

  // 取消文件暂存
  ipcMain.handle(
    IPC_CHANNELS.GIT.UNSTAGE_FILES,
    async (_, dirPath: string, files: string[]) => {
      return unstageFiles(dirPath, files);
    },
  );

  // 提交更改
  ipcMain.handle(
    IPC_CHANNELS.GIT.COMMIT,
    async (_, dirPath: string, options: GitCommitOptions) => {
      return commit(dirPath, options);
    },
  );

  // 推送到远程
  ipcMain.handle(IPC_CHANNELS.GIT.PUSH, async (_, dirPath: string) => {
    return push(dirPath);
  });

  // 从远程拉取
  ipcMain.handle(IPC_CHANNELS.GIT.PULL, async (_, dirPath: string) => {
    return pull(dirPath);
  });

  // 获取文件差异
  ipcMain.handle(
    IPC_CHANNELS.GIT.GET_FILE_DIFF,
    async (_, dirPath: string, filePath: string) => {
      return getFileDiff(dirPath, filePath);
    },
  );

  // 获取文件在 HEAD 中的内容
  ipcMain.handle(
    IPC_CHANNELS.GIT.GET_FILE_HEAD_CONTENT,
    async (_, dirPath: string, filePath: string) => {
      return getFileHeadContent(dirPath, filePath);
    },
  );

  // 放弃更改
  ipcMain.handle(
    IPC_CHANNELS.GIT.DISCARD_CHANGES,
    async (_, dirPath: string, filePath: string) => {
      return discardChanges(dirPath, filePath);
    },
  );

  // 打开文件
  ipcMain.handle(
    IPC_CHANNELS.GIT.OPEN_FILE,
    async (_, dirPath: string, filePath: string) => {
      return openFile(dirPath, filePath);
    },
  );

  // 获取提交历史
  ipcMain.handle(
    IPC_CHANNELS.GIT.GET_COMMIT_HISTORY,
    async (_, dirPath: string, skip?: number, limit?: number) => {
      return getCommitHistory(dirPath, skip, limit);
    },
  );

  // 获取提交详情
  ipcMain.handle(
    IPC_CHANNELS.GIT.GET_COMMIT_DETAIL,
    async (_, dirPath: string, hash: string) => {
      return getCommitDetail(dirPath, hash);
    },
  );

  // 获取提交文件内容
  ipcMain.handle(
    IPC_CHANNELS.GIT.GET_COMMIT_FILE_CONTENT,
    async (
      _,
      dirPath: string,
      hash: string,
      filePath: string,
      status: GitCommitFileStatus,
      oldPath?: string,
    ) => {
      return getCommitFileContent(dirPath, hash, filePath, status, oldPath);
    },
  );
}
