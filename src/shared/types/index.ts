import type React from "react";

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
  content?: string;
  selectable?: boolean;
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
  | "terminal"
  | "file-manager";

export type ExternalOpenAppKind = "editor" | "terminal" | "file-manager";

export interface ExternalOpenApp {
  id: ExternalOpenAppId;
  label: string;
  kind: ExternalOpenAppKind;
  available: boolean;
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
}

export interface ReminderInput {
  title: string;
  filePath: string;
  scheduledAt: string;
  repeat: ReminderRepeatPreset;
  customRepeat?: ReminderRepeatCustomRule;
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

export interface EmailChannelConfig {
  enabled: boolean;
  smtpHost: string;
  smtpPort: number;
  senderEmail: string;
  authorizationCode: string;
  receiverEmail: string;
}

export interface NotificationConfig {
  desktop: { enabled: boolean };
  email: EmailChannelConfig;
}

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  desktop: { enabled: true },
  email: {
    enabled: false,
    smtpHost: "smtp.qq.com",
    smtpPort: 465,
    senderEmail: "",
    authorizationCode: "",
    receiverEmail: "",
  },
};
