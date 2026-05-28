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

export interface TreeRoot {
  title: string;
  key: string;
}

export interface TreeInfo {
  treeData: TreeNode[];
  treeRoot: TreeRoot;
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
export type ThemeName = "light" | "dark" | "nord" | "dracula" | "solarized";

export interface MenuActionOptions {
  icon: React.ComponentType<Record<string, unknown>>;
  tooltip?: string;
  command?: string;
  handle: () => void;
}
