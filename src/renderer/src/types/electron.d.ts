import type { ApiResponse, GitConfig, TreeInfo, TreeNode } from "@shared/types";

export interface ElectronAPI {
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  readFile: (filePath: string) => Promise<string>;
  writeFile: (filePath: string, content: string) => Promise<void>;
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
}

export interface GitAPI {
  download: (gitConfig: GitConfig) => Promise<ApiResponse>;
  upload: (gitConfig: GitConfig) => Promise<ApiResponse>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    gitAPI: GitAPI;
  }
}
