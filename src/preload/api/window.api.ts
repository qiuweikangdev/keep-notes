import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";

export const windowApi = {
  minimizeWindow: (): void => {
    ipcRenderer.send(IPC_CHANNELS.WINDOW.MINIMIZE);
  },

  maximizeWindow: (): void => {
    ipcRenderer.send(IPC_CHANNELS.WINDOW.MAXIMIZE);
  },

  closeWindow: (): void => {
    ipcRenderer.send(IPC_CHANNELS.WINDOW.CLOSE);
  },

  updateDirtyState: (isDirty: boolean): void => {
    ipcRenderer.send(IPC_CHANNELS.EDITOR.UPDATE_DIRTY_STATE, isDirty);
  },

  // 获取当前运行平台
  getPlatform: (): string => {
    return process.platform;
  },

  // 监听菜单动作（macOS 应用菜单触发）
  onMenuAction: (callback: (action: string) => void): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      action: string,
    ): void => {
      callback(action);
    };
    ipcRenderer.on(IPC_CHANNELS.MENU.ACTION, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.MENU.ACTION, handler);
    };
  },
};
