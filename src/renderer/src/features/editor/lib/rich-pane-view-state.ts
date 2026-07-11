export type RichPaneKey = `${string}:${string}`;

export interface RichPaneSelection {
  anchorBlockId: string;
  anchorOffset: number;
  headBlockId: string;
  headOffset: number;
}

export interface RichPaneViewState {
  scrollTop: number;
  topBlockId: string | null;
  topBlockOffset: number;
  selection: RichPaneSelection | null;
  width: number;
}

export interface RichPaneScrollOwner {
  groupId: string;
  tabId: string;
  paneKey: RichPaneKey;
  path: string;
}

interface PendingPaneScroll {
  owner: RichPaneScrollOwner;
  scrollTop: number;
  timer: ReturnType<typeof setTimeout>;
  token: symbol;
}

const EMPTY_VIEW_STATE: RichPaneViewState = {
  scrollTop: 0,
  topBlockId: null,
  topBlockOffset: 0,
  selection: null,
  width: 0,
};

function cloneSelection(
  selection: RichPaneSelection | null,
): RichPaneSelection | null {
  return selection === null ? null : { ...selection };
}

export function toRichPaneKey(groupId: string, tabId: string): RichPaneKey {
  return `${groupId}:${tabId}`;
}

export class RichPaneViewStateRegistry {
  private readonly states = new Map<RichPaneKey, RichPaneViewState>();

  read(key: RichPaneKey): RichPaneViewState {
    const state = this.states.get(key) ?? EMPTY_VIEW_STATE;
    return { ...state, selection: cloneSelection(state.selection) };
  }

  patch(key: RichPaneKey, patch: Partial<RichPaneViewState>): void {
    // 在存储边界复制选区，避免调用方复用或修改输入对象时串改窗格状态。
    const nextState = { ...this.read(key), ...patch };
    this.states.set(key, {
      ...nextState,
      selection: cloneSelection(nextState.selection),
    });
  }

  delete(key: RichPaneKey): void {
    this.states.delete(key);
  }

  clear(): void {
    this.states.clear();
  }
}

function isSameScrollOwner(
  first: RichPaneScrollOwner,
  second: RichPaneScrollOwner,
): boolean {
  return (
    first.paneKey === second.paneKey &&
    first.groupId === second.groupId &&
    first.tabId === second.tabId &&
    first.path === second.path
  );
}

export class RichPaneScrollIdleWriter {
  private readonly states: RichPaneViewStateRegistry;
  private readonly persist: (
    owner: RichPaneScrollOwner,
    scrollTop: number,
  ) => void;
  private readonly delayMs: number;
  private readonly pending = new Map<RichPaneKey, PendingPaneScroll>();
  private destroyed = false;

  constructor(options: {
    states: RichPaneViewStateRegistry;
    persist: (owner: RichPaneScrollOwner, scrollTop: number) => void;
    delayMs?: number;
  }) {
    this.states = options.states;
    this.persist = options.persist;
    this.delayMs = Math.max(0, options.delayMs ?? 150);
  }

  record(owner: RichPaneScrollOwner, scrollTop: number): void {
    if (this.destroyed) return;

    const normalizedScrollTop = Number.isFinite(scrollTop)
      ? Math.max(0, scrollTop)
      : 0;
    const retainedOwner = { ...owner };
    const previous = this.pending.get(owner.paneKey);
    if (previous) {
      if (!isSameScrollOwner(previous.owner, retainedOwner)) {
        // 同一 paneKey 被新文档复用前先提交旧 owner，旧定时器不能写入新绑定。
        this.flushEntry(previous);
      } else {
        clearTimeout(previous.timer);
      }
    }

    this.states.patch(owner.paneKey, { scrollTop: normalizedScrollTop });
    const token = Symbol(owner.paneKey);
    const pending: PendingPaneScroll = {
      owner: retainedOwner,
      scrollTop: normalizedScrollTop,
      token,
      timer: setTimeout(() => {
        const current = this.pending.get(owner.paneKey);
        if (current?.token === token) this.flushEntry(current);
      }, this.delayMs),
    };
    this.pending.set(owner.paneKey, pending);
  }

  flushOwner(owner: RichPaneScrollOwner): void {
    const pending = this.pending.get(owner.paneKey);
    if (pending && isSameScrollOwner(pending.owner, owner)) {
      this.flushEntry(pending);
    }
  }

  flushInactive(activeOwner: RichPaneScrollOwner | null): void {
    for (const pending of this.pending.values()) {
      if (!activeOwner || !isSameScrollOwner(pending.owner, activeOwner)) {
        this.flushEntry(pending);
      }
    }
  }

  flushAll(): void {
    for (const pending of this.pending.values()) {
      this.flushEntry(pending);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.flushAll();
    this.destroyed = true;
  }

  private flushEntry(pending: PendingPaneScroll): void {
    if (this.pending.get(pending.owner.paneKey) !== pending) return;

    this.pending.delete(pending.owner.paneKey);
    clearTimeout(pending.timer);
    this.persist({ ...pending.owner }, pending.scrollTop);
  }
}

export const richPaneViewStateRegistry = new RichPaneViewStateRegistry();
