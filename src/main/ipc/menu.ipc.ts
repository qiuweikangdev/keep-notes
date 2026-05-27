import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import { getBrowserWindow } from "../utils";

export function registerMenuIpc(): void {
  ipcMain.on(IPC_CHANNELS.WINDOW.MINIMIZE, (event) => {
    const win = getBrowserWindow(event);
    win?.minimize();
  });

  ipcMain.on(IPC_CHANNELS.WINDOW.MAXIMIZE, (event) => {
    const win = getBrowserWindow(event);
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.on(IPC_CHANNELS.WINDOW.CLOSE, (event) => {
    const win = getBrowserWindow(event);
    win?.close();
  });
}
