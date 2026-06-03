import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type { ApiResponse, TreeInfo, TreeNode } from "../../shared/types";

export const fileApi = {
  readFile: (filePath: string): Promise<string> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILE.READ, filePath);
  },

  writeFile: (filePath: string, content: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILE.WRITE, filePath, content);
  },

  saveAs: (
    content: string,
  ): Promise<{ code: number; data?: { filePath: string } }> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILE.SAVE_AS, content);
  },

  openDialog: (): Promise<
    ApiResponse<{
      treeData: TreeNode[];
      treeRoot: { title: string; key: string };
      selectedPath: string;
    }>
  > => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILE.OPEN_DIALOG);
  },

  getSelectedPath: (): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILE.GET_SELECTED_PATH);
  },

  generateTree: (selectedPath: string): Promise<ApiResponse<TreeInfo>> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILE.GENERATE_TREE, selectedPath);
  },

  openInExplorer: (targetPath: string): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILE.OPEN_IN_EXPLORER, targetPath);
  },

  // 监听文件变化
  watchFile: (filePath: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILE.WATCH, filePath);
  },

  // 取消监听文件变化
  unwatchFile: (filePath: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILE.UNWATCH, filePath);
  },

  // 注册文件变化回调
  onFileChanged: (callback: (filePath: string, content: string) => void) => {
    const handler = (_event: any, filePath: string, content: string) => {
      callback(filePath, content);
    };
    ipcRenderer.on(IPC_CHANNELS.FILE.ON_FILE_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.FILE.ON_FILE_CHANGED, handler);
    };
  },
};
