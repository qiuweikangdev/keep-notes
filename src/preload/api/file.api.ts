import { ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
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

  // 监听单个已打开文件的内容变化。
  watchFile: (filePath: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILE.WATCH, filePath);
  },

  // 取消监听单个已打开文件。
  unwatchFile: (filePath: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILE.UNWATCH, filePath);
  },

  // 监听当前工作区目录结构变化。
  watchWorkspace: (rootPath: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILE.WATCH_WORKSPACE, rootPath);
  },

  // 取消监听当前工作区目录结构变化。
  unwatchWorkspace: (rootPath: string): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.FILE.UNWATCH_WORKSPACE, rootPath);
  },

  // 注册文件内容变化回调。
  onFileChanged: (callback: (filePath: string, content: string) => void) => {
    const handler = (
      _event: IpcRendererEvent,
      filePath: string,
      content: string,
    ) => {
      callback(filePath, content);
    };
    ipcRenderer.on(IPC_CHANNELS.FILE.ON_FILE_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.FILE.ON_FILE_CHANGED, handler);
    };
  },

  // 注册工作区变化回调，触发后由渲染进程刷新当前文件树。
  onWorkspaceChanged: (callback: (rootPath: string) => void) => {
    const handler = (_event: IpcRendererEvent, rootPath: string) => {
      callback(rootPath);
    };
    ipcRenderer.on(IPC_CHANNELS.FILE.ON_WORKSPACE_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(
        IPC_CHANNELS.FILE.ON_WORKSPACE_CHANGED,
        handler,
      );
    };
  },
};
