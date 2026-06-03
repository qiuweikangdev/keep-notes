import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import { getBrowserWindow } from "../utils";
import {
  readFileContent,
  writeFileContent,
  saveAsDialog,
  openDialog,
  getSelectedPath,
  genDirTreByPath,
  revealInSystemExplorer,
} from "../file";
import { watch, FSWatcher } from "fs";
import { readFile } from "fs/promises";

// 文件监听器映射
const watchers = new Map<string, FSWatcher>();

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

  ipcMain.handle(IPC_CHANNELS.FILE.SAVE_AS, async (event, content: string) => {
    const win = getBrowserWindow(event);
    return saveAsDialog(win, content);
  });

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

  // 监听文件变化
  ipcMain.handle(IPC_CHANNELS.FILE.WATCH, async (event, filePath: string) => {
    // 如果已经在监听，先取消
    if (watchers.has(filePath)) {
      watchers.get(filePath)?.close();
      watchers.delete(filePath);
    }

    const win = getBrowserWindow(event);
    if (!win) return;

    try {
      const watcher = watch(filePath, async (eventType) => {
        if (eventType === "change") {
          try {
            // 读取最新内容
            const content = await readFile(filePath, "utf-8");
            // 通知渲染进程
            win.webContents.send(
              IPC_CHANNELS.FILE.ON_FILE_CHANGED,
              filePath,
              content,
            );
          } catch (error) {
            console.error("Failed to read changed file:", error);
          }
        }
      });

      watchers.set(filePath, watcher);

      // 窗口关闭时清理监听器
      win.on("closed", () => {
        watcher.close();
        watchers.delete(filePath);
      });
    } catch (error) {
      console.error("Failed to watch file:", error);
    }
  });

  // 取消监听文件变化
  ipcMain.handle(IPC_CHANNELS.FILE.UNWATCH, async (_, filePath: string) => {
    const watcher = watchers.get(filePath);
    if (watcher) {
      watcher.close();
      watchers.delete(filePath);
    }
  });
}
