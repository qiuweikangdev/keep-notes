import { contextBridge } from "electron";
import { windowApi } from "./api/window.api";
import { fileApi } from "./api/file.api";
import { treeApi } from "./api/tree.api";
import { gitApi } from "./api/git.api";
import { appApi } from "./api/app.api";
import { reminderApi } from "./api/reminder.api";

const api = {
  ...appApi,
  ...windowApi,
  ...fileApi,
  ...treeApi,
  ...reminderApi,
};

const git = {
  ...gitApi,
};

if (globalThis.process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electronAPI", api);
    contextBridge.exposeInMainWorld("gitAPI", git);
  } catch (error) {
    console.error(error);
  }
} else {
  (window as any).electronAPI = api(window as any).gitAPI = git;
}
