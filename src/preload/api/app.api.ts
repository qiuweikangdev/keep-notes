import { ipcRenderer, type IpcRendererEvent } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type { AppInfo, AppUpdateState } from "../../shared/types";

export const appApi = {
  getAppInfo: (): Promise<AppInfo> => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP.GET_INFO);
  },

  getUpdateState: (): Promise<AppUpdateState> => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP.GET_UPDATE_STATE);
  },

  checkForUpdates: (): Promise<AppUpdateState> => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP.CHECK_FOR_UPDATES);
  },

  downloadUpdate: (): Promise<AppUpdateState> => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP.DOWNLOAD_UPDATE);
  },

  cancelUpdate: (): Promise<AppUpdateState> => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP.CANCEL_UPDATE);
  },

  installUpdate: (): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP.INSTALL_UPDATE);
  },

  openRepository: (): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.APP.OPEN_REPOSITORY);
  },

  onUpdateState: (callback: (state: AppUpdateState) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, state: AppUpdateState): void => {
      callback(state);
    };
    ipcRenderer.on(IPC_CHANNELS.APP.ON_UPDATE_STATE, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.APP.ON_UPDATE_STATE, handler);
    };
  },
};
