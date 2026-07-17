import { ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type {
  QuickEditorWindowContent,
  ShortcutRegistrationResult,
} from "../../shared/types";

const quickEditorContentListeners = new Set<
  (content: QuickEditorWindowContent) => void
>();
const pendingQuickEditorContents: QuickEditorWindowContent[] = [];
const quickEditorInitialContentListeners = new Set<
  (content: QuickEditorWindowContent) => void
>();
const pendingQuickEditorInitialContents: QuickEditorWindowContent[] = [];

function dispatchQuickEditorContent(content: QuickEditorWindowContent): void {
  if (quickEditorContentListeners.size === 0) {
    pendingQuickEditorContents.push(content);
    return;
  }

  quickEditorContentListeners.forEach((listener) => listener(content));
}

function dispatchQuickEditorInitialContent(
  content: QuickEditorWindowContent,
): void {
  if (quickEditorInitialContentListeners.size === 0) {
    pendingQuickEditorInitialContents.push(content);
    return;
  }

  quickEditorInitialContentListeners.forEach((listener) => listener(content));
}

async function consumeAndDispatchQuickEditorContent(): Promise<void> {
  const content = await ipcRenderer.invoke(
    IPC_CHANNELS.QUICK_EDITOR.CONSUME_CONTENT,
  );
  if (content && typeof content === "object") {
    dispatchQuickEditorContent(content as QuickEditorWindowContent);
  }
}

ipcRenderer.on(IPC_CHANNELS.QUICK_EDITOR.IMPORT_CONTENT, () => {
  void consumeAndDispatchQuickEditorContent();
});

ipcRenderer.on(IPC_CHANNELS.QUICK_EDITOR.INITIAL_CONTENT, (_, content) => {
  if (content && typeof content === "object") {
    dispatchQuickEditorInitialContent(content as QuickEditorWindowContent);
  }
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

  createQuickEditorWindow: (content?: QuickEditorWindowContent): void => {
    ipcRenderer.send(IPC_CHANNELS.QUICK_EDITOR.CREATE_WINDOW, content);
  },

  onQuickEditorInitialContent: (
    callback: (content: QuickEditorWindowContent) => void,
  ): (() => void) => {
    quickEditorInitialContentListeners.add(callback);

    const pendingContents = pendingQuickEditorInitialContents.splice(0);
    pendingContents.forEach((content) => callback(content));

    return () => {
      quickEditorInitialContentListeners.delete(callback);
    };
  },

  closeQuickEditorWindow: (): void => {
    ipcRenderer.send(IPC_CHANNELS.QUICK_EDITOR.CLOSE_WINDOW);
  },

  returnToMainWindowFromQuickEditor: (
    content: QuickEditorWindowContent,
  ): void => {
    ipcRenderer.send(IPC_CHANNELS.QUICK_EDITOR.RETURN_TO_MAIN_WINDOW, content);
  },

  consumeQuickEditorContent: (): Promise<QuickEditorWindowContent | null> => {
    return ipcRenderer.invoke(IPC_CHANNELS.QUICK_EDITOR.CONSUME_CONTENT);
  },

  onQuickEditorContentImported: (
    callback: (content: QuickEditorWindowContent) => void,
  ): (() => void) => {
    quickEditorContentListeners.add(callback);

    const pendingContents = pendingQuickEditorContents.splice(0);
    pendingContents.forEach((content) => callback(content));

    return () => {
      quickEditorContentListeners.delete(callback);
    };
  },
};
