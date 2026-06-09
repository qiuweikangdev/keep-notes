import type { Block } from "@blocknote/core";

import { EditorCache } from "./editor-cache";
import {
  createFileOpenController,
  EditorLoadSession,
} from "./editor-load-session";
import {
  EditorSaveCoordinator,
  type EditorSaveState,
} from "./editor-save-coordinator";
import { FileWatchRegistry } from "./file-watch-registry";
import { useEditorStore } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";

export const editorCache = new EditorCache<Block[]>({ maxEntries: 24 });
export const editorLoadSession = new EditorLoadSession();

export function createEditorSaveCoordinator(options: {
  write: (path: string, content: string) => Promise<void>;
  onStateChange: (path: string, state: EditorSaveState, error?: Error) => void;
}): EditorSaveCoordinator {
  return new EditorSaveCoordinator({
    delayMs: 800,
    write: options.write,
    onStateChange: options.onStateChange,
  });
}

export const fileOpenController = createFileOpenController({
  read: (path) => window.electronAPI.readFile(path),
  cache: editorCache,
  session: editorLoadSession,
});

export const editorSaveCoordinator = createEditorSaveCoordinator({
  write: async (path, content) => {
    await window.electronAPI.writeFile(path, content);
    useTreeStore.getState().updateNodeContent(path, content);
  },
  onStateChange: (path, state, error) => {
    useEditorStore
      .getState()
      .setFileSaveState(path, state, error?.message ?? null);
  },
});

type EditorChangeFlusher = () => Promise<void>;
const editorChangeFlushers = new Map<string, EditorChangeFlusher>();
const fileWatchRegistry = new FileWatchRegistry({
  watch: (path) => {
    void window.electronAPI.watchFile(path);
  },
  unwatch: (path) => {
    void window.electronAPI.unwatchFile(path);
  },
  subscribeGlobal: (listener) => window.electronAPI.onFileChanged(listener),
  isOwnWrite: (path, content) =>
    editorSaveCoordinator.isOwnWrite(path, content),
});

function editorInstanceKey(groupId: string, tabId: string): string {
  return `${groupId}:${tabId}`;
}

export function registerEditorChangeFlusher(
  groupId: string,
  tabId: string,
  flush: EditorChangeFlusher,
): () => void {
  const key = editorInstanceKey(groupId, tabId);
  editorChangeFlushers.set(key, flush);
  return () => {
    if (editorChangeFlushers.get(key) === flush) {
      editorChangeFlushers.delete(key);
    }
  };
}

export async function flushEditorChange(
  groupId: string,
  tabId: string,
): Promise<void> {
  await editorChangeFlushers.get(editorInstanceKey(groupId, tabId))?.();
}

export function subscribeToEditorFile(
  path: string,
  listener: (content: string) => void,
): () => void {
  return fileWatchRegistry.subscribe(path, listener);
}
