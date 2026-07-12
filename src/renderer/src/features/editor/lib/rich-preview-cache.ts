import type {
  Block,
  BlockNoteEditor,
  BlockSchema,
  DefaultBlockSchema,
  DefaultInlineContentSchema,
  DefaultStyleSchema,
  InlineContentSchema,
  StyleSchema,
} from "@blocknote/core";
import type { Transaction } from "@tiptap/pm/state";

import { collectChangedTopLevelBlocks } from "./editor-transaction-blocks";
import { measureEditorOperation } from "./editor-performance";

export interface RichPreviewBlockSnapshot {
  id: string;
  html: string;
  revision: number;
}

export interface RichPreviewSnapshot {
  revision: number;
  order: readonly string[];
}

export interface RichPreviewCacheOptions {
  schedule?: (callback: () => void) => () => void;
}

interface ListenerRegistration {
  listener: () => void;
}

interface PendingFrame {
  cancel: (() => void) | null;
}

type RichPreviewEditor<
  BSchema extends BlockSchema,
  ISchema extends InlineContentSchema,
  SSchema extends StyleSchema,
> = Pick<
  BlockNoteEditor<BSchema, ISchema, SSchema>,
  "getBlock" | "blocksToFullHTML"
>;

function schedulePreviewFlush(callback: () => void): () => void {
  if (typeof window.requestAnimationFrame === "function") {
    const handle = window.requestAnimationFrame(callback);
    return () => window.cancelAnimationFrame(handle);
  }

  const handle = window.setTimeout(callback, 0);
  return () => window.clearTimeout(handle);
}

export class RichPreviewCache<
  BSchema extends BlockSchema = DefaultBlockSchema,
  ISchema extends InlineContentSchema = DefaultInlineContentSchema,
  SSchema extends StyleSchema = DefaultStyleSchema,
> {
  private readonly editor: RichPreviewEditor<BSchema, ISchema, SSchema>;
  private readonly schedule: (callback: () => void) => () => void;
  private blockSnapshots = new Map<string, RichPreviewBlockSnapshot>();
  private snapshot: RichPreviewSnapshot = { revision: 0, order: [] };
  private readonly listeners = new Set<ListenerRegistration>();
  private readonly blockListeners = new Map<
    string,
    Set<ListenerRegistration>
  >();
  private readonly pendingChangedIds = new Set<string>();
  private pendingStructureChanged = false;
  private pendingOrder: string[] | null = null;
  private pendingFrame: PendingFrame | null = null;
  private destroyed = false;

  constructor(
    editor: RichPreviewEditor<BSchema, ISchema, SSchema>,
    options: RichPreviewCacheOptions = {},
  ) {
    this.editor = editor;
    this.schedule = options.schedule ?? schedulePreviewFlush;
  }

  seed(blocks: readonly Block<BSchema, ISchema, SSchema>[]): void {
    if (this.destroyed) return;
    this.cancelPendingFrame();
    this.pendingChangedIds.clear();
    this.pendingStructureChanged = false;
    this.pendingOrder = null;

    const blockSnapshots = new Map<string, RichPreviewBlockSnapshot>();
    for (const block of blocks) {
      blockSnapshots.set(block.id, {
        id: block.id,
        html: this.editor.blocksToFullHTML([block]),
        revision: this.snapshot.revision,
      });
    }
    this.blockSnapshots = blockSnapshots;
    this.snapshot = {
      revision: this.snapshot.revision,
      order: blocks.map((block) => block.id),
    };
  }

  handleTransaction(transaction: Transaction): void {
    if (this.destroyed || !transaction.docChanged) return;

    const changes = collectChangedTopLevelBlocks(transaction);
    changes.changedIds.forEach((id) => this.pendingChangedIds.add(id));
    if (changes.structureChanged) {
      this.pendingStructureChanged = true;
      this.pendingOrder = changes.order;
    }
    if (this.pendingChangedIds.size === 0 && !this.pendingStructureChanged) {
      return;
    }

    this.ensureFrameScheduled();
  }

  getSnapshot(): RichPreviewSnapshot {
    return this.snapshot;
  }

  getBlockSnapshot(id: string): RichPreviewBlockSnapshot | null {
    return this.blockSnapshots.get(id) ?? null;
  }

  subscribe(listener: () => void): () => void {
    if (this.destroyed) return () => {};
    const registration = { listener };
    this.listeners.add(registration);
    return () => {
      this.listeners.delete(registration);
    };
  }

  subscribeBlock(id: string, listener: () => void): () => void {
    if (this.destroyed) return () => {};
    const registrations =
      this.blockListeners.get(id) ?? new Set<ListenerRegistration>();
    const registration = { listener };
    registrations.add(registration);
    this.blockListeners.set(id, registrations);

    return () => {
      registrations.delete(registration);
      if (
        registrations.size === 0 &&
        this.blockListeners.get(id) === registrations
      ) {
        this.blockListeners.delete(id);
      }
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelPendingFrame();
    this.pendingChangedIds.clear();
    this.pendingStructureChanged = false;
    this.pendingOrder = null;
    this.listeners.clear();
    this.blockListeners.clear();
  }

  private ensureFrameScheduled(): void {
    if (this.pendingFrame) return;

    const pendingFrame: PendingFrame = { cancel: null };
    this.pendingFrame = pendingFrame;
    const cancel = this.schedule(() => {
      if (this.destroyed || this.pendingFrame !== pendingFrame) return;
      this.pendingFrame = null;
      if (import.meta.env.DEV) {
        measureEditorOperation("editor:preview-frame", () => this.flush());
      } else {
        this.flush();
      }
    });
    if (this.pendingFrame === pendingFrame) pendingFrame.cancel = cancel;
  }

  private cancelPendingFrame(): void {
    const pendingFrame = this.pendingFrame;
    this.pendingFrame = null;
    pendingFrame?.cancel?.();
  }

  private flush(): void {
    const changedIds = new Set(this.pendingChangedIds);
    this.pendingChangedIds.clear();
    const structureChanged = this.pendingStructureChanged;
    this.pendingStructureChanged = false;
    const nextOrder = structureChanged
      ? (this.pendingOrder ?? [...this.snapshot.order])
      : this.snapshot.order;
    this.pendingOrder = null;

    if (structureChanged) {
      // 新插入块即使位于空边界，也要在本帧补齐预览缓存。
      for (const id of nextOrder) {
        if (!this.blockSnapshots.has(id)) changedIds.add(id);
      }
    }

    const nextRevision = this.snapshot.revision + 1;
    for (const id of changedIds) {
      const block = this.editor.getBlock(id);
      if (!block) {
        this.blockSnapshots.delete(id);
        continue;
      }
      this.blockSnapshots.set(id, {
        id,
        html: this.editor.blocksToFullHTML([block]),
        revision: nextRevision,
      });
    }

    if (structureChanged) {
      const retainedIds = new Set(nextOrder);
      for (const id of this.blockSnapshots.keys()) {
        if (retainedIds.has(id)) continue;
        this.blockSnapshots.delete(id);
        changedIds.add(id);
      }
    }

    this.snapshot = { revision: nextRevision, order: nextOrder };
    // 块订阅先发布，文档订阅在同一帧末尾仅发布一次。
    for (const id of changedIds) this.publishBlock(id);
    for (const registration of Array.from(this.listeners)) {
      registration.listener();
    }
  }

  private publishBlock(id: string): void {
    const registrations = this.blockListeners.get(id);
    if (!registrations) return;
    for (const registration of Array.from(registrations)) {
      registration.listener();
    }
  }
}
