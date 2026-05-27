import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type { ApiResponse, GitConfig } from "../../shared/types";

export const gitApi = {
  download: (gitConfig: GitConfig): Promise<ApiResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GIT.DOWNLOAD, gitConfig);
  },

  upload: (gitConfig: GitConfig): Promise<ApiResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GIT.UPLOAD, gitConfig);
  },
};
