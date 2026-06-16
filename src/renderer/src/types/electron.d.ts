import type {
  ApiResponse,
  GitConfig,
  TreeInfo,
  TreeNode,
  GitStatus,
  GitBranch,
  GitCommitOptions,
  GitDetectResult,
} from "@shared/types";

export interface ElectronAPI {
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  updateDirtyState: (isDirty: boolean) => void;
  // 获取当前运行平台
  getPlatform: () => string;
  // 监听菜单动作（macOS 应用菜单触发）
  onMenuAction: (callback: (action: string) => void) => () => void;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  saveAs: (content: string) => Promise<ApiResponse<{ filePath: string }>>;
  openDialog: () => Promise<
    ApiResponse<{
      treeData: TreeNode[];
      treeRoot: { title: string; key: string };
      selectedPath: string;
    }>
  >;
  getSelectedPath: () => Promise<string | null>;
  generateTree: (selectedPath: string) => Promise<ApiResponse<TreeInfo>>;
  openInExplorer: (targetPath: string) => Promise<boolean>;
  createFile: (
    path: string,
    title: string,
    treeData: TreeNode[],
  ) => Promise<ApiResponse<{ treeData: TreeNode[] }>>;
  createFolder: (
    path: string,
    title: string,
    treeData: TreeNode[],
  ) => Promise<ApiResponse<{ treeData: TreeNode[] }>>;
  rename: (
    path: string,
    title: string,
    treeData: TreeNode[],
  ) => Promise<ApiResponse<{ treeData: TreeNode[] }>>;
  delete: (
    path: string,
    title: string,
    treeData: TreeNode[],
  ) => Promise<ApiResponse<{ treeData: TreeNode[] }>>;
  move: (
    sourcePath: string,
    targetPath: string,
    treeData: TreeNode[],
  ) => Promise<ApiResponse<{ treeData: TreeNode[] }>>;
  // 文件监听
  watchFile: (filePath: string) => Promise<void>;
  unwatchFile: (filePath: string) => Promise<void>;
  watchWorkspace: (rootPath: string) => Promise<void>;
  unwatchWorkspace: (rootPath: string) => Promise<void>;
  onFileChanged: (
    callback: (filePath: string, content: string) => void,
  ) => () => void;
  onWorkspaceChanged: (callback: (rootPath: string) => void) => () => void;
}

export interface GitAPI {
  // 原有的下载和上传方法
  download: (gitConfig: GitConfig) => Promise<ApiResponse>;
  upload: (gitConfig: GitConfig) => Promise<ApiResponse>;

  // 新增的 Git 操作方法
  detect: (dirPath: string) => Promise<ApiResponse<GitDetectResult>>;
  getCurrentBranch: (dirPath: string) => Promise<ApiResponse<string>>;
  getBranches: (dirPath: string) => Promise<ApiResponse<GitBranch[]>>;
  switchBranch: (dirPath: string, branchName: string) => Promise<ApiResponse>;
  createBranch: (dirPath: string, branchName: string) => Promise<ApiResponse>;
  getStatus: (dirPath: string) => Promise<ApiResponse<GitStatus>>;
  addFiles: (dirPath: string, files: string[]) => Promise<ApiResponse>;
  unstageFiles: (dirPath: string, files: string[]) => Promise<ApiResponse>;
  commit: (dirPath: string, options: GitCommitOptions) => Promise<ApiResponse>;
  push: (dirPath: string) => Promise<ApiResponse>;
  pull: (dirPath: string) => Promise<ApiResponse>;
  getFileDiff: (
    dirPath: string,
    filePath: string,
  ) => Promise<ApiResponse<string>>;
  getFileHeadContent: (
    dirPath: string,
    filePath: string,
  ) => Promise<ApiResponse<string>>;
  discardChanges: (dirPath: string, filePath: string) => Promise<ApiResponse>;
  openFile: (dirPath: string, filePath: string) => Promise<ApiResponse<string>>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    gitAPI: GitAPI;
  }
}
