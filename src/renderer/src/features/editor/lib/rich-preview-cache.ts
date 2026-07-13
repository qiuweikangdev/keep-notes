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

function findBlockElement(root: ParentNode, id: string): HTMLElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLElement>("[data-id]")).find(
      (element) => element.dataset.id === id,
    ) ?? null
  );
}

function isVisibleInSurface(block: HTMLElement, surface: HTMLElement): boolean {
  const blockRect = block.getBoundingClientRect();
  const surfaceRect = surface.getBoundingClientRect();
  if (blockRect.height === 0 || surfaceRect.height === 0) return true;
  return (
    blockRect.bottom >= surfaceRect.top && blockRect.top <= surfaceRect.bottom
  );
}

function clonePreviewBlock(block: HTMLElement): HTMLElement {
  const clone = block.cloneNode(true) as HTMLElement;
  for (const editable of clone.querySelectorAll<HTMLElement>(
    "[contenteditable]",
  )) {
    editable.setAttribute("contenteditable", "false");
  }
  for (const focused of clone.querySelectorAll<HTMLElement>(".cm-focused")) {
    focused.classList.remove("cm-focused");
  }
  for (const transient of clone.querySelectorAll<HTMLElement>(
    ".cm-cursor, .cm-selectionLayer, .cm-tooltip, .editor-code-block-language-popover",
  )) {
    transient.remove();
  }
  return clone;
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

  captureVisualSnapshot(surface: HTMLElement): void {
    if (this.destroyed) return;

    const nextRevision = this.snapshot.revision + 1;
    const changedIds: string[] = [];
    const snapshotIds = new Set(this.snapshot.order);
    const visibleLiveBlocks = new Map<string, HTMLElement>();
    // 单次扫描当前表面，只同步视口内的真实块，避免大文档切换窗格时反复遍历整棵 DOM。
    for (const liveBlock of surface.querySelectorAll<HTMLElement>(
      "[data-id]",
    )) {
      const id = liveBlock.dataset.id;
      if (
        !id ||
        !snapshotIds.has(id) ||
        visibleLiveBlocks.has(id) ||
        !isVisibleInSurface(liveBlock, surface)
      ) {
        continue;
      }
      visibleLiveBlocks.set(id, liveBlock);
    }

    for (const [id, liveBlock] of visibleLiveBlocks) {
      const snapshot = this.blockSnapshots.get(id);
      if (!snapshot) continue;

      const template = document.createElement("template");
      template.innerHTML = snapshot.html;
      const previewBlock = findBlockElement(template.content, id);
      if (!previewBlock) continue;

      previewBlock.replaceWith(clonePreviewBlock(liveBlock));
      const html = template.innerHTML;
      if (html === snapshot.html) continue;

      this.blockSnapshots.set(id, { id, html, revision: nextRevision });
      changedIds.push(id);
    }

    if (changedIds.length === 0) return;
    this.snapshot = { ...this.snapshot, revision: nextRevision };
    for (const id of changedIds) this.publishBlock(id);
    for (const registration of Array.from(this.listeners)) {
      registration.listener();
    }
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
