# Untitled Draft Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve edited untitled tabs when files are opened and include every dirty editor tab in the native window-close save flow.

**Architecture:** Keep file-opening decisions in the renderer and add a small pure helper that distinguishes reusable blank tabs from protected drafts. Extend the existing renderer bridge with aggregate dirty-state and identity-scoped close-save snapshots, then make the main-process close flow save snapshots until none remain.

**Tech Stack:** Electron 42, React 19, TypeScript 5.9, Zustand 4, Vitest 3, Testing Library, pnpm.

## Global Constraints

- Reuse the existing `node_modules`; do not install dependencies.
- Do not change `package.json` or `pnpm-lock.yaml`.
- Preserve unrelated workspace changes and avoid unrelated refactors.
- Use 2-space indentation, TypeScript/TSX, and kebab-case filenames.
- Write Chinese comments for new core method logic.
- Use Conventional Commits with English messages.
- Verification must include `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

## File Map

- Create `src/renderer/src/features/editor/lib/editor-tab-opening.ts`: pure rules for choosing whether file opening reuses or creates a tab.
- Create `src/renderer/src/features/editor/lib/editor-tab-opening.test.ts`: focused unit coverage for blank tabs, drafts, named tabs, and pending tabs.
- Modify `src/renderer/src/hooks/use-electron.ts`: use the tab-opening rule before starting the existing file load.
- Modify `src/shared/types/index.ts`: define the renderer/main close-save snapshot contract.
- Modify `src/renderer/src/features/editor/components/editor-bridge.tsx`: aggregate window dirty state and expose identity-scoped close-save functions.
- Create `src/renderer/src/features/editor/components/editor-bridge.test.tsx`: verify background drafts are reported and selected correctly.
- Modify `src/main/window.ts`: save exact dirty snapshots and repeat until all dirty tabs are saved.
- Modify `src/main/window.test.ts`: cover close confirmation, untitled Save As, callback identity, cancellation, and final close.

---

### Task 1: Protect Edited Untitled Tabs During File Opening

**Files:**
- Create: `src/renderer/src/features/editor/lib/editor-tab-opening.ts`
- Create: `src/renderer/src/features/editor/lib/editor-tab-opening.test.ts`
- Modify: `src/renderer/src/hooks/use-electron.ts:132-195`

**Interfaces:**
- Consumes: `EditorPanelGroup`, `EditorTab`, and the existing `addTab(groupId)` store action.
- Produces: `isReusableUntitledTab(tab: EditorTab): boolean` and `selectFileOpenTabId(group: EditorPanelGroup, addTab: (groupId: string) => string): string`.

- [ ] **Step 1: Write the failing tab-opening tests**

Create `src/renderer/src/features/editor/lib/editor-tab-opening.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { EditorPanelGroup, EditorTab } from "@/store/editor.store";
import {
  isReusableUntitledTab,
  selectFileOpenTabId,
} from "./editor-tab-opening";

function createTab(patch: Partial<EditorTab> = {}): EditorTab {
  return {
    id: "tab-1",
    filePath: null,
    pendingFilePath: null,
    content: "",
    wordCount: 0,
    isDirty: false,
    reloadKey: 0,
    mode: "rich",
    loadStatus: "ready",
    saveStatus: "clean",
    errorMessage: null,
    parseErrorMessage: null,
    scrollTop: 0,
    ...patch,
  };
}

function createGroup(tab: EditorTab): EditorPanelGroup {
  return {
    id: "group-1",
    tabs: [tab],
    activeTabId: tab.id,
    direction: "horizontal",
  };
}

describe("editor tab opening", () => {
  it("reuses only a blank clean untitled tab", () => {
    expect(isReusableUntitledTab(createTab())).toBe(true);
    expect(isReusableUntitledTab(createTab({ content: "draft" }))).toBe(false);
    expect(isReusableUntitledTab(createTab({ isDirty: true }))).toBe(false);
    expect(
      isReusableUntitledTab(createTab({ pendingFilePath: "/notes/a.md" })),
    ).toBe(false);
    expect(isReusableUntitledTab(createTab({ filePath: "/notes/a.md" }))).toBe(
      false,
    );
  });

  it("creates a new file target for an edited untitled draft", () => {
    const addTab = vi.fn(() => "tab-2");
    const group = createGroup(
      createTab({ content: "draft", isDirty: true, saveStatus: "dirty" }),
    );

    expect(selectFileOpenTabId(group, addTab)).toBe("tab-2");
    expect(addTab).toHaveBeenCalledWith("group-1");
  });

  it("keeps the existing target for blank untitled and named tabs", () => {
    const addTab = vi.fn(() => "tab-2");

    expect(selectFileOpenTabId(createGroup(createTab()), addTab)).toBe("tab-1");
    expect(
      selectFileOpenTabId(
        createGroup(createTab({ filePath: "/notes/a.md", content: "saved" })),
        addTab,
      ),
    ).toBe("tab-1");
    expect(addTab).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/editor-tab-opening.test.ts
```

Expected: FAIL because `./editor-tab-opening` does not exist.

- [ ] **Step 3: Implement the minimal tab-opening rules**

Create `src/renderer/src/features/editor/lib/editor-tab-opening.ts`:

```ts
import type { EditorPanelGroup, EditorTab } from "@/store/editor.store";

export function isReusableUntitledTab(tab: EditorTab): boolean {
  return (
    tab.filePath === null &&
    tab.pendingFilePath === null &&
    !tab.isDirty &&
    tab.content.trim().length === 0
  );
}

export function selectFileOpenTabId(
  group: EditorPanelGroup,
  addTab: (groupId: string) => string,
): string {
  const activeTab = group.tabs.find((tab) => tab.id === group.activeTabId);

  // 未命名标签只要不再是可复用空白页，就作为草稿保留并新建文件标签。
  if (
    activeTab?.filePath === null &&
    !isReusableUntitledTab(activeTab)
  ) {
    return addTab(group.id);
  }

  return group.activeTabId;
}
```

Modify `use-electron.ts` after the same-file/pending-file early return and before flushing the old named file:

```ts
import { selectFileOpenTabId } from "@/features/editor/lib/editor-tab-opening";
```

Replace the current `if (targetGroup)` block with the following code so the duplicate-open guard runs before the draft-preservation decision and the existing load callbacks use the resolved tab identity:

```ts
if (targetGroup) {
  let tabId = targetGroup.activeTabId;
  let activeTab = targetGroup.tabs.find((tab) => tab.id === tabId);

  if (
    (activeTab?.filePath === filePath && activeTab.loadStatus === "ready") ||
    activeTab?.pendingFilePath === filePath
  ) {
    state.setActiveTab(targetGroup.id, tabId);
    useTreeStore.getState().setSelectedKey(filePath);
    state.recordRecentOpenedFile(filePath);
    return;
  }

  tabId = selectFileOpenTabId(targetGroup, state.addTab);
  if (tabId !== targetGroup.activeTabId) {
    state = useEditorStore.getState();
    targetGroup = state.panelGroups.find(
      (group) => group.id === targetGroup!.id,
    );
    activeTab = targetGroup?.tabs.find((tab) => tab.id === tabId);
  }

  if (!targetGroup || !activeTab) return;

  // 复用已命名标签前先冲刷旧文件，避免尚未到期的自动保存丢失。
  if (activeTab.filePath) {
    await flushEditorChange(targetGroup.id, tabId);
    await editorSaveCoordinator.flush(activeTab.filePath);
  }

  state = useEditorStore.getState();
  state.setActiveTab(targetGroup.id, tabId);
  state.beginTabLoad(targetGroup.id, tabId, filePath);
  useTreeStore.getState().setSelectedKey(filePath);

  await fileOpenController.open({
    groupId: targetGroup.id,
    tabId,
    path: filePath,
    onSuccess: (content) => {
      useEditorStore
        .getState()
        .completeTabLoad(targetGroup!.id, tabId, filePath, content);
    },
    onError: (error) => {
      const editorState = useEditorStore.getState();
      editorState.failTabLoad(
        targetGroup!.id,
        tabId,
        filePath,
        error.message,
      );
      const retainedTab = useEditorStore
        .getState()
        .panelGroups.find((group) => group.id === targetGroup!.id)
        ?.tabs.find((tab) => tab.id === tabId);
      useTreeStore
        .getState()
        .setSelectedKey(retainedTab?.filePath ?? null);
    },
  });
} else {
  const content = await window.electronAPI.readFile(filePath);
  setContent(content);
  setFilePath(filePath);
  incrementReloadKey();
  recordRecentOpenedFile(filePath);
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/editor-tab-opening.test.ts
```

Expected: PASS with 3 tests.

- [ ] **Step 5: Commit the file-opening behavior**

```bash
git add src/renderer/src/features/editor/lib/editor-tab-opening.ts src/renderer/src/features/editor/lib/editor-tab-opening.test.ts src/renderer/src/hooks/use-electron.ts
git commit -m "fix: preserve edited untitled tabs"
```

---

### Task 2: Aggregate Dirty State and Expose Close-Save Snapshots

**Files:**
- Modify: `src/shared/types/index.ts`
- Create: `src/renderer/src/features/editor/components/editor-bridge.test.tsx`
- Modify: `src/renderer/src/features/editor/components/editor-bridge.tsx`

**Interfaces:**
- Produces: `CloseSaveSnapshot { groupId: string; tabId: string; content: string; filePath: string | null }`.
- Produces renderer globals: `window.__getNextDirtyEditor(): CloseSaveSnapshot | null` and `window.__onCloseSaveSuccess(groupId: string, tabId: string, filePath: string | null): void`.
- Produces selectors: `hasUnsavedEditorChanges(state): boolean` and `selectNextDirtyEditor(state): CloseSaveSnapshot | null`.

- [ ] **Step 1: Add the shared snapshot type and failing bridge tests**

Append to `src/shared/types/index.ts`:

```ts
export interface CloseSaveSnapshot {
  groupId: string;
  tabId: string;
  content: string;
  filePath: string | null;
}
```

Create `src/renderer/src/features/editor/components/editor-bridge.test.tsx`:

```tsx
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "@/store/editor.store";
import { EditorBridge } from "./editor-bridge";

const updateDirtyState = vi.fn();

function seedBackgroundDraft(): void {
  const baseGroup = useEditorStore.getState().panelGroups[0];
  const cleanTab = {
    ...baseGroup.tabs[0],
    id: "tab-clean",
    filePath: "/notes/clean.md",
    content: "clean",
  };
  const draftTab = {
    ...baseGroup.tabs[0],
    id: "tab-draft",
    filePath: null,
    content: "draft",
    isDirty: true,
    saveStatus: "dirty" as const,
  };

  useEditorStore.setState({
    activeGroupId: "group-1",
    panelGroups: [
      {
        ...baseGroup,
        id: "group-1",
        activeTabId: cleanTab.id,
        tabs: [cleanTab, draftTab],
      },
    ],
  });
}

describe("EditorBridge close protection", () => {
  beforeEach(() => {
    updateDirtyState.mockReset();
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { updateDirtyState },
    });
    seedBackgroundDraft();
  });

  afterEach(() => {
    cleanup();
  });

  it("reports a background draft and selects it for close saving", () => {
    render(<EditorBridge />);

    expect(updateDirtyState).toHaveBeenLastCalledWith(true);
    expect((window as any).__getNextDirtyEditor()).toEqual({
      groupId: "group-1",
      tabId: "tab-draft",
      content: "draft",
      filePath: null,
    });
    expect(useEditorStore.getState().panelGroups[0].activeTabId).toBe(
      "tab-draft",
    );
  });

  it("marks the exact saved draft clean and assigns its Save As path", () => {
    render(<EditorBridge />);

    act(() => {
      (window as any).__onCloseSaveSuccess(
        "group-1",
        "tab-draft",
        "/notes/draft.md",
      );
    });

    const draft = useEditorStore
      .getState()
      .panelGroups[0].tabs.find((tab) => tab.id === "tab-draft");
    expect(draft).toMatchObject({
      filePath: "/notes/draft.md",
      isDirty: false,
    });
    expect(updateDirtyState).toHaveBeenLastCalledWith(false);
  });
});
```

- [ ] **Step 2: Run the focused bridge test and verify RED**

Run:

```bash
pnpm test src/renderer/src/features/editor/components/editor-bridge.test.tsx
```

Expected: FAIL because the bridge still reports only the active clean tab and the close-save globals do not exist.

- [ ] **Step 3: Implement aggregate selectors and identity-scoped bridge globals**

Add to `editor-bridge.tsx`:

```tsx
import type { CloseSaveSnapshot } from "@shared/types";
import type { EditorState } from "@/store/editor.store";

export function hasUnsavedEditorChanges(state: EditorState): boolean {
  const tabs = state.panelGroups.flatMap((group) => group.tabs);
  return tabs.length > 0 ? tabs.some((tab) => tab.isDirty) : state.isDirty;
}

export function selectNextDirtyEditor(
  state: EditorState,
): CloseSaveSnapshot | null {
  const activeGroup = state.panelGroups.find(
    (group) => group.id === state.activeGroupId,
  );
  const activeTab = activeGroup?.tabs.find(
    (tab) => tab.id === activeGroup.activeTabId,
  );
  const target = activeTab?.isDirty
    ? { group: activeGroup!, tab: activeTab }
    : state.panelGroups
        .flatMap((group) =>
          group.tabs.map((tab) => ({ group, tab })),
        )
        .find(({ tab }) => tab.isDirty);

  if (!target) return null;

  return {
    groupId: target.group.id,
    tabId: target.tab.id,
    content: target.tab.content,
    filePath: target.tab.filePath,
  };
}
```

Inside `EditorBridge`'s effect, add:

```tsx
(window as any).__getNextDirtyEditor = () => {
  const state = useEditorStore.getState();
  const snapshot = selectNextDirtyEditor(state);
  if (snapshot) {
    // 保存前定位到对应草稿，让用户明确看到当前另存为的内容。
    state.setActiveTab(snapshot.groupId, snapshot.tabId);
  }
  return snapshot;
};

(window as any).__onCloseSaveSuccess = (
  groupId: string,
  tabId: string,
  filePath: string | null,
) => {
  const state = useEditorStore.getState();
  if (filePath) {
    state.setTabFilePath(groupId, tabId, filePath);
  }
  state.setTabDirty(groupId, tabId, false);
};
```

Replace both active-tab dirty calculations with `hasUnsavedEditorChanges(state)`, and delete both new globals during effect cleanup:

```tsx
const unsub = useEditorStore.subscribe(
  hasUnsavedEditorChanges,
  (currentDirty, prevDirty) => {
    if (currentDirty !== prevDirty) {
      window.electronAPI.updateDirtyState(currentDirty);
    }
  },
);

window.electronAPI.updateDirtyState(
  hasUnsavedEditorChanges(useEditorStore.getState()),
);
```

```tsx
delete (window as any).__getNextDirtyEditor;
delete (window as any).__onCloseSaveSuccess;
```

- [ ] **Step 4: Run the focused bridge test and verify GREEN**

Run:

```bash
pnpm test src/renderer/src/features/editor/components/editor-bridge.test.tsx
```

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit the renderer close bridge**

```bash
git add src/shared/types/index.ts src/renderer/src/features/editor/components/editor-bridge.tsx src/renderer/src/features/editor/components/editor-bridge.test.tsx
git commit -m "fix: track dirty drafts across tabs"
```

---

### Task 3: Save Dirty Draft Snapshots Before Window Close

**Files:**
- Modify: `src/main/window.test.ts`
- Modify: `src/main/window.ts:132-238`

**Interfaces:**
- Consumes: `CloseSaveSnapshot` and the renderer globals created in Task 2.
- Produces: `checkAndCloseWindow(win: BrowserWindow): Promise<void>` and `saveAndClose(win: BrowserWindow): Promise<void>` as testable exports.

- [ ] **Step 1: Write failing main-process close tests**

Update `window.test.ts` to hoist dialog and dirty-state mocks:

```ts
const electronMocks = vi.hoisted(() => ({
  showMessageBox: vi.fn(),
  showSaveDialog: vi.fn(),
}));
const getCachedDirtyState = vi.hoisted(() => vi.fn(() => false));
```

Use them in the existing mocks:

```ts
vi.mock("electron", () => ({
  BrowserWindow: BrowserWindowMock,
  app: { isPackaged: true },
  shell: { openExternal: vi.fn() },
  dialog: electronMocks,
}));

vi.mock("./ipc/editor.ipc", () => ({ getCachedDirtyState }));
```

Import `fs`, `beforeEach`, `afterEach`, `checkAndCloseWindow`, and `saveAndClose`, then add:

```ts
describe("window close draft protection", () => {
  const writeFile = vi.spyOn(fs.promises, "writeFile");

  beforeEach(() => {
    vi.clearAllMocks();
    getCachedDirtyState.mockReturnValue(true);
    writeFile.mockResolvedValue();
  });

  afterEach(() => {
    writeFile.mockReset();
  });

  it("shows the save confirmation when the renderer reports any dirty tab", async () => {
    electronMocks.showMessageBox.mockResolvedValue({ response: 2 });
    const win = {
      isDestroyed: vi.fn(() => false),
      destroy: vi.fn(),
    } as unknown as BrowserWindow;

    await checkAndCloseWindow(win);

    expect(electronMocks.showMessageBox).toHaveBeenCalledTimes(1);
    expect(win.destroy).not.toHaveBeenCalled();
  });

  it("saves an untitled draft by identity and closes after no dirty tabs remain", async () => {
    const executeJavaScript = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          groupId: "group-1",
          tabId: "tab-draft",
          content: "draft",
          filePath: null,
        }),
      )
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce("null");
    const win = {
      isDestroyed: vi.fn(() => false),
      destroy: vi.fn(),
      webContents: { executeJavaScript },
    } as unknown as BrowserWindow;
    electronMocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: "C:\\notes\\draft.md",
    });

    await saveAndClose(win);

    expect(writeFile).toHaveBeenCalledWith(
      "C:\\notes\\draft.md",
      "draft",
      "utf-8",
    );
    expect(executeJavaScript.mock.calls[1][0]).toContain(
      "__onCloseSaveSuccess",
    );
    expect(executeJavaScript.mock.calls[1][0]).toContain("tab-draft");
    expect(win.destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps the window open when Save As is canceled", async () => {
    const executeJavaScript = vi.fn().mockResolvedValueOnce(
      JSON.stringify({
        groupId: "group-1",
        tabId: "tab-draft",
        content: "draft",
        filePath: null,
      }),
    );
    const win = {
      isDestroyed: vi.fn(() => false),
      destroy: vi.fn(),
      webContents: { executeJavaScript },
    } as unknown as BrowserWindow;
    electronMocks.showSaveDialog.mockResolvedValue({ canceled: true });

    await saveAndClose(win);

    expect(writeFile).not.toHaveBeenCalled();
    expect(win.destroy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the main-process test and verify RED**

Run:

```bash
pnpm test src/main/window.test.ts
```

Expected: FAIL because `checkAndCloseWindow` and `saveAndClose` are not exported and the old save flow reads only the active editor.

- [ ] **Step 3: Implement snapshot-driven save and safe error handling**

Import the shared type and export the two close helpers:

```ts
import type { CloseSaveSnapshot, WindowOpenTarget } from "../shared/types";

export async function checkAndCloseWindow(
  win: BrowserWindow,
): Promise<void> {
```

Change the `checkAndCloseWindow` catch block so errors do not discard drafts:

```ts
} catch (error) {
  console.error("Error during close:", error);
}
```

Replace `saveAndClose` with:

```ts
export async function saveAndClose(win: BrowserWindow): Promise<void> {
  if (win.isDestroyed()) return;

  try {
    while (!win.isDestroyed()) {
      const serializedSnapshot = await win.webContents.executeJavaScript(
        "JSON.stringify(window.__getNextDirtyEditor ? window.__getNextDirtyEditor() : null)",
      );
      const snapshot = JSON.parse(
        serializedSnapshot,
      ) as CloseSaveSnapshot | null;

      if (!snapshot) {
        win.destroy();
        return;
      }

      let savedPath = snapshot.filePath;
      if (!savedPath) {
        const saveResult = await dialog.showSaveDialog(win, {
          title: "保存文件",
          defaultPath: "未命名.md",
          filters: [
            { name: "Markdown", extensions: ["md"] },
            { name: "所有文件", extensions: ["*"] },
          ],
        });

        if (win.isDestroyed()) return;
        if (saveResult.canceled || !saveResult.filePath) return;
        savedPath = saveResult.filePath;
      }

      await fs.promises.writeFile(savedPath, snapshot.content, "utf-8");
      if (win.isDestroyed()) return;

      // 使用标签身份回写保存结果，避免激活标签变化后误清理其他草稿。
      await win.webContents.executeJavaScript(
        `window.__onCloseSaveSuccess && window.__onCloseSaveSuccess(${JSON.stringify(snapshot.groupId)}, ${JSON.stringify(snapshot.tabId)}, ${JSON.stringify(savedPath)})`,
      );
    }
  } catch (error) {
    console.error("Error during save:", error);
  }
}
```

This loop also saves empty named files correctly, repeats for additional dirty tabs, aborts on Save As cancellation, and leaves the window open on errors.

- [ ] **Step 4: Run the main-process test and verify GREEN**

Run:

```bash
pnpm test src/main/window.test.ts
```

Expected: PASS, including the three new close-protection tests.

- [ ] **Step 5: Run all focused regression tests together**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/editor-tab-opening.test.ts src/renderer/src/features/editor/components/editor-bridge.test.tsx src/main/window.test.ts
```

Expected: PASS with no errors or warnings.

- [ ] **Step 6: Commit the main-process close flow**

```bash
git add src/main/window.ts src/main/window.test.ts
git commit -m "fix: save untitled drafts before closing"
```

---

### Task 4: Repository Verification

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: all changes from Tasks 1-3.
- Produces: verified type, lint, test, and build results.

- [ ] **Step 1: Run the complete test suite**

Run:

```bash
pnpm test
```

Expected: all Vitest suites pass.

- [ ] **Step 2: Run TypeScript validation**

Run:

```bash
pnpm typecheck
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Run repository lint**

Run:

```bash
pnpm lint
```

Expected: exit code 0 with no lint errors.

- [ ] **Step 4: Run the production build**

Run:

```bash
pnpm build
```

Expected: TypeScript checks and Electron Vite build complete successfully.

- [ ] **Step 5: Inspect the final diff and status**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intended task files or clearly identified pre-existing user changes are present.
