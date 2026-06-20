import { BrowserWindow, ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import { appUpdateController } from "../updater";

function broadcastUpdateState(): void {
  const state = appUpdateController.getState();
  BrowserWindow.getAllWindows().forEach((win) => {
    if (win.isDestroyed()) return;
    win.webContents.send(IPC_CHANNELS.APP.ON_UPDATE_STATE, state);
  });
}

export function registerUpdaterIpc(): void {
  appUpdateController.subscribe(broadcastUpdateState);

  ipcMain.handle(IPC_CHANNELS.APP.GET_INFO, () =>
    appUpdateController.getAppInfo(),
  );
  ipcMain.handle(IPC_CHANNELS.APP.GET_UPDATE_STATE, () =>
    appUpdateController.getState(),
  );
  ipcMain.handle(IPC_CHANNELS.APP.CHECK_FOR_UPDATES, () =>
    appUpdateController.checkForUpdates(),
  );
  ipcMain.handle(IPC_CHANNELS.APP.CANCEL_UPDATE, () =>
    appUpdateController.cancelUpdate(),
  );
  ipcMain.handle(IPC_CHANNELS.APP.INSTALL_UPDATE, () => {
    appUpdateController.installUpdate();
  });
  ipcMain.handle(IPC_CHANNELS.APP.OPEN_REPOSITORY, () =>
    appUpdateController.openRepository(),
  );
}
