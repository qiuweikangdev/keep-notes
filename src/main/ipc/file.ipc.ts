import { ipcMain } from "electron";
import { watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
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
import { shouldIgnoreFsWatchPath, WorkspaceWatchRegistry } from "../file-watch";

const fileWatchers = new Map<string, FSWatcher>();
const workspaceWatchRegistry = new WorkspaceWatchRegistry();

function isFileMissingError(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

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
    async (_, targetPath: string) => {
      return revealInSystemExplorer(targetPath);
    },
  );

  ipcMain.handle(IPC_CHANNELS.FILE.WATCH, async (event, filePath: string) => {
    if (shouldIgnoreFsWatchPath(filePath)) return;

    const existingWatcher = fileWatchers.get(filePath);
    if (existingWatcher) {
      existingWatcher.close();
      fileWatchers.delete(filePath);
    }

    const win = getBrowserWindow(event);
    if (!win) return;

    try {
      const watcher = watch(filePath, async (eventType) => {
        if (eventType !== "change" || shouldIgnoreFsWatchPath(filePath)) return;

        try {
          // 文件内容只在打开的文件监听中读取，工作区监听只负责刷新树。
          const content = await readFile(filePath, "utf-8");
          if (win.isDestroyed()) return;
          win.webContents.send(
            IPC_CHANNELS.FILE.ON_FILE_CHANGED,
            filePath,
            content,
          );
        } catch (error) {
          // 外部删除或重命名会产生短暂读失败，这类竞态不打扰用户。
          if (isFileMissingError(error)) return;
          console.error("Failed to read changed file:", error);
        }
      });

      fileWatchers.set(filePath, watcher);

      win.once("closed", () => {
        watcher.close();
        fileWatchers.delete(filePath);
        workspaceWatchRegistry.unwatchAll();
      });
    } catch (error) {
      console.error("Failed to watch file:", error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FILE.UNWATCH, async (_, filePath: string) => {
    const watcher = fileWatchers.get(filePath);
    if (!watcher) return;

    watcher.close();
    fileWatchers.delete(filePath);
  });

  ipcMain.handle(
    IPC_CHANNELS.FILE.WATCH_WORKSPACE,
    async (event, rootPath: string) => {
      if (shouldIgnoreFsWatchPath(rootPath)) return;

      const win = getBrowserWindow(event);
      if (!win) return;

      try {
        workspaceWatchRegistry.watchWorkspace(rootPath, (changedRootPath) => {
          if (win.isDestroyed()) return;
          win.webContents.send(
            IPC_CHANNELS.FILE.ON_WORKSPACE_CHANGED,
            changedRootPath,
          );
        });

        win.once("closed", () => {
          workspaceWatchRegistry.unwatchWorkspace(rootPath);
        });
      } catch (error) {
        console.error("Failed to watch workspace:", error);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.FILE.UNWATCH_WORKSPACE,
    async (_, rootPath: string) => {
      workspaceWatchRegistry.unwatchWorkspace(rootPath);
    },
  );
}
