import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type {
  ApiResponse,
  GitConfig,
  GitStatus,
  GitBranch,
  GitCommitOptions,
  GitDetectResult,
  GitCommitDetail,
  GitCommitLogItem,
} from "../../shared/types";

export const gitApi = {
  // 原有的下载和上传方法
  download: (gitConfig: GitConfig): Promise<ApiResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GIT.DOWNLOAD, gitConfig);
  },

  upload: (gitConfig: GitConfig): Promise<ApiResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GIT.UPLOAD, gitConfig);
  },

  // 新增的 Git 操作方法

  // 检测是否为 Git 仓库
  detect: (dirPath: string): Promise<ApiResponse<GitDetectResult>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GIT.DETECT, dirPath);
  },

  // 获取当前分支
  getCurrentBranch: (dirPath: string): Promise<ApiResponse<string>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GIT.GET_CURRENT_BRANCH, dirPath);
  },

  // 获取所有分支
  getBranches: (dirPath: string): Promise<ApiResponse<GitBranch[]>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GIT.GET_BRANCHES, dirPath);
  },

  // 切换分支
  switchBranch: (dirPath: string, branchName: string): Promise<ApiResponse> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.GIT.SWITCH_BRANCH,
      dirPath,
      branchName,
    );
  },

  // 创建新分支
  createBranch: (dirPath: string, branchName: string): Promise<ApiResponse> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.GIT.CREATE_BRANCH,
      dirPath,
      branchName,
    );
  },

  // 获取 Git 状态
  getStatus: (dirPath: string): Promise<ApiResponse<GitStatus>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GIT.GET_STATUS, dirPath);
  },

  // 添加文件到暂存区
  addFiles: (dirPath: string, files: string[]): Promise<ApiResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GIT.ADD_FILES, dirPath, files);
  },

  // 取消文件暂存
  unstageFiles: (dirPath: string, files: string[]): Promise<ApiResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GIT.UNSTAGE_FILES, dirPath, files);
  },

  // 提交更改
  commit: (
    dirPath: string,
    options: GitCommitOptions,
  ): Promise<ApiResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GIT.COMMIT, dirPath, options);
  },

  // 推送到远程
  push: (dirPath: string): Promise<ApiResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GIT.PUSH, dirPath);
  },

  // 从远程拉取
  pull: (dirPath: string): Promise<ApiResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GIT.PULL, dirPath);
  },

  // 获取文件差异
  getFileDiff: (
    dirPath: string,
    filePath: string,
  ): Promise<ApiResponse<string>> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.GIT.GET_FILE_DIFF,
      dirPath,
      filePath,
    );
  },

  // 获取文件在 HEAD 中的内容
  getFileHeadContent: (
    dirPath: string,
    filePath: string,
  ): Promise<ApiResponse<string>> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.GIT.GET_FILE_HEAD_CONTENT,
      dirPath,
      filePath,
    );
  },

  // 放弃更改
  discardChanges: (dirPath: string, filePath: string): Promise<ApiResponse> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.GIT.DISCARD_CHANGES,
      dirPath,
      filePath,
    );
  },

  // 打开文件
  openFile: (
    dirPath: string,
    filePath: string,
  ): Promise<ApiResponse<string>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GIT.OPEN_FILE, dirPath, filePath);
  },

  // 获取提交历史
  getCommitHistory: (
    dirPath: string,
    skip?: number,
    limit?: number,
  ): Promise<ApiResponse<GitCommitLogItem[]>> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.GIT.GET_COMMIT_HISTORY,
      dirPath,
      skip,
      limit,
    );
  },

  // 获取提交详情
  getCommitDetail: (
    dirPath: string,
    hash: string,
  ): Promise<ApiResponse<GitCommitDetail>> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.GIT.GET_COMMIT_DETAIL,
      dirPath,
      hash,
    );
  },
};
