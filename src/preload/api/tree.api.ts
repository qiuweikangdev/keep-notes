import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type { ApiResponse, TreeNode } from "../../shared/types";

export const treeApi = {
  createFile: (
    path: string,
    title: string,
    treeData: TreeNode[],
  ): Promise<ApiResponse<{ treeData: TreeNode[] }>> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.TREE.CREATE_FILE,
      path,
      title,
      treeData,
    );
  },

  createFolder: (
    path: string,
    title: string,
    treeData: TreeNode[],
  ): Promise<ApiResponse<{ treeData: TreeNode[] }>> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.TREE.CREATE_FOLDER,
      path,
      title,
      treeData,
    );
  },

  rename: (
    path: string,
    title: string,
    treeData: TreeNode[],
  ): Promise<ApiResponse<{ treeData: TreeNode[] }>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.TREE.RENAME, path, title, treeData);
  },

  delete: (
    path: string,
    title: string,
    treeData: TreeNode[],
  ): Promise<ApiResponse<{ treeData: TreeNode[] }>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.TREE.DELETE, path, title, treeData);
  },

  move: (
    sourcePath: string,
    targetPath: string,
    treeData: TreeNode[],
  ): Promise<ApiResponse<{ treeData: TreeNode[] }>> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.TREE.MOVE,
      sourcePath,
      targetPath,
      treeData,
    );
  },
};
