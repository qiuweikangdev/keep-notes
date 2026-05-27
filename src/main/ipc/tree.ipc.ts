import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import {
  createFile,
  createFolder,
  rename,
  deleteFileOrFolder,
  moveFileOrFolder,
} from "../treeAction";

export function registerTreeIpc(): void {
  ipcMain.handle(
    IPC_CHANNELS.TREE.CREATE_FILE,
    async (_, path: string, title: string, treeData: any[]) => {
      return createFile(path, title, treeData);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TREE.CREATE_FOLDER,
    async (_, path: string, title: string, treeData: any[]) => {
      return createFolder(path, title, treeData);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TREE.RENAME,
    async (_, path: string, title: string, treeData: any[]) => {
      return rename(path, title, treeData);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TREE.DELETE,
    async (_, path: string, title: string, treeData: any[]) => {
      return deleteFileOrFolder(path, title, treeData);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TREE.MOVE,
    async (_, sourcePath: string, targetPath: string, treeData: any[]) => {
      return moveFileOrFolder(sourcePath, targetPath, treeData);
    },
  );
}
