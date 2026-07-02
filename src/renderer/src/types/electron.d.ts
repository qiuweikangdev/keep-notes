import type {
  ApiResponse,
  GitConfig,
  TreeInfo,
  TreeNode,
  GitStatus,
  GitBranch,
  GitCommitOptions,
  GitCommitDetail,
  GitCommitFileContent,
  GitCommitFileStatus,
  GitCommitLogItem,
  GitDetectResult,
  WindowOpenTarget,
  AppInfo,
  AppUpdateState,
  ExternalOpenApp,
  ExternalOpenAppId,
  Reminder,
  ReminderInput,
  SaveImageAttachmentInput,
  SaveImageAttachmentResult,
  NotificationChannelType,
  NotificationConfig,
  ExportConfig,
  ExportFileResult,
} from "@shared/types";

export interface ElectronAPI {
  getAppInfo: () => Promise<AppInfo>;
  getUpdateState: () => Promise<AppUpdateState>;
  checkForUpdates: () => Promise<AppUpdateState>;
  cancelUpdate: () => Promise<AppUpdateState>;
  installUpdate: () => Promise<void>;
  openRepository: () => Promise<boolean>;
  onUpdateState: (callback: (state: AppUpdateState) => void) => () => void;
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  // 获取窗口位置（用于 JS 拖拽）
  getWindowPosition: () => Promise<[number, number]>;
  // 设置窗口位置（用于 JS 拖拽）
  setWindowPosition: (x: number, y: number) => void;
  // 判断窗口是否最大化
  isWindowMaximized: () => Promise<boolean>;
  updateDirtyState: (isDirty: boolean) => void;
  // 获取当前运行平台
  getPlatform: () => string;
  // 监听菜单动作（macOS 应用菜单触发）
  onMenuAction: (callback: (action: string) => void) => () => void;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  loadImageAsDataUrl: (source: string) => Promise<string | null>;
  saveImageAttachment: (
    input: SaveImageAttachmentInput,
  ) => Promise<ApiResponse<SaveImageAttachmentResult>>;
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
  copyPath: (targetPath: string) => Promise<boolean>;
  openInNewWindow: (targetPath: string) => Promise<boolean>;
  listExternalOpenApps: () => Promise<ExternalOpenApp[]>;
  openWithExternalApp: (
    targetPath: string,
    appId: ExternalOpenAppId,
  ) => Promise<boolean>;
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
  consumeWindowOpenTarget: () => WindowOpenTarget | null;
  onWindowOpenTarget: (
    callback: (target: WindowOpenTarget) => void,
  ) => () => void;
  listReminders: () => Promise<Reminder[]>;
  createReminder: (input: ReminderInput) => Promise<Reminder>;
  updateReminder: (
    id: string,
    input: Partial<ReminderInput>,
  ) => Promise<Reminder>;
  deleteReminder: (id: string) => Promise<boolean>;
  completeReminder: (id: string) => Promise<Reminder>;
  onRemindersChanged: (callback: (reminders: Reminder[]) => void) => () => void;
  onReminderTriggered: (callback: (reminder: Reminder) => void) => () => void;
  // Notification
  getNotificationConfig: () => Promise<NotificationConfig>;
  setNotificationConfig: (config: NotificationConfig) => Promise<void>;
  testNotificationChannel: (
    type: NotificationChannelType,
  ) => Promise<{ success: boolean; error?: string }>;
  onNotificationConfigChanged: (
    callback: (config: NotificationConfig) => void,
  ) => () => void;
  // Export
  getExportConfig: () => Promise<ExportConfig>;
  setExportConfig: (config: ExportConfig) => Promise<void>;
  exportFile: (filePath: string) => Promise<ExportFileResult>;
  onExportConfigChanged: (
    callback: (config: ExportConfig) => void,
  ) => () => void;
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
  getCommitHistory: (
    dirPath: string,
    skip?: number,
    limit?: number,
  ) => Promise<ApiResponse<GitCommitLogItem[]>>;
  getCommitDetail: (
    dirPath: string,
    hash: string,
  ) => Promise<ApiResponse<GitCommitDetail>>;
  getCommitFileContent: (
    dirPath: string,
    hash: string,
    filePath: string,
    status: GitCommitFileStatus,
    oldPath?: string,
  ) => Promise<ApiResponse<GitCommitFileContent>>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    gitAPI: GitAPI;
    __addFileToHistory?: (filePath: string) => void;
    __navigateBack?: () => void;
    __navigateForward?: () => void;
    __scrollToBlock?: (id: string) => void;
  }
}
