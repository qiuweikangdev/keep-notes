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
};
