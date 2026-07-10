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
