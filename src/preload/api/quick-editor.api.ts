import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type { ShortcutRegistrationResult } from "../../shared/types";

export const quickEditorApi = {
  setQuickEditorGlobalShortcut: (
    keys: string[],
  ): Promise<ShortcutRegistrationResult> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.QUICK_EDITOR.SET_GLOBAL_SHORTCUT,
      keys,
    );
  },

  showQuickEditorWindow: (): void => {
    ipcRenderer.send(IPC_CHANNELS.QUICK_EDITOR.SHOW_WINDOW);
  },

  closeQuickEditorWindow: (): void => {
    ipcRenderer.send(IPC_CHANNELS.QUICK_EDITOR.CLOSE_WINDOW);
  },

  returnToMainWindowFromQuickEditor: (): void => {
    ipcRenderer.send(IPC_CHANNELS.QUICK_EDITOR.RETURN_TO_MAIN_WINDOW);
  },
};
