import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import { getBrowserWindow } from "../utils";
import {
  readFileContent,
  writeFileContent,
  openDialog,
  getSelectedPath,
  genDirTreByPath,
  revealInSystemExplorer,
} from "../file";

export function registerFileIpc(): void {
  ipcMain.handle(IPC_CHANNELS.FILE.READ, async (_, filePath: string) => {
    return readFileContent(filePath);
  });

  ipcMain.handle(
    IPC_CHANNELS.FILE.WRITE,
    async (_, filePath: string, content: string) => {
      return writeFileContent(filePath, content);
    },
  );

  ipcMain.handle(IPC_CHANNELS.FILE.OPEN_DIALOG, async (event) => {
    const win = getBrowserWindow(event);
    return openDialog(win);
  });

  ipcMain.handle(IPC_CHANNELS.FILE.GET_SELECTED_PATH, async (event) => {
    const win = getBrowserWindow(event);
    return getSelectedPath(win);
  });

  ipcMain.handle(
    IPC_CHANNELS.FILE.GENERATE_TREE,
    async (_, selectedPath: string) => {
      return genDirTreByPath(selectedPath);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.FILE.OPEN_IN_EXPLORER,
    async (_, path: string) => {
      return revealInSystemExplorer(path);
    },
  );
}
