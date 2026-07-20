import type React from "react";
import { APP_NAME } from "../constants/app-info";

export interface ApiResponse<T = void> {
  code: CodeResult;
  message?: string;
  data?: T;
}

export enum CodeResult {
  Fail = 0,
  Success = 1,
}

export interface TreeNode {
  title: string;
  key: string;
  children?: TreeNode[];
  /** 目录的直属子项是否已经从磁盘读取；文件不设置此字段。 */
  isLoaded?: boolean;
  content?: string;
  selectable?: boolean;
}

export interface WorkspaceChangeEvent {
  eventType: "change" | "rename";
  path: string;
}

export interface WorkspaceChangeBatch {
  rootPath: string;
  events: WorkspaceChangeEvent[];
  hasUnknownPath: boolean;
}

export interface GitConfig {
  username: string;
  email: string;
  localPath: string;
  repoUrl: string;
}

// Git 文件状态
export interface GitFileStatus {
  path: string;
  index: string; // 暂存区状态
  working_dir: string; // 工作区状态
}

// Git 状态信息
export interface GitStatus {
  current: string; // 当前分支
  tracking: string; // 追踪的远程分支
  files: GitFileStatus[]; // 修改的文件列表
  ahead: number; // 领先远程的提交数
  behind: number; // 落后远程的提交数
  created: string[];
  not_added: string[];
  modified: string[];
  deleted: string[];
  renamed: Array<{ from: string; to: string }>;
  staged: string[];
  conflicted: string[];
}

export type GitFileContentSource = "HEAD" | "INDEX";

// Git 分支信息
export interface GitBranch {
  name: string;
  current: boolean;
  remote?: string;
}

// Git 提交选项
export interface GitCommitOptions {
  message: string;
  files?: string[]; // 指定要提交的文件，空则提交所有暂存文件
  push?: boolean; // 提交后是否推送
}

// Git 历史提交列表项
export interface GitCommitLogItem {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  date: string;
}

export type GitCommitFileStatus = "A" | "M" | "D" | "R" | "C" | "U";

// Git 历史提交中的文件变更
export interface GitCommitChangedFile {
  path: string;
  status: GitCommitFileStatus;
  additions: number;
  deletions: number;
  oldPath?: string;
}

// Git 历史提交中文件在父提交和当前提交中的内容
export interface GitCommitFileContent {
  oldContent: string;
  newContent: string;
}

// Git 历史提交详情
export interface GitCommitDetail {
  hash: string;
  shortHash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  committerName: string;
  committerEmail: string;
  date: string;
  subject: string;
  body: string;
  files: GitCommitChangedFile[];
}

// Git 检测结果
export interface GitDetectResult {
  isGitRepo: boolean;
  currentPath: string;
}

export interface TreeRoot {
  title: string;
  key: string;
}

export interface TreeInfo {
  treeData: TreeNode[];
  treeRoot: TreeRoot;
}

export interface SaveImageAttachmentInput {
  workspaceRootPath: string;
  markdownFilePath: string;
  fileName: string;
  mimeType: string;
  data: ArrayBuffer;
}

export interface SaveImageAttachmentResult {
  filePath: string;
  url: string;
}

export interface CloseSaveSnapshot {
  groupId: string;
  tabId: string;
  content: string;
  filePath: string | null;
}

/** 浮窗与来源标签之间传递的编辑器上下文。 */
export interface QuickEditorWindowContent {
  content: string;
  source: {
    groupId: string;
    tabId: string;
    filePath: string | null;
  } | null;
}

export interface WindowOpenTarget {
  rootPath: string;
  filePath?: string;
}

export interface AppInfo {
  version: string;
  repositoryUrl: string;
  author: string;
}

export type ExternalOpenAppId =
  | "vscode"
  | "zed"
  | "cursor"
  | "warp"
  | "terminal"
  | "file-manager";

export type ExternalOpenAppKind = "editor" | "terminal" | "file-manager";

export interface ExternalOpenApp {
  id: ExternalOpenAppId;
  label: string;
  kind: ExternalOpenAppKind;
  available: boolean;
  iconDataUrl?: string;
}

export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "canceled"
  | "error";

export interface AppUpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface AppUpdateState {
  status: AppUpdateStatus;
  currentVersion: string;
  version?: string;
  progress?: AppUpdateProgress;
  message?: string;
}

export type ReminderRepeatPreset =
  | "never"
  | "hourly"
  | "daily"
  | "weekdays"
  | "weekends"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "bimonthly"
  | "quarterly"
  | "semiannual"
  | "yearly"
  | "custom";

export type ReminderRepeatUnit = "hour" | "day" | "week" | "month" | "year";

export interface ReminderRepeatCustomRule {
  interval: number;
  unit: ReminderRepeatUnit;
}

export interface ReminderNotificationHistoryItem {
  scheduledAt: string;
  notifiedAt: string;
}

export interface Reminder {
  id: string;
  title: string;
  filePath: string;
  fileName: string;
  scheduledAt: string;
  repeat: ReminderRepeatPreset;
  customRepeat?: ReminderRepeatCustomRule;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  lastNotifiedAt?: string;
  notificationHistory?: ReminderNotificationHistoryItem[];
}

export interface ReminderInput {
  title: string;
  filePath?: string;
  scheduledAt: string;
  repeat: ReminderRepeatPreset;
  customRepeat?: ReminderRepeatCustomRule;
}

export interface ReminderEditorRequest {
  requestId: number;
  reminderId: string | null;
}

export interface ShortcutRegistrationResult {
  success: boolean;
  failedKeys: string[];
}

export enum LeftAreaEnum {
  File = "file",
  Outline = "outline",
}

export enum DirColorEnum {
  MultiColor = "multiColor",
  ThemeColor = "themeColor",
}

export interface DirSettings {
  dirColor: DirColorEnum;
  showIcon: boolean;
}

export interface GithubInfo {
  username: string;
  email: string;
  localPath: string;
  repoUrl: string;
}

export interface OutlineNode {
  text: string;
  level: number;
  id: string;
  key: string | number;
  children?: OutlineNode[];
}

// 更新支持的主题
export type ThemeName =
  | "light"
  | "dark"
  | "nord"
  | "dracula"
  | "solarized"
  | "system";

export interface MenuActionOptions {
  icon: React.ComponentType<Record<string, unknown>>;
  tooltip?: string;
  command?: string;
  handle: () => void;
}

export type NotificationChannelType = "desktop" | "email" | "feishu";

export type NotificationSizePreset = "small" | "medium" | "large";

export interface DesktopChannelConfig {
  enabled: boolean;
  requireInteraction: boolean;
  appName: string;
  showAppIcon: boolean;
  useCustomAppearance: boolean;
  appNameFontSize: number;
  appNameColor: string;
  titleFontSize: number;
  titleColor: string;
  showActions: boolean;
  backgroundColor: string;
  sizePreset: NotificationSizePreset;
}

export interface EmailChannelConfig {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  senderEmail: string;
  authorizationCode: string;
  receiverEmail: string;
}

export interface NotificationConfig {
  desktop: DesktopChannelConfig;
  email: EmailChannelConfig;
}

export const DEFAULT_DESKTOP_NOTIFICATION_APPEARANCE: Pick<
  DesktopChannelConfig,
  | "appNameFontSize"
  | "appNameColor"
  | "titleFontSize"
  | "titleColor"
  | "backgroundColor"
  | "sizePreset"
> = {
  appNameFontSize: 18,
  appNameColor: "#111827",
  titleFontSize: 21,
  titleColor: "#111827",
  backgroundColor: "#ece6f3",
  sizePreset: "medium",
};

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  desktop: {
    enabled: true,
    requireInteraction: false,
    appName: APP_NAME,
    showAppIcon: true,
    useCustomAppearance: false,
    ...DEFAULT_DESKTOP_NOTIFICATION_APPEARANCE,
    showActions: true,
  },
  email: {
    enabled: false,
    smtpHost: "smtp.qq.com",
    smtpPort: 465,
    senderEmail: "",
    authorizationCode: "",
    receiverEmail: "",
  },
};

export type ExportFormat = "pdf" | "word" | "md" | "html" | "image";

export type ExportDirectoryMode = "same-as-source" | "custom";

export interface ExportConfig {
  enabledFormats: ExportFormat[];
  defaultDirectoryMode: ExportDirectoryMode;
  customDirectoryPath: string;
  openDirectoryAfterExport: boolean;
}

export interface ExportFileResult {
  directoryPath: string;
  filePaths: string[];
}

export const EXPORT_FORMATS: Array<{
  value: ExportFormat;
  label: string;
}> = [
  { value: "pdf", label: "PDF" },
  { value: "word", label: "Word" },
  { value: "md", label: "Markdown" },
  { value: "html", label: "HTML" },
  { value: "image", label: "图片" },
];

export const DEFAULT_EXPORT_CONFIG: ExportConfig = {
  enabledFormats: ["pdf"],
  defaultDirectoryMode: "same-as-source",
  customDirectoryPath: "",
  openDirectoryAfterExport: false,
};
