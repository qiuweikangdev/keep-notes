import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type { ShortcutRegistrationResult } from "../../shared/types";

const quickEditorContentListeners = new Set<(content: string) => void>();
const pendingQuickEditorContents: string[] = [];

function dispatchQuickEditorContent(content: string): void {
  if (quickEditorContentListeners.size === 0) {
    pendingQuickEditorContents.push(content);
    return;
  }

  quickEditorContentListeners.forEach((listener) => listener(content));
}

async function consumeAndDispatchQuickEditorContent(): Promise<void> {
  const content = await ipcRenderer.invoke(
    IPC_CHANNELS.QUICK_EDITOR.CONSUME_CONTENT,
  );
  if (typeof content === "string") dispatchQuickEditorContent(content);
}

ipcRenderer.on(IPC_CHANNELS.QUICK_EDITOR.IMPORT_CONTENT, () => {
  void consumeAndDispatchQuickEditorContent();
});

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

  createQuickEditorWindow: (): void => {
    ipcRenderer.send(IPC_CHANNELS.QUICK_EDITOR.CREATE_WINDOW);
  },

  closeQuickEditorWindow: (): void => {
    ipcRenderer.send(IPC_CHANNELS.QUICK_EDITOR.CLOSE_WINDOW);
  },

  returnToMainWindowFromQuickEditor: (content: string): void => {
    ipcRenderer.send(IPC_CHANNELS.QUICK_EDITOR.RETURN_TO_MAIN_WINDOW, content);
  },

  consumeQuickEditorContent: (): Promise<string | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.QUICK_EDITOR.CONSUME_CONTENT);
  },

  onQuickEditorContentImported: (
    callback: (content: string) => void,
  ): (() => void) => {
    quickEditorContentListeners.add(callback);

    const pendingContents = pendingQuickEditorContents.splice(0);
    pendingContents.forEach((content) => callback(content));

    return () => {
      quickEditorContentListeners.delete(callback);
    };
  },
};
