import type { Block, BlockNoteEditor } from "@blocknote/core";
import type { Transaction } from "@tiptap/pm/state";
import { Step } from "@tiptap/pm/transform";

interface RichTextEditor {
  readonly document: unknown;
  readonly _tiptapEditor: BlockNoteEditor["_tiptapEditor"];
}

interface EditorInstanceRegistration {
  groupId: string;
  tabId: string;
  path: string | null;
  editor: RichTextEditor;
  standby?: boolean;
  mirrorSourceGroupId?: string;
  mirrorSourceTabId?: string;
  isApplying?: () => boolean;
  onDesynchronized?: () => void;
  onSynchronizationPending?: () => void;
  onSynchronized?: () => void;
}

interface RegisteredEditor extends EditorInstanceRegistration {
  syncGroupId: string;
  stale: boolean;
  revision: number;
  pendingRevision: number | null;
  pendingSteps: unknown[];
  cancelPendingSynchronization: (() => void) | null;
  handleTransaction: (event: { transaction: Transaction }) => void;
}

interface EditorInstanceRegistryOptions {
  schedule?: (callback: () => void) => () => void;
}

export const EDITOR_MIRROR_TRANSACTION_META = "keep-notes-editor-mirror";

function editorInstanceKey(groupId: string, tabId: string): string {
  return `${groupId}:${tabId}`;
}

function scheduleEditorSynchronization(callback: () => void): () => void {
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback);
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(callback, 0);
  return () => window.clearTimeout(handle);
}

export class EditorInstanceRegistry {
  private readonly entries = new Map<string, RegisteredEditor>();
  private readonly schedule: (callback: () => void) => () => void;

  constructor(options: EditorInstanceRegistryOptions = {}) {
    this.schedule = options.schedule ?? scheduleEditorSynchronization;
  }

  register(registration: EditorInstanceRegistration): () => void {
    const key = editorInstanceKey(registration.groupId, registration.tabId);
    const previousEntry = this.entries.get(key);
    previousEntry?.editor._tiptapEditor.off(
      "transaction",
      previousEntry.handleTransaction,
    );
    previousEntry?.cancelPendingSynchronization?.();

    const entry: RegisteredEditor = {
      ...registration,
      syncGroupId: previousEntry?.syncGroupId ?? key,
      stale: false,
      revision: previousEntry ? previousEntry.revision + 1 : 0,
      pendingRevision: null,
      pendingSteps: [],
      cancelPendingSynchronization: null,
      handleTransaction: ({ transaction }) => {
        this.mirrorTransaction(key, transaction);
      },
    };
    const mirrorSourceKey =
      entry.mirrorSourceGroupId && entry.mirrorSourceTabId
        ? editorInstanceKey(entry.mirrorSourceGroupId, entry.mirrorSourceTabId)
        : null;
    const synchronizedPeer = mirrorSourceKey
      ? this.entries.get(mirrorSourceKey)
      : undefined;
    if (synchronizedPeer) {
      entry.syncGroupId = synchronizedPeer.syncGroupId;
      if (
        JSON.stringify(
          synchronizedPeer.editor._tiptapEditor.state.doc.toJSON(),
        ) === JSON.stringify(entry.editor._tiptapEditor.state.doc.toJSON())
      ) {
        entry.revision = synchronizedPeer.revision;
      } else {
        entry.stale = true;
      }
    }
    this.entries.set(key, entry);
    if (!entry.standby) {
      for (const peer of this.entries.values()) {
        if (
          peer !== entry &&
          peer.standby &&
          peer.mirrorSourceGroupId === entry.groupId &&
          peer.mirrorSourceTabId === entry.tabId
        ) {
          this.markStale(peer);
        }
      }
    }
    entry.editor._tiptapEditor.on("transaction", entry.handleTransaction);
    if (entry.stale) entry.onDesynchronized?.();

    return () => {
      if (this.entries.get(key) !== entry) return;
      entry.editor._tiptapEditor.off("transaction", entry.handleTransaction);
      entry.cancelPendingSynchronization?.();
      this.entries.delete(key);
    };
  }

  setStandby(groupId: string, tabId: string, standby: boolean): void {
    const entry = this.entries.get(editorInstanceKey(groupId, tabId));
    if (!entry) return;
    entry.standby = standby;
  }

  getDocumentSnapshot(groupId: string, tabId: string): Block[] | null {
    const entry = this.entries.get(editorInstanceKey(groupId, tabId));
    if (!entry || entry.stale) return null;
    return entry.editor.document as Block[];
  }

  isDocumentSynchronized(
    sourceGroupId: string,
    sourceTabId: string,
    targetGroupId: string,
    targetTabId: string,
  ): boolean {
    const source = this.entries.get(
      editorInstanceKey(sourceGroupId, sourceTabId),
    );
    const target = this.entries.get(
      editorInstanceKey(targetGroupId, targetTabId),
    );
    if (!source || !target || source.stale || target.stale) return false;
    return (
      source.path === target.path &&
      source.syncGroupId === target.syncGroupId &&
      source.revision === target.revision
    );
  }

  getSynchronizedTabIds(groupId: string, tabId: string): string[] {
    const source = this.entries.get(editorInstanceKey(groupId, tabId));
    if (!source || source.stale || !source.path) return [];

    return Array.from(
      new Set(
        Array.from(this.entries.values())
          .filter(
            (entry) =>
              !entry.stale &&
              entry.path === source.path &&
              entry.syncGroupId === source.syncGroupId,
          )
          .map((entry) => entry.tabId),
      ),
    );
  }

  flushPending(groupId: string, tabId: string): void {
    const entry = this.entries.get(editorInstanceKey(groupId, tabId));
    if (!entry || entry.stale || entry.pendingRevision === null) return;

    entry.cancelPendingSynchronization?.();
    entry.cancelPendingSynchronization = null;
    this.flushPendingSynchronization(entry);
  }

  private mirrorTransaction(sourceKey: string, transaction: Transaction): void {
    if (
      !transaction.docChanged ||
      transaction.getMeta(EDITOR_MIRROR_TRANSACTION_META)
    ) {
      return;
    }

    const source = this.entries.get(sourceKey);
    if (!source || source.stale || !source.path) return;
    if (source.isApplying?.()) {
      for (const target of this.entries.values()) {
        if (
          target !== source &&
          target.syncGroupId === source.syncGroupId &&
          target.path === source.path
        ) {
          this.markStale(target);
        }
      }
      return;
    }

    const nextRevision = source.revision + 1;

    for (const [targetKey, target] of this.entries) {
      if (
        targetKey === sourceKey ||
        target.path !== source.path ||
        target.stale ||
        target.syncGroupId !== source.syncGroupId
      ) {
        continue;
      }

      const expectedRevision = target.pendingRevision ?? target.revision;
      if (target.isApplying?.() || expectedRevision !== source.revision) {
        this.markStale(target);
        continue;
      }

      target.pendingSteps.push(
        ...transaction.steps.map((step) => step.toJSON()),
      );
      target.pendingRevision = nextRevision;
      target.onSynchronizationPending?.();
      if (!target.cancelPendingSynchronization) {
        target.cancelPendingSynchronization = this.schedule(() => {
          target.cancelPendingSynchronization = null;
          this.flushPendingSynchronization(target);
        });
      }
    }
    source.revision = nextRevision;
  }

  private flushPendingSynchronization(target: RegisteredEditor): void {
    const pendingRevision = target.pendingRevision;
    if (
      target.stale ||
      pendingRevision === null ||
      target.pendingSteps.length === 0
    ) {
      return;
    }

    const pendingSteps = target.pendingSteps;
    target.pendingSteps = [];
    target.pendingRevision = null;
    try {
      const targetEditor = target.editor._tiptapEditor;
      const mirroredTransaction = targetEditor.state.tr;
      for (const step of pendingSteps) {
        mirroredTransaction.step(
          Step.fromJSON(targetEditor.state.schema, step),
        );
      }
      mirroredTransaction.setMeta(EDITOR_MIRROR_TRANSACTION_META, true);
      mirroredTransaction.setMeta("addToHistory", false);
      targetEditor.view.dispatch(mirroredTransaction);

      // Step 应用成功且修订号连续即可确认同步，避免每次输入后遍历并序列化整棵大文档。
      const source = Array.from(this.entries.values()).find(
        (entry) =>
          entry !== target &&
          !entry.stale &&
          entry.path === target.path &&
          entry.syncGroupId === target.syncGroupId &&
          entry.revision === pendingRevision,
      );
      if (!source) {
        this.markStale(target);
        return;
      }
      target.revision = pendingRevision;
      target.onSynchronized?.();
    } catch {
      this.markStale(target);
    }
  }

  private markStale(entry: RegisteredEditor): void {
    if (entry.stale) return;
    entry.stale = true;
    entry.cancelPendingSynchronization?.();
    entry.cancelPendingSynchronization = null;
    entry.pendingRevision = null;
    entry.pendingSteps = [];
    entry.onDesynchronized?.();
  }
}

export const editorInstanceRegistry = new EditorInstanceRegistry();
