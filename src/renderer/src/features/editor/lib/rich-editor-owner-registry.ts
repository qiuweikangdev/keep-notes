import { BlockNoteEditor as CoreBlockNoteEditor } from "@blocknote/core";

export interface RichEditorOwnerHandlers {
  resolveFileUrl: (url: string) => Promise<string>;
  uploadFile: (file: File, blockId?: string) => Promise<string>;
}

export interface RichEditorOwnerProxies {
  resolveFileUrl: RichEditorOwnerHandlers["resolveFileUrl"];
  uploadFile: RichEditorOwnerHandlers["uploadFile"];
}

export interface RichEditorOwnerEntry {
  readonly ownerKey: string;
  readonly editor: CoreBlockNoteEditor;
}

export interface RichEditorOwnerMount {
  entry: RichEditorOwnerEntry;
  release: () => void;
}

interface OwnerCommit {
  token: symbol;
  handlers: RichEditorOwnerHandlers;
}

interface OwnerEntry extends RichEditorOwnerEntry {
  handlers: RichEditorOwnerHandlers;
  commits: Map<string, OwnerCommit>;
  pendingRelease: { cancelled: boolean } | null;
}

const destroyedEditors = new WeakSet<CoreBlockNoteEditor>();

function getDebugWindow(): Window & { ProseMirror?: unknown } {
  return window as Window & { ProseMirror?: unknown };
}

function destroyEditor(editor: CoreBlockNoteEditor): void {
  if (destroyedEditors.has(editor)) return;
  destroyedEditors.add(editor);
  // BlockNote 未公开组件所有权销毁入口，需要释放内部 Tiptap editor 的插件与监听器。
  // oxlint-disable-next-line eslint/no-underscore-dangle
  const tiptapEditor = editor._tiptapEditor;
  if (getDebugWindow().ProseMirror === tiptapEditor) {
    delete getDebugWindow().ProseMirror;
  }
  tiptapEditor.destroy();
}

export class RichEditorOwnerRegistry {
  private readonly entries = new Map<string, OwnerEntry>();

  mount(
    ownerKey: string,
    claimKey: string,
    handlers: RichEditorOwnerHandlers,
    createEditor: (proxies: RichEditorOwnerProxies) => CoreBlockNoteEditor,
  ): RichEditorOwnerMount {
    let entry = this.entries.get(ownerKey);
    if (!entry) {
      let createdEntry: OwnerEntry | null = null;
      const editor = createEditor({
        resolveFileUrl: (url) =>
          (createdEntry?.handlers ?? handlers).resolveFileUrl(url),
        uploadFile: (file, blockId) =>
          (createdEntry?.handlers ?? handlers).uploadFile(file, blockId),
      });
      entry = {
        ownerKey,
        editor,
        handlers,
        commits: new Map(),
        pendingRelease: null,
      };
      createdEntry = entry;
      this.entries.set(ownerKey, entry);
      // 保留 useCreateBlockNote 原有的开发调试入口，并在销毁时按实例身份清理。
      // oxlint-disable-next-line eslint/no-underscore-dangle
      getDebugWindow().ProseMirror = editor._tiptapEditor;
    }

    this.cancelPendingRelease(entry);
    const commit: OwnerCommit = { token: Symbol(claimKey), handlers };
    entry.commits.set(claimKey, commit);
    entry.handlers = handlers;

    return {
      entry,
      release: () => {
        if (
          this.entries.get(entry.ownerKey) !== entry ||
          entry.commits.get(claimKey)?.token !== commit.token
        ) {
          return;
        }

        entry.commits.delete(claimKey);
        const remainingCommit = [...entry.commits.values()].at(-1);
        if (remainingCommit) {
          entry.handlers = remainingCommit.handlers;
        } else {
          this.scheduleRelease(entry);
        }
      },
    };
  }

  private scheduleRelease(entry: OwnerEntry): void {
    this.cancelPendingRelease(entry);
    const task = { cancelled: false };
    entry.pendingRelease = task;
    queueMicrotask(() => {
      if (
        task.cancelled ||
        entry.pendingRelease !== task ||
        entry.commits.size > 0
      ) {
        return;
      }
      entry.pendingRelease = null;
      this.destroyEntry(entry);
    });
  }

  private cancelPendingRelease(entry: OwnerEntry): void {
    if (!entry.pendingRelease) return;
    entry.pendingRelease.cancelled = true;
    entry.pendingRelease = null;
  }

  private destroyEntry(entry: OwnerEntry): void {
    if (this.entries.get(entry.ownerKey) !== entry || entry.commits.size > 0) {
      return;
    }
    this.cancelPendingRelease(entry);
    this.entries.delete(entry.ownerKey);
    destroyEditor(entry.editor);
  }
}

export const richEditorOwnerRegistry = new RichEditorOwnerRegistry();
