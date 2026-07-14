import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type { WindowOpenTarget } from "../../shared/types";

const windowOpenTargetListeners = new Set<(target: WindowOpenTarget) => void>();
let pendingWindowOpenTarget: WindowOpenTarget | null = null;

ipcRenderer.on(
  IPC_CHANNELS.WINDOW.OPEN_TARGET,
  (_event: Electron.IpcRendererEvent, target: WindowOpenTarget) => {
    pendingWindowOpenTarget = target;
    windowOpenTargetListeners.forEach((listener) => listener(target));
  },
);

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

  // 获取窗口位置
  getWindowPosition: (): Promise<[number, number]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.WINDOW.GET_POSITION);
  },

  // 设置窗口位置
  setWindowPosition: (x: number, y: number): void => {
    ipcRenderer.send(IPC_CHANNELS.WINDOW.SET_POSITION, x, y);
  },

  // 判断窗口是否最大化
  isWindowMaximized: (): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.WINDOW.IS_MAXIMIZED);
  },

  getZoomFactor: (): Promise<number> => {
    return ipcRenderer.invoke(IPC_CHANNELS.WINDOW.GET_ZOOM_FACTOR);
  },

  setZoomFactor: (zoomFactor: number): Promise<number> => {
    return ipcRenderer.invoke(IPC_CHANNELS.WINDOW.SET_ZOOM_FACTOR, zoomFactor);
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

  consumeWindowOpenTarget: (): WindowOpenTarget | null => {
    const target = pendingWindowOpenTarget;
    pendingWindowOpenTarget = null;
    return target;
  },

  onWindowOpenTarget: (
    callback: (target: WindowOpenTarget) => void,
  ): (() => void) => {
    windowOpenTargetListeners.add(callback);
    return () => {
      windowOpenTargetListeners.delete(callback);
    };
  },
};
