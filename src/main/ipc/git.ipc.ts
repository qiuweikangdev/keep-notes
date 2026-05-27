import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import { download, upload } from "../git";
import type { GitConfig } from "../../shared/types";

export function registerGitIpc(): void {
  ipcMain.handle(IPC_CHANNELS.GIT.DOWNLOAD, async (_, gitConfig: GitConfig) => {
    return download(gitConfig);
  });

  ipcMain.handle(IPC_CHANNELS.GIT.UPLOAD, async (_, gitConfig: GitConfig) => {
    return upload(gitConfig);
  });
}
