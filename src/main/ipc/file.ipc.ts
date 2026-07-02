import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type { ExternalOpenAppId } from "../../shared/types";
import { getBrowserWindow } from "../utils";
import {
  readFileContent,
  writeFileContent,
  loadImageAsDataUrl,
  saveImageAttachment,
  saveAsDialog,
  openDialog,
  getSelectedPath,
  genDirTreByPath,
  revealInSystemExplorer,
  copyPathToClipboard,
  listAvailableExternalOpenApps,
  openPathWithExternalApp,
} from "../file";
import type { SaveImageAttachmentInput } from "../../shared/types";
import { openPathInNewWindow } from "../window";
import {
  FileContentWatchRegistry,
  shouldIgnoreFsWatchPath,
  WorkspaceWatchRegistry,
} from "../file-watch";

const fileWatchRegistry = new FileContentWatchRegistry();
const workspaceWatchRegistry = new WorkspaceWatchRegistry();

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

  ipcMain.handle(
    IPC_CHANNELS.FILE.LOAD_IMAGE_AS_DATA_URL,
    async (_, source: string) => {
      return loadImageAsDataUrl(source);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.FILE.SAVE_IMAGE_ATTACHMENT,
    async (_, input: SaveImageAttachmentInput) => {
      return saveImageAttachment(input);
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

  ipcMain.handle(IPC_CHANNELS.FILE.COPY_PATH, async (_, targetPath: string) => {
    return copyPathToClipboard(targetPath);
  });

  ipcMain.handle(
    IPC_CHANNELS.FILE.OPEN_IN_NEW_WINDOW,
    async (_, targetPath: string) => {
      return openPathInNewWindow(targetPath);
    },
  );

  ipcMain.handle(IPC_CHANNELS.FILE.LIST_EXTERNAL_OPEN_APPS, async () => {
    return listAvailableExternalOpenApps();
  });

  ipcMain.handle(
    IPC_CHANNELS.FILE.OPEN_WITH_EXTERNAL_APP,
    async (_, targetPath: string, appId: ExternalOpenAppId) => {
      return openPathWithExternalApp(targetPath, appId);
    },
  );

  ipcMain.handle(IPC_CHANNELS.FILE.WATCH, async (event, filePath: string) => {
    if (shouldIgnoreFsWatchPath(filePath)) return;

    const win = getBrowserWindow(event);
    if (!win) return;

    try {
      fileWatchRegistry.watchFile(filePath, (changedFilePath, content) => {
        if (win.isDestroyed()) return;
        win.webContents.send(
          IPC_CHANNELS.FILE.ON_FILE_CHANGED,
          changedFilePath,
          content,
        );
      });

      win.once("closed", () => {
        fileWatchRegistry.unwatchFile(filePath);
        workspaceWatchRegistry.unwatchAll();
      });
    } catch (error) {
      console.error("Failed to watch file:", error);
    }
  });

  ipcMain.handle(IPC_CHANNELS.FILE.UNWATCH, async (_, filePath: string) => {
    fileWatchRegistry.unwatchFile(filePath);
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
