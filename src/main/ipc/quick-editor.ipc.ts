import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import {
  closeQuickEditorWindow,
  configureQuickEditorGlobalShortcuts,
  consumePendingQuickEditorContent,
  createQuickEditorWindow,
  getQuickEditorCollapsed,
  returnToMainWindowFromQuickEditor,
  setQuickEditorCollapsed,
  showQuickEditorWindow,
  syncQuickEditorContent,
} from "../quick-editor-window";
import { getBrowserWindow } from "../utils";

export function registerQuickEditorIpc(): void {
  ipcMain.handle(
    IPC_CHANNELS.QUICK_EDITOR.SET_GLOBAL_SHORTCUT,
    (_, keys: unknown) => {
      if (
        !Array.isArray(keys) ||
        !keys.every((key) => typeof key === "string" && key.length <= 100)
      ) {
        return { success: false, failedKeys: [] };
      }

      return configureQuickEditorGlobalShortcuts(keys);
    },
  );

  ipcMain.on(IPC_CHANNELS.QUICK_EDITOR.SHOW_WINDOW, () => {
    showQuickEditorWindow();
  });

  ipcMain.on(IPC_CHANNELS.QUICK_EDITOR.CREATE_WINDOW, (_, content: unknown) => {
    createQuickEditorWindow(content);
  });

  ipcMain.on(
    IPC_CHANNELS.QUICK_EDITOR.SYNC_CONTENT,
    (event, content: unknown) => {
      syncQuickEditorContent(content, getBrowserWindow(event));
    },
  );

  ipcMain.on(IPC_CHANNELS.QUICK_EDITOR.CLOSE_WINDOW, (event) => {
    closeQuickEditorWindow(getBrowserWindow(event));
  });

  ipcMain.on(
    IPC_CHANNELS.QUICK_EDITOR.RETURN_TO_MAIN_WINDOW,
    (event, content: unknown) => {
      returnToMainWindowFromQuickEditor(content, getBrowserWindow(event));
    },
  );

  ipcMain.handle(IPC_CHANNELS.QUICK_EDITOR.GET_COLLAPSED, (event) => {
    return getQuickEditorCollapsed(getBrowserWindow(event));
  });

  ipcMain.handle(
    IPC_CHANNELS.QUICK_EDITOR.SET_COLLAPSED,
    (event, collapsed: unknown, reduceMotion: unknown) => {
      if (typeof collapsed !== "boolean" || typeof reduceMotion !== "boolean") {
        return false;
      }

      return setQuickEditorCollapsed(
        getBrowserWindow(event),
        collapsed,
        reduceMotion,
      );
    },
  );

  ipcMain.handle(IPC_CHANNELS.QUICK_EDITOR.CONSUME_CONTENT, () => {
    return consumePendingQuickEditorContent();
  });
}
