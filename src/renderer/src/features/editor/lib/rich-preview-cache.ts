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
  now?: () => number;
  frameBudgetMs?: number;
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

function isVisibleInSurface(block: HTMLElement, surfaceRect: DOMRect): boolean {
  const blockRect = block.getBoundingClientRect();
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
  private exportCount = 0;
  private readonly now: () => number;
  private readonly frameBudgetMs: number;
  private readonly requests = new Map<string, number>();
  private readonly staleIds = new Set<string>();
  private readonly pendingExports = new Set<string>();
  private orderIds = new Set<string>();

  constructor(
    editor: RichPreviewEditor<BSchema, ISchema, SSchema>,
    options: RichPreviewCacheOptions = {},
  ) {
    this.editor = editor;
    this.schedule = options.schedule ?? schedulePreviewFlush;
    this.now = options.now ?? (() => performance.now());
    this.frameBudgetMs = options.frameBudgetMs ?? 4;
  }

  seed(blocks: readonly Block<BSchema, ISchema, SSchema>[]): void {
    if (this.destroyed) return;
    this.cancelPendingFrame();
    this.pendingChangedIds.clear();
    this.pendingStructureChanged = false;
    this.pendingOrder = null;

    // 播种只记录身份；全文 HTML 不属于编辑器首屏的必需工作。
    this.blockSnapshots.clear();
    this.staleIds.clear();
    this.pendingExports.clear();
    this.orderIds = new Set(blocks.map((block) => block.id));
    this.snapshot = {
      revision: this.snapshot.revision + (this.snapshot.order.length ? 1 : 0),
      order: [...this.orderIds],
    };
    for (const id of this.requests.keys()) {
      if (this.orderIds.has(id)) this.pendingExports.add(id);
    }
    for (const registration of this.listeners) registration.listener();
    for (const id of this.blockListeners.keys()) this.publishBlock(id);
    if (this.pendingExports.size) this.ensureFrameScheduled();
  }

  /** 可见块及 overscan 的请求随窗格卸载释放，后台块只保留失效标记。 */
  requestBlocks(ids: readonly string[]): () => void {
    if (this.destroyed) return () => {};
    const requested = new Set(ids);
    for (const id of requested) {
      this.requests.set(id, (this.requests.get(id) ?? 0) + 1);
      if (
        (!this.blockSnapshots.has(id) || this.staleIds.has(id)) &&
        this.orderIds.has(id)
      ) {
        this.pendingExports.add(id);
      }
    }
    if (this.pendingExports.size) this.ensureFrameScheduled();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      for (const id of requested) {
        const count = (this.requests.get(id) ?? 1) - 1;
        if (count > 0) this.requests.set(id, count);
        else {
          this.requests.delete(id);
          this.pendingExports.delete(id);
        }
      }
      if (
        !this.pendingExports.size &&
        !this.pendingChangedIds.size &&
        !this.pendingStructureChanged
      )
        this.cancelPendingFrame();
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
    const snapshotIds = this.orderIds;
    const surfaceRect = surface.getBoundingClientRect();
    const visibleLiveBlocks = new Map<string, HTMLElement>();
    // 浏览器按视口命中块，避免对全文节点逐一读取布局；无命中 API 的测试环境保留扫描兜底。
    const ownerDocument = surface.ownerDocument;
    if (
      typeof ownerDocument.elementsFromPoint === "function" &&
      surfaceRect.width > 0 &&
      surfaceRect.height > 0
    ) {
      const x = surfaceRect.left + surfaceRect.width / 2;
      for (let y = surfaceRect.top + 1; y < surfaceRect.bottom; y += 16) {
        const element = ownerDocument
          .elementsFromPoint(x, y)
          .find((candidate) => surface.contains(candidate));
        let block = element?.closest<HTMLElement>("[data-id]") ?? null;
        while (block && surface.contains(block)) {
          const id = block.dataset.id;
          if (id && snapshotIds.has(id)) {
            visibleLiveBlocks.set(id, block);
            break;
          }
          block =
            block.parentElement?.closest<HTMLElement>("[data-id]") ?? null;
        }
      }
    } else {
      for (const liveBlock of surface.querySelectorAll<HTMLElement>(
        "[data-id]",
      )) {
        const id = liveBlock.dataset.id;
        if (
          id &&
          snapshotIds.has(id) &&
          !visibleLiveBlocks.has(id) &&
          isVisibleInSurface(liveBlock, surfaceRect)
        ) {
          visibleLiveBlocks.set(id, liveBlock);
        }
      }
    }

    for (const [id, liveBlock] of visibleLiveBlocks) {
      const snapshot = this.blockSnapshots.get(id);
      if (!snapshot) {
        const block = this.editor.getBlock(id);
        if (!block) continue;
        this.exportCount += 1;
        const html = this.editor.blocksToFullHTML([block]);
        this.blockSnapshots.set(id, { id, html, revision: nextRevision });
      }
      const currentSnapshot = this.blockSnapshots.get(id)!;
      const template = document.createElement("template");
      template.innerHTML = currentSnapshot.html;
      const previewBlock = findBlockElement(template.content, id);
      if (!previewBlock) continue;

      previewBlock.replaceWith(clonePreviewBlock(liveBlock));
      const html = template.innerHTML;
      // 实时 DOM 已包含当前事务，不能让随后排队的语义导出覆盖代码行号等视觉信息。
      this.staleIds.delete(id);
      this.pendingChangedIds.delete(id);
      this.pendingExports.delete(id);
      if (html === currentSnapshot.html) continue;

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

  getDiagnostics() {
    return {
      blocks: this.orderIds.size,
      cachedBlocks: this.blockSnapshots.size,
      requestedBlocks: this.requests.size,
      pendingExports: this.pendingExports.size,
      exportCount: this.exportCount,
    };
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
    const releaseRequest = this.requestBlocks([id]);

    return () => {
      releaseRequest();
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
    this.requests.clear();
    this.pendingExports.clear();
    this.staleIds.clear();
    this.blockSnapshots.clear();
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
      ? (this.pendingOrder ?? this.snapshot.order)
      : this.snapshot.order;
    this.pendingOrder = null;
    if (structureChanged) this.orderIds = new Set(nextOrder);
    for (const id of changedIds) {
      this.staleIds.add(id);
      if (this.requests.has(id) && this.orderIds.has(id))
        this.pendingExports.add(id);
    }
    if (structureChanged) {
      for (const id of this.staleIds) {
        if (!this.orderIds.has(id)) this.staleIds.delete(id);
      }
      for (const id of this.blockSnapshots.keys()) {
        if (this.orderIds.has(id)) continue;
        this.blockSnapshots.delete(id);
        this.staleIds.delete(id);
        changedIds.add(id);
      }
      for (const id of this.requests.keys()) {
        if (this.orderIds.has(id) && !this.blockSnapshots.has(id))
          this.pendingExports.add(id);
      }
    }

    const nextRevision =
      this.snapshot.revision + (changedIds.size || structureChanged ? 1 : 0);
    const startedAt = this.now();
    const publishedIds = new Set<string>();
    for (const id of this.pendingExports) {
      this.pendingExports.delete(id);
      if (!this.requests.has(id) || !this.orderIds.has(id)) continue;
      const block = this.editor.getBlock(id);
      if (!block) continue;
      this.exportCount += 1;
      this.blockSnapshots.set(id, {
        id,
        html: this.editor.blocksToFullHTML([block]),
        revision: nextRevision,
      });
      this.staleIds.delete(id);
      publishedIds.add(id);
      // 一个复杂块不能在中间截断，其余块留到下一帧，避免整屏导出占满主线程。
      if (this.now() - startedAt >= this.frameBudgetMs) break;
    }
    for (const id of changedIds) {
      if (!this.orderIds.has(id)) publishedIds.add(id);
    }
    if (changedIds.size || structureChanged || publishedIds.size) {
      this.snapshot = { revision: nextRevision, order: nextOrder };
      for (const id of publishedIds) this.publishBlock(id);
      for (const registration of Array.from(this.listeners))
        registration.listener();
    }
    if (this.pendingExports.size) this.ensureFrameScheduled();
  }

  private publishBlock(id: string): void {
    const registrations = this.blockListeners.get(id);
    if (!registrations) return;
    for (const registration of Array.from(registrations)) {
      registration.listener();
    }
  }
}
