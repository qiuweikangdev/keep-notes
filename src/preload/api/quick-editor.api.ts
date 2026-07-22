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
const quickEditorContentUpdatedListeners = new Set<
  (content: QuickEditorWindowContent) => void
>();
const pendingQuickEditorContentUpdates: QuickEditorWindowContent[] = [];

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

function dispatchQuickEditorContentUpdated(
  content: QuickEditorWindowContent,
): void {
  if (quickEditorContentUpdatedListeners.size === 0) {
    pendingQuickEditorContentUpdates.push(content);
    return;
  }

  quickEditorContentUpdatedListeners.forEach((listener) => listener(content));
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

ipcRenderer.on(IPC_CHANNELS.QUICK_EDITOR.CONTENT_UPDATED, (_, content) => {
  if (content && typeof content === "object") {
    dispatchQuickEditorContentUpdated(content as QuickEditorWindowContent);
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

  syncQuickEditorContent: (content: QuickEditorWindowContent): void => {
    ipcRenderer.send(IPC_CHANNELS.QUICK_EDITOR.SYNC_CONTENT, content);
  },

  flushQuickEditorContent: (
    source: QuickEditorWindowContent["source"],
  ): Promise<void> => {
    return ipcRenderer.invoke(IPC_CHANNELS.QUICK_EDITOR.FLUSH_CONTENT, source);
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

  onQuickEditorContentUpdated: (
    callback: (content: QuickEditorWindowContent) => void,
  ): (() => void) => {
    quickEditorContentUpdatedListeners.add(callback);

    const pendingContents = pendingQuickEditorContentUpdates.splice(0);
    pendingContents.forEach((content) => callback(content));

    return () => {
      quickEditorContentUpdatedListeners.delete(callback);
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

  getQuickEditorCollapsed: (): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.QUICK_EDITOR.GET_COLLAPSED);
  },

  setQuickEditorCollapsed: (
    collapsed: boolean,
    reduceMotion: boolean,
  ): Promise<boolean> => {
    return ipcRenderer.invoke(
      IPC_CHANNELS.QUICK_EDITOR.SET_COLLAPSED,
      collapsed,
      reduceMotion,
    );
  },

  onQuickEditorCollapsedChanged: (
    callback: (collapsed: boolean) => void,
  ): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
      if (typeof value === "boolean") callback(value);
    };
    ipcRenderer.on(IPC_CHANNELS.QUICK_EDITOR.COLLAPSED_CHANGED, listener);

    return () => {
      ipcRenderer.removeListener(
        IPC_CHANNELS.QUICK_EDITOR.COLLAPSED_CHANGED,
        listener,
      );
    };
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
