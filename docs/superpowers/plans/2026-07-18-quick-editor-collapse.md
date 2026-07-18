# Quick Editor Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact single-chevron control that collapses each floating quick editor upward to a `38px` title bar, restores its previous height, and permits normal manual resizing down to `80px` by `80px`.

**Architecture:** Keep native window bounds, minimum-size overrides, animation, and per-window transition state in `src/main/quick-editor-window.ts`. Expose only two typed request/response operations through quick-editor IPC and preload, then render the responsive accessible control in the existing React quick-editor title bar while keeping BlockNote mounted during collapse.

**Tech Stack:** Electron, Vite, React 19, TypeScript, Lucide React, CSS, Vitest, Testing Library

## Global Constraints

- Use the existing local `node_modules`; do not install, delete, move, prune, or recreate dependencies.
- Do not modify `package.json` or `pnpm-lock.yaml`.
- Keep the default quick-editor size at `640px` by `420px`.
- Use `80px` by `80px` as the normal manual-resize minimum.
- Permit `80px` by `38px` only while the window is collapsed or collapsing.
- Preserve the current top edge, horizontal position, and width while animating height.
- Use a `160ms` ease-out animation and apply final bounds immediately for reduced motion.
- Track collapsed state, expanded height, transition work, and cleanup independently per quick-editor `BrowserWindow`.
- Keep BlockNote mounted so content, selection, history, and unsaved state survive collapse.
- Keep collapse/expand and close visible at `80px` width; hide only new-editor and return-to-application at narrow widths.
- Use `ChevronUp` while expanded, `ChevronDown` while collapsed, and render both at `15px`.
- Use state-specific Chinese accessible names and tooltips: `折叠编辑器` and `展开编辑器`.
- Do not persist collapsed state across application restarts.
- Preserve unrelated uncommitted work in the `dev` workspace.
- Write Chinese comments for core method logic and English Conventional Commit messages.

---

## File Map

- `src/main/quick-editor-window.ts`: Owns quick-editor membership, per-window collapse state, height animation, minimum-size changes, and cleanup.
- `src/main/quick-editor-window.test.ts`: Verifies native bounds, animation, reduced motion, independent windows, duplicate requests, and destroy cleanup.
- `src/shared/constants/ipc-channels.ts`: Defines the two quick-editor collapse IPC channel names.
- `src/main/ipc/quick-editor.ipc.ts`: Resolves the sender window, validates request values, and delegates to the main-process collapse functions.
- `src/main/ipc/quick-editor.ipc.test.ts`: Verifies sender routing and request validation without constructing real Electron windows.
- `src/preload/api/quick-editor.api.ts`: Exposes typed renderer-safe wrappers for reading and changing collapsed state.
- `src/preload/api/quick-editor.api.test.ts`: Verifies exact `ipcRenderer.invoke` channel and argument usage.
- `src/renderer/src/types/electron.d.ts`: Adds the two collapse methods to the renderer's `ElectronAPI` contract.
- `src/renderer/src/features/editor/components/quick-editor-window.tsx`: Owns button state, reduced-motion detection, transition locking, mounted editor visibility, and focus restoration.
- `src/renderer/src/features/editor/components/quick-editor-window.test.ts`: Verifies icon state, accessible names, transition locking, mounted content, and focus restoration.
- `src/renderer/src/features/editor/components/quick-editor-window.css`: Splits left/right title-bar actions and implements collapsed and narrow-width presentation.
- `src/renderer/src/features/editor/components/quick-editor-window-css.test.ts`: Verifies the smallest-width action visibility and collapsed editor rules.

### Task 1: Add per-window native collapse state and height animation

**Files:**

- Modify: `src/main/quick-editor-window.test.ts`
- Modify: `src/main/quick-editor-window.ts`

**Interfaces:**

- Produces: `getQuickEditorCollapsed(win: BrowserWindow | null): boolean`.
- Produces: `setQuickEditorCollapsed(win: BrowserWindow | null, collapsed: boolean, reduceMotion?: boolean): Promise<boolean>`.
- Preserves: `showQuickEditorWindow()`, `createQuickEditorWindow()`, close/save behavior, source synchronization, and default bounds.
- Native result: the returned boolean is the final collapsed state; invalid windows return `false` without changing any bounds.

- [ ] **Step 1: Extend the BrowserWindow mock with real bounds and minimum-size spies**

In `src/main/quick-editor-window.test.ts`, give `MockBrowserWindow` mutable bounds and the native methods used by the implementation:

```ts
private bounds: Electron.Rectangle;
readonly getBounds = vi.fn(() => ({ ...this.bounds }));
readonly setBounds = vi.fn((bounds: Electron.Rectangle) => {
  this.bounds = { ...bounds };
});
readonly setMinimumSize = vi.fn();

constructor(options: Electron.BrowserWindowConstructorOptions) {
  this.options = options;
  this.bounds = {
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: options.width ?? 0,
    height: options.height ?? 0,
  };
}
```

Import the new public functions from `./quick-editor-window`:

```ts
import {
  configureQuickEditorGlobalShortcuts,
  consumePendingQuickEditorContent,
  createQuickEditorWindow,
  disposeQuickEditorWindow,
  getQuickEditorCollapsed,
  returnToMainWindowFromQuickEditor,
  setQuickEditorCollapsed,
  showQuickEditorWindow,
  syncQuickEditorContent,
} from "./quick-editor-window";
```

- [ ] **Step 2: Write failing native-window collapse tests**

Update the existing constructor assertion to require the new normal minimum:

```ts
expect(win.options).toMatchObject({
  x: 400,
  y: 240,
  width: 640,
  height: 420,
  minWidth: 80,
  minHeight: 80,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
});
```

Add these cases to the existing `describe` block:

```ts
it("collapses upward and restores the previous height", async () => {
  vi.useFakeTimers();
  try {
    const win = createQuickEditorWindow();
    const nativeWindow = electronMocks.windows[0];
    nativeWindow.setBounds({ x: 320, y: 180, width: 520, height: 360 });
    nativeWindow.setBounds.mockClear();

    const collapse = setQuickEditorCollapsed(win, true);
    expect(nativeWindow.setMinimumSize).toHaveBeenCalledWith(80, 38);
    await vi.advanceTimersByTimeAsync(160);
    await expect(collapse).resolves.toBe(true);
    expect(nativeWindow.getBounds()).toEqual({
      x: 320,
      y: 180,
      width: 520,
      height: 38,
    });
    expect(getQuickEditorCollapsed(win)).toBe(true);

    const expand = setQuickEditorCollapsed(win, false);
    await vi.advanceTimersByTimeAsync(160);
    await expect(expand).resolves.toBe(false);
    expect(nativeWindow.getBounds()).toEqual({
      x: 320,
      y: 180,
      width: 520,
      height: 360,
    });
    expect(nativeWindow.setMinimumSize).toHaveBeenLastCalledWith(80, 80);
  } finally {
    vi.useRealTimers();
  }
});

it("applies reduced-motion collapse without animation frames", async () => {
  const win = createQuickEditorWindow();
  const nativeWindow = electronMocks.windows[0];
  nativeWindow.setBounds.mockClear();

  await expect(setQuickEditorCollapsed(win, true, true)).resolves.toBe(true);

  expect(nativeWindow.setBounds).toHaveBeenCalledTimes(1);
  expect(nativeWindow.getBounds()).toMatchObject({ height: 38 });
});

it("keeps collapse state and restore height isolated per window", async () => {
  const first = createQuickEditorWindow();
  const second = createQuickEditorWindow();
  electronMocks.windows[0].setBounds({ x: 10, y: 20, width: 300, height: 240 });
  electronMocks.windows[1].setBounds({ x: 40, y: 50, width: 280, height: 190 });

  await setQuickEditorCollapsed(first, true, true);

  expect(getQuickEditorCollapsed(first)).toBe(true);
  expect(getQuickEditorCollapsed(second)).toBe(false);
  expect(electronMocks.windows[0].getBounds()).toMatchObject({ height: 38 });
  expect(electronMocks.windows[1].getBounds()).toMatchObject({ height: 190 });

  await setQuickEditorCollapsed(first, false, true);
  expect(electronMocks.windows[0].getBounds()).toMatchObject({ height: 240 });
});

it("reuses an in-flight transition and clears it when destroyed", async () => {
  vi.useFakeTimers();
  try {
    const win = createQuickEditorWindow();
    const nativeWindow = electronMocks.windows[0];

    const firstRequest = setQuickEditorCollapsed(win, true);
    const duplicateRequest = setQuickEditorCollapsed(win, true);
    expect(duplicateRequest).toBe(firstRequest);

    win.destroy();
    await expect(firstRequest).resolves.toBe(false);
    expect(getQuickEditorCollapsed(win)).toBe(false);
    expect(nativeWindow.setBounds).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ height: 38 }),
    );
  } finally {
    vi.useRealTimers();
  }
});

it("ignores collapse requests for windows outside the quick-editor set", async () => {
  const unrelated = new electronMocks.MockBrowserWindow({
    x: 1,
    y: 2,
    width: 300,
    height: 200,
  });

  await expect(setQuickEditorCollapsed(unrelated, true, true)).resolves.toBe(
    false,
  );
  expect(unrelated.setMinimumSize).not.toHaveBeenCalled();
  expect(unrelated.setBounds).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the main-process test and verify the red state**

Run:

```bash
pnpm test src/main/quick-editor-window.test.ts
```

Expected: FAIL because the two collapse functions do not exist and the constructor still uses `440px` by `300px` minimum dimensions.

- [ ] **Step 4: Implement deterministic per-window height transitions**

In `src/main/quick-editor-window.ts`, replace the minimum constants and add transition constants and state:

```ts
const QUICK_EDITOR_WINDOW_MIN_WIDTH = 80;
const QUICK_EDITOR_WINDOW_MIN_HEIGHT = 80;
const QUICK_EDITOR_COLLAPSED_HEIGHT = 38;
const QUICK_EDITOR_COLLAPSE_DURATION = 160;
const QUICK_EDITOR_COLLAPSE_FRAME_INTERVAL = 16;

interface QuickEditorCollapseState {
  cancelAnimation: (() => void) | null;
  collapsed: boolean;
  expandedHeight: number;
  transition: Promise<boolean> | null;
}

const quickEditorCollapseStates = new Map<
  BrowserWindow,
  QuickEditorCollapseState
>();
```

Add these helpers before `showQuickEditorWindow`:

```ts
function createQuickEditorCollapseState(
  expandedHeight: number,
): QuickEditorCollapseState {
  return {
    cancelAnimation: null,
    collapsed: false,
    expandedHeight,
    transition: null,
  };
}

function animateQuickEditorHeight(
  win: BrowserWindow,
  state: QuickEditorCollapseState,
  targetHeight: number,
  reduceMotion: boolean,
): Promise<boolean> {
  const startHeight = win.getBounds().height;
  if (reduceMotion || startHeight === targetHeight) {
    const bounds = win.getBounds();
    win.setBounds({ ...bounds, height: targetHeight });
    return Promise.resolve(true);
  }

  const frameCount = Math.ceil(
    QUICK_EDITOR_COLLAPSE_DURATION / QUICK_EDITOR_COLLAPSE_FRAME_INTERVAL,
  );

  return new Promise((resolve) => {
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const finish = (completed: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      state.cancelAnimation = null;
      resolve(completed);
    };

    const step = () => {
      if (win.isDestroyed()) {
        finish(false);
        return;
      }

      frame += 1;
      const progress = Math.min(frame / frameCount, 1);
      const easedProgress = 1 - (1 - progress) ** 3;
      const height = Math.round(
        startHeight + (targetHeight - startHeight) * easedProgress,
      );
      const bounds = win.getBounds();
      win.setBounds({ ...bounds, height });

      if (progress === 1) {
        finish(true);
        return;
      }
      timer = setTimeout(step, QUICK_EDITOR_COLLAPSE_FRAME_INTERVAL);
    };

    state.cancelAnimation = () => finish(false);
    timer = setTimeout(step, QUICK_EDITOR_COLLAPSE_FRAME_INTERVAL);
  });
}
```

Register state immediately after adding a newly created window to `quickEditorWindows`:

```ts
quickEditorWindows.add(win);
quickEditorCollapseStates.set(
  win,
  createQuickEditorCollapseState(bounds.height),
);
```

Add the public state API before `closeQuickEditorWindow`:

```ts
export function getQuickEditorCollapsed(
  win: BrowserWindow | null,
): boolean {
  if (!win || win.isDestroyed() || !quickEditorWindows.has(win)) return false;
  return quickEditorCollapseStates.get(win)?.collapsed ?? false;
}

export function setQuickEditorCollapsed(
  win: BrowserWindow | null,
  collapsed: boolean,
  reduceMotion = false,
): Promise<boolean> {
  if (!win || win.isDestroyed() || !quickEditorWindows.has(win)) {
    return Promise.resolve(false);
  }

  const state = quickEditorCollapseStates.get(win);
  if (!state) return Promise.resolve(false);
  if (state.transition) return state.transition;
  if (state.collapsed === collapsed) return Promise.resolve(collapsed);

  const currentBounds = win.getBounds();
  if (collapsed) {
    state.expandedHeight = Math.max(
      currentBounds.height,
      QUICK_EDITOR_WINDOW_MIN_HEIGHT,
    );
    win.setMinimumSize(
      QUICK_EDITOR_WINDOW_MIN_WIDTH,
      QUICK_EDITOR_COLLAPSED_HEIGHT,
    );
  }

  const targetHeight = collapsed
    ? QUICK_EDITOR_COLLAPSED_HEIGHT
    : Math.max(state.expandedHeight, QUICK_EDITOR_WINDOW_MIN_HEIGHT);

  // 原生窗口尺寸只能由主进程逐帧调整，同时保持当前顶部和水平边界不变。
  const transition = animateQuickEditorHeight(
    win,
    state,
    targetHeight,
    reduceMotion,
  ).then((completed) => {
    if (
      !completed ||
      win.isDestroyed() ||
      quickEditorCollapseStates.get(win) !== state
    ) {
      return false;
    }

    state.collapsed = collapsed;
    if (!collapsed) {
      win.setMinimumSize(
        QUICK_EDITOR_WINDOW_MIN_WIDTH,
        QUICK_EDITOR_WINDOW_MIN_HEIGHT,
      );
    }
    return collapsed;
  });

  state.transition = transition.finally(() => {
    if (quickEditorCollapseStates.get(win) === state) {
      state.transition = null;
    }
  });
  return state.transition;
}
```

Create one cleanup helper and use it from both the `closed` listener and `destroyQuickEditorWindow`:

```ts
function clearQuickEditorCollapseState(win: BrowserWindow): void {
  const state = quickEditorCollapseStates.get(win);
  state?.cancelAnimation?.();
  quickEditorCollapseStates.delete(win);
}
```

The `closed` listener must call `clearQuickEditorCollapseState(win)` before choosing the next primary quick-editor window. `destroyQuickEditorWindow()` must cancel every window's state before clearing collections:

```ts
export function destroyQuickEditorWindow(): void {
  const windows = [...quickEditorWindows];
  windows.forEach(clearQuickEditorCollapseState);
  quickEditorWindows.clear();
  quickEditorWindowSources.clear();
  closingQuickEditorWindows.clear();
  quickEditorWindow = null;
  windows.forEach((win) => {
    if (!win.isDestroyed()) win.destroy();
  });
}
```

- [ ] **Step 5: Run the main-process test and verify the green state**

Run:

```bash
pnpm test src/main/quick-editor-window.test.ts
```

Expected: PASS with all quick-editor native-window tests, including animation cancellation and independent restore heights.

- [ ] **Step 6: Commit the native-window behavior**

```bash
git add src/main/quick-editor-window.test.ts src/main/quick-editor-window.ts
git commit -m "feat: add quick editor collapse animation"
```

### Task 2: Expose a narrow typed collapse IPC contract

**Files:**

- Modify: `src/shared/constants/ipc-channels.ts`
- Modify: `src/main/ipc/quick-editor.ipc.ts`
- Create: `src/main/ipc/quick-editor.ipc.test.ts`
- Modify: `src/preload/api/quick-editor.api.ts`
- Create: `src/preload/api/quick-editor.api.test.ts`
- Modify: `src/renderer/src/types/electron.d.ts`

**Interfaces:**

- Consumes: `getQuickEditorCollapsed(win)` and `setQuickEditorCollapsed(win, collapsed, reduceMotion)` from Task 1.
- Produces: IPC channels `quick-editor:get-collapsed` and `quick-editor:set-collapsed`.
- Produces: `window.electronAPI.getQuickEditorCollapsed(): Promise<boolean>`.
- Produces: `window.electronAPI.setQuickEditorCollapsed(collapsed: boolean, reduceMotion: boolean): Promise<boolean>`.
- Security boundary: the renderer passes only two booleans and receives only the final boolean state.

- [ ] **Step 1: Write failing IPC routing and validation tests**

Create `src/main/ipc/quick-editor.ipc.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../../shared/constants";
import { registerQuickEditorIpc } from "./quick-editor.ipc";

const ipcMainMocks = vi.hoisted(() => ({
  handle: vi.fn(),
  on: vi.fn(),
}));

const quickEditorMocks = vi.hoisted(() => ({
  closeQuickEditorWindow: vi.fn(),
  configureQuickEditorGlobalShortcuts: vi.fn(),
  consumePendingQuickEditorContent: vi.fn(),
  createQuickEditorWindow: vi.fn(),
  getQuickEditorCollapsed: vi.fn(),
  returnToMainWindowFromQuickEditor: vi.fn(),
  setQuickEditorCollapsed: vi.fn(),
  showQuickEditorWindow: vi.fn(),
  syncQuickEditorContent: vi.fn(),
}));

const utilsMocks = vi.hoisted(() => ({
  getBrowserWindow: vi.fn(),
}));

vi.mock("electron", () => ({ ipcMain: ipcMainMocks }));
vi.mock("../quick-editor-window", () => quickEditorMocks);
vi.mock("../utils", () => utilsMocks);

function getHandler(channel: string) {
  return ipcMainMocks.handle.mock.calls.find(([name]) => name === channel)?.[1];
}

describe("quick editor collapse IPC", () => {
  beforeAll(() => registerQuickEditorIpc());

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads collapse state from the sender's quick-editor window", () => {
    const win = { id: "quick-editor" };
    const event = { sender: { id: 7 } };
    utilsMocks.getBrowserWindow.mockReturnValue(win);
    quickEditorMocks.getQuickEditorCollapsed.mockReturnValue(true);

    const handler = getHandler(IPC_CHANNELS.QUICK_EDITOR.GET_COLLAPSED);

    expect(handler(event)).toBe(true);
    expect(quickEditorMocks.getQuickEditorCollapsed).toHaveBeenCalledWith(win);
  });

  it("validates booleans before changing collapse state", async () => {
    const win = { id: "quick-editor" };
    const event = { sender: { id: 8 } };
    utilsMocks.getBrowserWindow.mockReturnValue(win);
    quickEditorMocks.setQuickEditorCollapsed.mockResolvedValue(true);
    const handler = getHandler(IPC_CHANNELS.QUICK_EDITOR.SET_COLLAPSED);

    await expect(handler(event, true, false)).resolves.toBe(true);
    expect(quickEditorMocks.setQuickEditorCollapsed).toHaveBeenCalledWith(
      win,
      true,
      false,
    );

    await expect(handler(event, "true", false)).resolves.toBe(false);
    await expect(handler(event, true, "false")).resolves.toBe(false);
    expect(quickEditorMocks.setQuickEditorCollapsed).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Write failing preload bridge tests**

Create `src/preload/api/quick-editor.api.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../../shared/constants";
import { quickEditorApi } from "./quick-editor.api";

const ipcRendererMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  send: vi.fn(),
}));

vi.mock("electron", () => ({ ipcRenderer: ipcRendererMocks }));

describe("quick editor preload collapse API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invokes the focused collapse channels", async () => {
    ipcRendererMocks.invoke.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(quickEditorApi.getQuickEditorCollapsed()).resolves.toBe(false);
    await expect(
      quickEditorApi.setQuickEditorCollapsed(true, false),
    ).resolves.toBe(true);

    expect(ipcRendererMocks.invoke).toHaveBeenNthCalledWith(
      1,
      IPC_CHANNELS.QUICK_EDITOR.GET_COLLAPSED,
    );
    expect(ipcRendererMocks.invoke).toHaveBeenNthCalledWith(
      2,
      IPC_CHANNELS.QUICK_EDITOR.SET_COLLAPSED,
      true,
      false,
    );
  });
});
```

- [ ] **Step 3: Run the focused contract tests and verify the red state**

Run:

```bash
pnpm test src/main/ipc/quick-editor.ipc.test.ts src/preload/api/quick-editor.api.test.ts
```

Expected: FAIL because the channels and preload methods do not exist and the main IPC module does not register collapse handlers.

- [ ] **Step 4: Add the channels and main-process handlers**

Add to `IPC_CHANNELS.QUICK_EDITOR` in `src/shared/constants/ipc-channels.ts`:

```ts
GET_COLLAPSED: "quick-editor:get-collapsed",
SET_COLLAPSED: "quick-editor:set-collapsed",
```

Import the Task 1 functions in `src/main/ipc/quick-editor.ipc.ts`:

```ts
import {
  closeQuickEditorWindow,
  configureQuickEditorGlobalShortcuts,
  consumePendingQuickEditorContent,
  createQuickEditorWindow,
  getQuickEditorCollapsed,
  returnToMainWindowFromQuickEditor,
  setQuickEditorCollapsed,
  showQuickEditorWindow,
  syncQuickEditorContent,
} from "../quick-editor-window";
```

Register the two handlers before `CONSUME_CONTENT`:

```ts
ipcMain.handle(IPC_CHANNELS.QUICK_EDITOR.GET_COLLAPSED, (event) => {
  return getQuickEditorCollapsed(getBrowserWindow(event));
});

ipcMain.handle(
  IPC_CHANNELS.QUICK_EDITOR.SET_COLLAPSED,
  (event, collapsed: unknown, reduceMotion: unknown) => {
    if (
      typeof collapsed !== "boolean" ||
      typeof reduceMotion !== "boolean"
    ) {
      return false;
    }

    return setQuickEditorCollapsed(
      getBrowserWindow(event),
      collapsed,
      reduceMotion,
    );
  },
);
```

- [ ] **Step 5: Add typed preload and renderer methods**

Add to `quickEditorApi` in `src/preload/api/quick-editor.api.ts`:

```ts
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
```

Add the matching methods to `ElectronAPI` in `src/renderer/src/types/electron.d.ts`:

```ts
getQuickEditorCollapsed: () => Promise<boolean>;
setQuickEditorCollapsed: (
  collapsed: boolean,
  reduceMotion: boolean,
) => Promise<boolean>;
```

- [ ] **Step 6: Run the focused contract tests and typecheck**

Run:

```bash
pnpm test src/main/ipc/quick-editor.ipc.test.ts src/preload/api/quick-editor.api.test.ts
pnpm typecheck
```

Expected: both test files PASS and TypeScript exits with code 0.

- [ ] **Step 7: Commit the secure bridge contract**

```bash
git add src/shared/constants/ipc-channels.ts src/main/ipc/quick-editor.ipc.ts src/main/ipc/quick-editor.ipc.test.ts src/preload/api/quick-editor.api.ts src/preload/api/quick-editor.api.test.ts src/renderer/src/types/electron.d.ts
git commit -m "feat: expose quick editor collapse controls"
```

### Task 3: Add the responsive single-chevron title-bar control

**Files:**

- Modify: `src/renderer/src/features/editor/components/quick-editor-window.test.ts`
- Modify: `src/renderer/src/features/editor/components/quick-editor-window.tsx`
- Modify: `src/renderer/src/features/editor/components/quick-editor-window-css.test.ts`
- Modify: `src/renderer/src/features/editor/components/quick-editor-window.css`

**Interfaces:**

- Consumes: `getQuickEditorCollapsed()` and `setQuickEditorCollapsed(collapsed, reduceMotion)` from Task 2.
- Produces: a `15px` `ChevronUp`/`ChevronDown` icon button with `折叠编辑器`/`展开编辑器` names.
- Produces: `data-collapsed="true|false"` on the quick-editor root and `aria-hidden` on the mounted editor surface while visually collapsed.
- Responsive contract: `.quick-editor-window__action--secondary` is hidden at widths up to `164px`; collapse/expand and close remain visible.

- [ ] **Step 1: Update existing renderer test stubs for the new mount-time API**

In both existing `electronAPI` stubs in `src/renderer/src/features/editor/components/quick-editor-window.test.ts`, add:

```ts
getQuickEditorCollapsed: vi.fn(async () => false),
setQuickEditorCollapsed: vi.fn(async (collapsed: boolean) => collapsed),
```

Add `waitFor` to the Testing Library imports:

```ts
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
```

- [ ] **Step 2: Write a failing interaction test for collapse, locking, and focus restore**

Add this test to the renderer test file:

```ts
it("collapses with a single chevron and restores editor focus", async () => {
  let resolveCollapse: ((collapsed: boolean) => void) | undefined;
  const setQuickEditorCollapsed = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          resolveCollapse = resolve;
        }),
    )
    .mockResolvedValueOnce(false);

  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
  vi.stubGlobal("electronAPI", {
    createQuickEditorWindow: vi.fn(),
    getQuickEditorCollapsed: vi.fn(async () => false),
    setQuickEditorCollapsed,
    onQuickEditorInitialContent: vi.fn(
      (callback: (content: { content: string; source: null }) => void) => {
        callback({ content: "Preserved draft", source: null });
        return () => undefined;
      },
    ),
    onQuickEditorContentUpdated: vi.fn(() => () => undefined),
    closeQuickEditorWindow: vi.fn(),
    returnToMainWindowFromQuickEditor: vi.fn(),
    syncQuickEditorContent: vi.fn(),
    updateDirtyState: vi.fn(),
  });

  render(createElement(QuickEditorWindow));

  expect(await screen.findByText("Preserved draft")).toBeInTheDocument();
  const collapseButton = await screen.findByRole("button", {
    name: "折叠编辑器",
  });
  expect(collapseButton.querySelector("svg")).toHaveAttribute("width", "15");

  fireEvent.click(collapseButton);
  expect(setQuickEditorCollapsed).toHaveBeenCalledWith(true, false);
  expect(collapseButton).toBeDisabled();

  await act(async () => resolveCollapse?.(true));
  const expandButton = await screen.findByRole("button", {
    name: "展开编辑器",
  });
  expect(
    screen.getByRole("main", { name: "快速编辑器", hidden: true }),
  ).toHaveAttribute("aria-hidden", "true");
  expect(screen.getByText("Preserved draft")).toBeInTheDocument();

  expandButton.focus();
  fireEvent.click(expandButton);
  expect(setQuickEditorCollapsed).toHaveBeenLastCalledWith(false, false);
  await waitFor(() => {
    expect(screen.getByRole("textbox")).toHaveFocus();
  });
});
```

- [ ] **Step 3: Write failing CSS contract tests**

Add two cases to `src/renderer/src/features/editor/components/quick-editor-window-css.test.ts`:

```ts
it("keeps collapse and close available at the minimum width", () => {
  expect(stylesheet).toMatch(/@media\s*\(max-width:\s*164px\)/);
  expect(stylesheet).toMatch(
    /\.quick-editor-window__action--secondary\s*\{[\s\S]*?display:\s*none;/,
  );
  expect(stylesheet).not.toMatch(
    /\.quick-editor-window__action--collapse[^}]*display:\s*none;/,
  );
  expect(stylesheet).not.toMatch(
    /\.quick-editor-window__action--close[^}]*display:\s*none;/,
  );
});

it("hides interaction with the mounted editor while collapsed", () => {
  const collapsedRule = stylesheet.match(
    /\.quick-editor-window\[data-collapsed="true"\] \.quick-editor-window__editor\s*\{([\s\S]*?)\n\}/,
  )?.[1];

  expect(collapsedRule).toMatch(/visibility:\s*hidden;/);
  expect(collapsedRule).toMatch(/pointer-events:\s*none;/);
});
```

- [ ] **Step 4: Run the renderer tests and verify the red state**

Run:

```bash
pnpm test src/renderer/src/features/editor/components/quick-editor-window.test.ts src/renderer/src/features/editor/components/quick-editor-window-css.test.ts
```

Expected: FAIL because the collapse control, state attributes, responsive secondary-action class, and collapsed CSS do not exist.

- [ ] **Step 5: Implement renderer state and the single-chevron control**

Update the React and Lucide imports in `quick-editor-window.tsx`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  PictureInPicture2,
  Plus,
  X,
} from "lucide-react";
```

Add state next to the existing refs:

```ts
const [isCollapsed, setIsCollapsed] = useState(false);
const [collapseTarget, setCollapseTarget] = useState<boolean | null>(null);
const [isCollapseTransitioning, setIsCollapseTransitioning] = useState(false);
```

Read main-process state once after editor creation:

```ts
useEffect(() => {
  let cancelled = false;
  void window.electronAPI.getQuickEditorCollapsed().then((collapsed) => {
    if (!cancelled) setIsCollapsed(collapsed);
  });
  return () => {
    cancelled = true;
  };
}, []);
```

Add the transition handler before the JSX return:

```ts
const handleToggleCollapsed = useCallback(async () => {
  if (isCollapseTransitioning) return;

  const nextCollapsed = !isCollapsed;
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  setCollapseTarget(nextCollapsed);
  setIsCollapseTransitioning(true);

  try {
    const collapsed = await window.electronAPI.setQuickEditorCollapsed(
      nextCollapsed,
      reduceMotion,
    );
    setIsCollapsed(collapsed);

    if (!collapsed) {
      window.requestAnimationFrame(() => editor.focus());
    }
  } finally {
    setCollapseTarget(null);
    setIsCollapseTransitioning(false);
  }
}, [editor, isCollapsed, isCollapseTransitioning]);

const editorIsHidden = isCollapsed || collapseTarget === true;
```

Replace the root and title-bar opening with the split action groups:

```tsx
<div
  className="quick-editor-window"
  data-collapsed={editorIsHidden ? "true" : "false"}
  data-quick-editor-window="true"
>
  <header className="quick-editor-window__titlebar">
    <div className="quick-editor-window__actions quick-editor-window__actions--left">
      <button
        aria-label={isCollapsed ? "展开编辑器" : "折叠编辑器"}
        className="quick-editor-window__action quick-editor-window__action--collapse"
        disabled={isCollapseTransitioning}
        title={isCollapsed ? "展开编辑器" : "折叠编辑器"}
        type="button"
        onClick={() => void handleToggleCollapsed()}
      >
        {isCollapsed ? (
          <ChevronDown aria-hidden="true" size={15} />
        ) : (
          <ChevronUp aria-hidden="true" size={15} />
        )}
      </button>
    </div>
    <div className="quick-editor-window__drag-region" aria-hidden="true" />
    <div className="quick-editor-window__actions quick-editor-window__actions--right">
```

Add `quick-editor-window__action--secondary` to the existing new-editor and return-to-application buttons:

```tsx
className="quick-editor-window__action quick-editor-window__action--secondary"
```

Keep the close button unchanged, then mark the mounted editor surface hidden only for presentation:

```tsx
<main
  aria-hidden={editorIsHidden || undefined}
  aria-label="快速编辑器"
  className="quick-editor-window__editor"
>
```

- [ ] **Step 6: Implement collapsed and narrow-width CSS**

Change the drag region so it can shrink between the two persistent actions:

```css
.quick-editor-window__drag-region {
  min-width: 0;
  flex: 1;
  align-self: stretch;
}
```

Replace the action padding rule with side-specific rules and add disabled state:

```css
.quick-editor-window__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.quick-editor-window__actions--left {
  padding-left: 6px;
}

.quick-editor-window__actions--right {
  padding-right: 6px;
}

.quick-editor-window__action:disabled {
  cursor: default;
  opacity: 0.58;
}
```

Keep the editor mounted but non-interactive in collapsed presentation:

```css
.quick-editor-window[data-collapsed="true"] .quick-editor-window__editor {
  visibility: hidden;
  pointer-events: none;
}
```

Hide only secondary actions before they can overlap the persistent controls:

```css
@media (max-width: 164px) {
  .quick-editor-window__action--secondary {
    display: none;
  }
}
```

Leave the existing reduced-motion rule in place.

- [ ] **Step 7: Run renderer tests and verify the green state**

Run:

```bash
pnpm test src/renderer/src/features/editor/components/quick-editor-window.test.ts src/renderer/src/features/editor/components/quick-editor-window-css.test.ts
```

Expected: both focused test files PASS, including icon size, transition locking, mounted editor content, focus restoration, and minimum-width CSS rules.

- [ ] **Step 8: Commit the title-bar interaction**

```bash
git add src/renderer/src/features/editor/components/quick-editor-window.test.ts src/renderer/src/features/editor/components/quick-editor-window.tsx src/renderer/src/features/editor/components/quick-editor-window-css.test.ts src/renderer/src/features/editor/components/quick-editor-window.css
git commit -m "feat: add quick editor collapse control"
```

## Final Verification

- [ ] Run all focused collapse coverage together:

```bash
pnpm test src/main/quick-editor-window.test.ts src/main/ipc/quick-editor.ipc.test.ts src/preload/api/quick-editor.api.test.ts src/renderer/src/features/editor/components/quick-editor-window.test.ts src/renderer/src/features/editor/components/quick-editor-window-css.test.ts
```

Expected: all five test files PASS.

- [ ] Run repository-required static and build verification:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all three commands exit with code 0. Existing unrelated warnings or test failures must be reported separately and must not be changed as part of this feature.

- [ ] Run the Electron UI when available and verify these exact states:

```bash
pnpm dev
```

Expected manual checks:

- The expanded title bar shows a simple `ChevronUp` at the left and all existing actions at normal width.
- Clicking it shrinks only the bottom edge to a `38px` title bar in about `160ms`.
- The collapsed title bar shows `ChevronDown`; clicking it restores the exact pre-collapse height and editor focus.
- Manually resizing the expanded window stops at `80px` by `80px`.
- At `80px` width, collapse/expand and close remain visible without overlap while new-editor and return-to-application are hidden.
- Two simultaneous quick editors collapse and restore independently.
- Reduced-motion mode applies the final height immediately.

- [ ] Review `git status --short` and `git diff --check` to confirm only planned files were changed and unrelated workspace edits remain untouched.
