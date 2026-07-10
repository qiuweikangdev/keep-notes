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

const EMPTY_VIEW_STATE: RichPaneViewState = {
  scrollTop: 0,
  topBlockId: null,
  topBlockOffset: 0,
  selection: null,
  width: 0,
};

export function toRichPaneKey(groupId: string, tabId: string): RichPaneKey {
  return `${groupId}:${tabId}`;
}

export class RichPaneViewStateRegistry {
  private readonly states = new Map<RichPaneKey, RichPaneViewState>();

  read(key: RichPaneKey): RichPaneViewState {
    return { ...(this.states.get(key) ?? EMPTY_VIEW_STATE) };
  }

  patch(key: RichPaneKey, patch: Partial<RichPaneViewState>): void {
    // 基于只读快照合并局部状态，避免不同窗格共享可变的顶层对象。
    this.states.set(key, { ...this.read(key), ...patch });
  }

  delete(key: RichPaneKey): void {
    this.states.delete(key);
  }

  clear(): void {
    this.states.clear();
  }
}
