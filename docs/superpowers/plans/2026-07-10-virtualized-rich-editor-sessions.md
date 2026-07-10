# Virtualized Rich Editor Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make two-to-three same-document rich-text panels responsive by sharing one persistent BlockNote session per file and rendering non-focused panels as independently scrollable virtual rich previews, without limiting panel count.

**Architecture:** A renderer-local session manager owns one persistent BlockNote runtime and surface per normalized file path. The focused pane hosts that surface; passive panes subscribe to a block-level preview cache and use `@tanstack/react-virtual`. Panel-specific view state stays outside Zustand during high-frequency interactions, and Markdown/save/outline work runs once per document session.

**Tech Stack:** Electron 42, React 19, TypeScript 5.9, Zustand 4, BlockNote 0.51, ProseMirror/Tiptap 3.27, `@tanstack/react-virtual` 3.14, Vitest 3.2, Testing Library.

## Global Constraints

- Do not limit the number of split panels; two panels are the primary acceptance case, three panels are the normal upper bound, and six panels are a stress case.
- A passive pane must remain rich, independently scrollable, and directly editable on the first pointer interaction; never show raw Markdown or a blank transition.
- The first activation of an already visible document must not parse Markdown, call `replaceBlocks`, or create a BlockNote instance.
- Keep one BlockNote/ProseMirror instance per unique rich document, not per panel.
- Keep source-mode editors panel-owned.
- Do not add dependencies or modify `package.json` or `pnpm-lock.yaml`.
- Reuse the existing `node_modules`; do not install, prune, or recreate dependencies.
- Write Chinese comments for core implementation logic.
- Follow TDD: write the focused failing test, run it and confirm the expected failure, implement the smallest production change, then rerun focused tests.
- Use Conventional Commits with English messages and keep every commit focused.

---

## File Structure

### New runtime modules

- `src/renderer/src/features/editor/lib/rich-document-surface-registry.ts` — stable per-document editor surface and per-pane host attachment.
- `src/renderer/src/features/editor/lib/rich-document-surface-registry.test.ts` — surface move, stale cleanup, and focus tests.
- `src/renderer/src/features/editor/lib/rich-pane-view-state.ts` — transient per-pane scroll and selection state.
- `src/renderer/src/features/editor/lib/rich-pane-view-state.test.ts` — immutable read/write and cleanup tests.
- `src/renderer/src/features/editor/lib/rich-document-session-manager.ts` — path-keyed visible/background references, runtime registration, active binding, and LRU retention.
- `src/renderer/src/features/editor/lib/rich-document-session-manager.test.ts` — same-path deduplication, retention, and eviction tests.
- `src/renderer/src/features/editor/lib/editor-transaction-blocks.ts` — derive changed top-level BlockNote IDs and structural order changes from ProseMirror transactions.
- `src/renderer/src/features/editor/lib/editor-transaction-blocks.test.ts` — text, insert, delete, and move transaction tests.
- `src/renderer/src/features/editor/lib/rich-preview-cache.ts` — rAF-batched block HTML cache and scoped subscriptions.
- `src/renderer/src/features/editor/lib/rich-preview-cache.test.ts` — changed-block export and structural-order tests.
- `src/renderer/src/features/editor/lib/rich-preview-anchor.ts` — preview pointer position to BlockNote block/text offset mapping.
- `src/renderer/src/features/editor/lib/rich-preview-anchor.test.ts` — exact offset and fallback tests.
- `src/renderer/src/features/editor/lib/editor-performance.ts` — development-only marks and long-task diagnostics without file content or paths.
- `src/renderer/src/features/editor/lib/editor-performance.test.ts` — mark names and redaction tests.

### New components

- `src/renderer/src/features/editor/components/virtual-rich-preview.tsx` — bounded virtualized passive rich view.
- `src/renderer/src/features/editor/components/virtual-rich-preview.test.tsx` — rich HTML, mounted-range, scroll, and activation tests.
- `src/renderer/src/features/editor/components/rich-document-pane.tsx` — live host/passive preview switching and first-interaction activation.
- `src/renderer/src/features/editor/components/rich-document-pane.test.tsx` — direct activation, view-state, and surface-transfer tests.
- `src/renderer/src/features/editor/components/rich-document-session-host.tsx` — one persistent BlockNote portal per retained path and store/session adapter.
- `src/renderer/src/features/editor/components/rich-document-session-host.test.tsx` — one host per path, save/outline/flusher routing, and external reload tests.

### Modified components and stores

- `src/renderer/src/features/editor/components/blocknote-editor.tsx` — convert panel-captured editor callbacks into session-bound callbacks and expose a runtime API.
- `src/renderer/src/features/editor/components/editor-workspace.tsx` — render `RichDocumentPane` for rich mode.
- `src/renderer/src/features/editor/components/editor.tsx` — render retained document session hosts and remove split warmup lifecycle.
- `src/renderer/src/features/editor/components/editor-tab-bar.tsx` — remove standby readiness and panel-count disabling.
- `src/renderer/src/features/editor/components/editor-toolbar.tsx` — remove split-disabled props and copy.
- `src/renderer/src/features/editor/lib/editor-view-selectors.ts` — select unique rich document descriptors without rich content in layout signatures.
- `src/renderer/src/store/editor.store.ts` — remove warmup state/actions and add no-op-safe path-level snapshot/parse actions.
- `src/renderer/src/styles/blocknote-overrides.css` — passive preview fidelity and containment styles.

### Removed after migration

- `src/renderer/src/features/editor/lib/editor-instance-registry.ts`
- `src/renderer/src/features/editor/lib/editor-instance-registry.test.ts`
- `src/renderer/src/features/editor/lib/editor-split-warmup.ts`
- `src/renderer/src/features/editor/lib/editor-split-warmup.test.ts`

---

### Task 1: Remove the Panel Cap and Stop Visible-Peer Store Churn

**Files:**
- Modify: `src/renderer/src/features/editor/lib/editor-instance-registry.test.ts`
- Modify: `src/renderer/src/features/editor/lib/editor-instance-registry.ts`
- Modify: `src/renderer/src/features/editor/components/editor-tab-bar.tsx`
- Modify: `src/renderer/src/features/editor/components/editor-toolbar.tsx`
- Modify: `src/renderer/src/features/editor/components/editor.tsx`
- Delete: `src/renderer/src/features/editor/lib/editor-split-warmup.test.ts`
- Delete: `src/renderer/src/features/editor/lib/editor-split-warmup.ts`

**Interfaces:**
- Preserves: `EditorInstanceRegistry.setStandby(groupId, tabId, standby)` until Task 9 removes the registry.
- Changes: `onSynchronizationPending` fires only while the target entry is an actual standby.
- Removes: `shouldPrepareSplitWarmup` and the UI status value `"limit"`.

- [ ] **Step 1: Write the failing visible-peer callback regression**

Add this test after the claimed-peer test:

```ts
it("does not publish warmup status for a claimed visible peer", () => {
  const scheduled: Array<() => void> = [];
  const registry = new EditorInstanceRegistry({
    schedule: (callback) => {
      scheduled.push(callback);
      return () => {};
    },
  });
  const source = createEditor();
  const peer = createEditor();
  const onSynchronizationPending = vi.fn();

  registry.register({
    groupId: "group-1",
    tabId: "tab-1",
    path: "note.md",
    editor: source,
  });
  registry.register({
    groupId: "group-2",
    tabId: "tab-2",
    path: "note.md",
    editor: peer,
    standby: true,
    mirrorSourceGroupId: "group-1",
    mirrorSourceTabId: "tab-1",
    onSynchronizationPending,
  });
  registry.setStandby("group-2", "tab-2", false);

  source.updateBlock("shared-block", { content: "updated" });

  expect(onSynchronizationPending).not.toHaveBeenCalled();
  expect(scheduled).toHaveLength(1);
});
```

- [ ] **Step 2: Run the registry test and verify RED**

Run:

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/lib/editor-instance-registry.test.ts --reporter=verbose
```

Expected: FAIL because `onSynchronizationPending` is called after `setStandby(..., false)`.

- [ ] **Step 3: Gate the callback without changing transaction synchronization**

Replace the unconditional callback inside `mirrorTransaction` with:

```ts
if (target.standby) {
  target.onSynchronizationPending?.();
}
```

Keep pending-step scheduling for visible peers unchanged until the session architecture replaces it.

- [ ] **Step 4: Remove the two-panel UI and warmup-manager decision cap**

In `editor-tab-bar.tsx`, remove the import and call to `shouldPrepareSplitWarmup`, remove the `"limit"` branch, and derive the disabled title only from preparation:

```ts
const splitDisabled = splitWarmupStatus !== "ready";
const splitDisabledTitle = splitDisabled
  ? "正在准备大文档拆分"
  : undefined;
```

In `editor.tsx`, remove the helper import and keep `canWarm` limited only by editor readiness:

```ts
const canWarm =
  activeGroup &&
  activeTab?.filePath &&
  activeTab.mode === "rich" &&
  activeTab.loadStatus === "ready";
```

Delete `editor-split-warmup.ts` and its test because no resource-limit decision remains.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/lib/editor-instance-registry.test.ts src/renderer/src/features/editor/components/editor-toolbar.test.tsx src/renderer/src/features/editor/components/editor.test.tsx --reporter=dot
```

Expected: PASS and no test refers to a two-panel limit.

- [ ] **Step 6: Commit the isolated correction**

```powershell
git add -- src/renderer/src/features/editor/lib/editor-instance-registry.test.ts src/renderer/src/features/editor/lib/editor-instance-registry.ts src/renderer/src/features/editor/components/editor-tab-bar.tsx src/renderer/src/features/editor/components/editor-toolbar.tsx src/renderer/src/features/editor/components/editor.tsx src/renderer/src/features/editor/lib/editor-split-warmup.test.ts src/renderer/src/features/editor/lib/editor-split-warmup.ts
git commit -m "perf: remove split panel cap and visible sync churn"
```

---

### Task 2: Add Stable Document Surfaces and Transient Pane View State

**Files:**
- Create: `src/renderer/src/features/editor/lib/rich-document-surface-registry.ts`
- Create: `src/renderer/src/features/editor/lib/rich-document-surface-registry.test.ts`
- Create: `src/renderer/src/features/editor/lib/rich-pane-view-state.ts`
- Create: `src/renderer/src/features/editor/lib/rich-pane-view-state.test.ts`

**Interfaces:**
- Produces: `type RichPaneKey = `${string}:${string}``.
- Produces: `toRichPaneKey(groupId: string, tabId: string): RichPaneKey`.
- Produces: `normalizeRichDocumentPath(path: string): string` for every session runtime map.
- Produces: `RichDocumentSurfaceRegistry.registerSurface(path, surface)`, `registerHost(path, paneKey, host)`, `activate(path, paneKey)`, and `deactivate(path)`.
- Produces: `RichPaneViewStateRegistry.read`, `patch`, `delete`, and `clear`.

- [ ] **Step 1: Write failing surface and view-state tests**

Create tests with these required cases:

```ts
it("moves one document surface between pane hosts", () => {
  const registry = new RichDocumentSurfaceRegistry();
  const surface = document.createElement("div");
  const firstHost = document.createElement("div");
  const secondHost = document.createElement("div");

  registry.registerSurface("C:\\notes\\large.md", surface);
  registry.registerHost("C:\\notes\\large.md", "g1:t1", firstHost);
  registry.registerHost("C:\\notes\\large.md", "g2:t2", secondHost);

  expect(registry.activate("C:\\notes\\large.md", "g1:t1")).toBe(true);
  expect(firstHost.firstElementChild).toBe(surface);
  expect(registry.activate("C:\\notes\\large.md", "g2:t2")).toBe(true);
  expect(secondHost.firstElementChild).toBe(surface);
  registry.deactivate("C:\\notes\\large.md");
  expect(surface.parentElement).toBeNull();
});

it("keeps independent pane view state", () => {
  const states = new RichPaneViewStateRegistry();
  states.patch("g1:t1", { scrollTop: 120, topBlockId: "block-a" });
  states.patch("g2:t2", { scrollTop: 760, topBlockId: "block-b" });

  expect(states.read("g1:t1").scrollTop).toBe(120);
  expect(states.read("g2:t2").scrollTop).toBe(760);
  expect(states.read("missing:tab")).toEqual({
    scrollTop: 0,
    topBlockId: null,
    topBlockOffset: 0,
    selection: null,
    width: 0,
  });
});
```

Also cover stale host cleanup, focused descendant restoration, immutable reads, and deletion of one pane without changing another pane.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/lib/rich-document-surface-registry.test.ts src/renderer/src/features/editor/lib/rich-pane-view-state.test.ts --reporter=verbose
```

Expected: FAIL because both modules are missing.

- [ ] **Step 3: Implement the pane key and view-state registry**

Use this public shape:

```ts
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
    this.states.set(key, { ...this.read(key), ...patch });
  }

  delete(key: RichPaneKey): void {
    this.states.delete(key);
  }

  clear(): void {
    this.states.clear();
  }
}
```

- [ ] **Step 4: Implement the document surface registry**

Use a normalized separator-only key and identity-safe cleanup:

```ts
export function normalizeRichDocumentPath(path: string): string {
  return path.replaceAll("\\", "/");
}

interface SurfaceEntry {
  surface: HTMLElement | null;
  hosts: Map<RichPaneKey, HTMLElement>;
  activePaneKey: RichPaneKey | null;
  focusTarget: HTMLElement | null;
}

export class RichDocumentSurfaceRegistry {
  private readonly entries = new Map<string, SurfaceEntry>();

  registerSurface(path: string, surface: HTMLElement): () => void;
  registerHost(
    path: string,
    paneKey: RichPaneKey,
    host: HTMLElement,
  ): () => void;
  activate(path: string, paneKey: RichPaneKey): boolean;
  deactivate(path: string): void;
  getActivePaneKey(path: string): RichPaneKey | null;
}
```

`activate` must capture focus from the outgoing surface, append the same surface to the requested host, restore a connected focus target with `{ preventScroll: true }`, and return `false` if either surface or host is missing. `deactivate` captures focus, removes the surface from its host without destroying it, and clears the active pane key so inactive document sessions do not participate in layout.

- [ ] **Step 5: Run tests and verify GREEN**

Run the command from Step 2. Expected: both files PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- src/renderer/src/features/editor/lib/rich-document-surface-registry.ts src/renderer/src/features/editor/lib/rich-document-surface-registry.test.ts src/renderer/src/features/editor/lib/rich-pane-view-state.ts src/renderer/src/features/editor/lib/rich-pane-view-state.test.ts
git commit -m "feat: add rich document pane runtime"
```

---

### Task 3: Add the Path-Keyed Session Manager and Four-Entry Background LRU

**Files:**
- Create: `src/renderer/src/features/editor/lib/rich-document-session-manager.ts`
- Create: `src/renderer/src/features/editor/lib/rich-document-session-manager.test.ts`
- Modify: `src/renderer/src/features/editor/lib/editor-runtime.ts`

**Interfaces:**
- Consumes: `RichPaneKey`, `RichDocumentSurfaceRegistry`, and `RichPaneViewStateRegistry` from Task 2.
- Produces: `RichDocumentBinding`, `RichDocumentRuntime`, `RichDocumentSessionManager`, and singleton `richDocumentSessionManager`.
- Produces: retained-path external-store methods `subscribe` and `getSnapshot` for React.

- [ ] **Step 1: Write failing lifecycle tests**

Cover these exact behaviors:

```ts
it("deduplicates repeated visible bindings by normalized path", () => {
  const manager = createManager();
  manager.retainVisible("C:\\notes\\large.md", {
    paneKey: "g1:t1",
    groupId: "g1",
    tabId: "t1",
  });
  manager.retainVisible("C:/notes/large.md", {
    paneKey: "g2:t2",
    groupId: "g2",
    tabId: "t2",
  });

  expect(manager.getSnapshot()).toEqual(["C:/notes/large.md"]);
  expect(manager.getVisiblePaneKeys("C:/notes/large.md")).toEqual([
    "g1:t1",
    "g2:t2",
  ]);
});

it("evicts only the oldest idle background session beyond four", () => {
  const destroyed: string[] = [];
  const manager = createManager({ maxBackgroundSessions: 4 });
  for (const path of ["a.md", "b.md", "c.md", "d.md", "e.md"]) {
    manager.registerRuntime(path, createRuntime(path, destroyed));
    const release = manager.retainBackground(path, `tab-${path}`);
    release();
  }

  expect(destroyed).toEqual(["a.md"]);
  expect(manager.getSnapshot()).toEqual(["b.md", "c.md", "d.md", "e.md"]);
});
```

Also assert that visible, dirty, saving, and reloading sessions survive eviction; active pane binding is path-scoped; unregistering one duplicate pane does not destroy the runtime; subscriber callbacks fire once per retained-path change.

- [ ] **Step 2: Run the test and verify RED**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/lib/rich-document-session-manager.test.ts --reporter=verbose
```

Expected: FAIL because the manager is missing.

- [ ] **Step 3: Implement the runtime contract and manager**

Use these public interfaces:

```ts
export interface RichDocumentRuntime {
  path: string;
  surface: HTMLElement;
  serializePendingChange: () => Promise<void>;
  cancelPendingWork: () => void;
  destroy: () => void;
  isDirty: () => boolean;
  isSaving: () => boolean;
  isReloading: () => boolean;
}

export interface RichDocumentBinding {
  paneKey: RichPaneKey;
  groupId: string;
  tabId: string;
}

interface SessionRecord {
  path: string;
  visibleBindings: Map<RichPaneKey, RichDocumentBinding>;
  backgroundTabIds: Set<string>;
  activePaneKey: RichPaneKey | null;
  runtime: RichDocumentRuntime | null;
  lastActiveAt: number;
}

export class RichDocumentSessionManager {
  constructor(options?: {
    maxBackgroundSessions?: number;
    now?: () => number;
    surfaces?: RichDocumentSurfaceRegistry;
    viewStates?: RichPaneViewStateRegistry;
  });

  retainVisible(path: string, binding: RichDocumentBinding): () => void;
  retainBackground(path: string, tabId: string): () => void;
  registerRuntime(path: string, runtime: RichDocumentRuntime): () => void;
  setActivePane(path: string, paneKey: RichPaneKey): boolean;
  getActivePane(path: string): RichPaneKey | null;
  getActiveBinding(): { path: string; binding: RichDocumentBinding } | null;
  getVisiblePaneKeys(path: string): RichPaneKey[];
  getBoundTabIds(path: string): string[];
  getRuntime(path: string): RichDocumentRuntime | null;
  getSnapshot(): string[];
  subscribe(listener: () => void): () => void;
}
```

Use `normalizeRichDocumentPath` from Task 2 for every lookup. Use `maxBackgroundSessions = 4`. Maintain one global active document path. `setActivePane` deactivates the previously active document surface before attaching the target surface, so only one full rich DOM participates in layout. Evict only records with zero visible bindings, zero background references, a registered runtime, and runtime flags all false. Sort eviction candidates by `lastActiveAt` using a loop, not in-place array mutation. Cache the retained-path snapshot array and replace it only when its ordered contents change so `useSyncExternalStore` receives stable identity.

- [ ] **Step 4: Export shared runtime singletons**

In `editor-runtime.ts`, add:

```ts
export const richDocumentSurfaceRegistry =
  new RichDocumentSurfaceRegistry();
export const richPaneViewStateRegistry = new RichPaneViewStateRegistry();
export const richDocumentSessionManager = new RichDocumentSessionManager({
  surfaces: richDocumentSurfaceRegistry,
  viewStates: richPaneViewStateRegistry,
  maxBackgroundSessions: 4,
});
```

- [ ] **Step 5: Run tests and verify GREEN**

Run the test from Step 2 and the existing editor runtime tests. Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- src/renderer/src/features/editor/lib/rich-document-session-manager.ts src/renderer/src/features/editor/lib/rich-document-session-manager.test.ts src/renderer/src/features/editor/lib/editor-runtime.ts
git commit -m "feat: manage rich document sessions by path"
```

---

### Task 4: Derive Changed Block IDs and Build the Batched Rich Preview Cache

**Files:**
- Create: `src/renderer/src/features/editor/lib/editor-transaction-blocks.ts`
- Create: `src/renderer/src/features/editor/lib/editor-transaction-blocks.test.ts`
- Create: `src/renderer/src/features/editor/lib/rich-preview-cache.ts`
- Create: `src/renderer/src/features/editor/lib/rich-preview-cache.test.ts`

**Interfaces:**
- Produces: `collectChangedTopLevelBlocks(transaction): { changedIds: Set<string>; structureChanged: boolean; order: string[] }`.
- Produces: `RichPreviewCache.seed`, `handleTransaction`, `getSnapshot`, `subscribe`, and `getBlockSnapshot`.
- Consumes: a BlockNote editor subset with `getBlock` and `blocksToFullHTML`.

- [ ] **Step 1: Write failing transaction-analysis tests with real BlockNote editors**

Use `BlockNoteEditor.create` and capture the emitted transaction. Assert:

```ts
expect(collectChangedTopLevelBlocks(textTransaction)).toMatchObject({
  structureChanged: false,
  order: ["block-a", "block-b"],
});
expect(
  collectChangedTopLevelBlocks(textTransaction).changedIds,
).toEqual(new Set(["block-a"]));
```

For `insertBlocks`, `removeBlocks`, and `moveBlocks`, assert `structureChanged: true` and the exact final top-level ID order.

- [ ] **Step 2: Run transaction tests and verify RED**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/lib/editor-transaction-blocks.test.ts --reporter=verbose
```

Expected: FAIL because the analyzer is missing.

- [ ] **Step 3: Implement transaction analysis without converting the full document to BlockNote blocks**

Use ProseMirror transform documents and step maps:

```ts
function topLevelBlockIds(doc: ProseMirrorNode): string[] {
  const blockGroup = doc.firstChild;
  if (!blockGroup || blockGroup.type.name !== "blockGroup") return [];
  const ids: string[] = [];
  blockGroup.forEach((node) => {
    if (node.type.name === "blockContainer" && typeof node.attrs.id === "string") {
      ids.push(node.attrs.id);
    }
  });
  return ids;
}

export function collectChangedTopLevelBlocks(
  transaction: Transaction,
): ChangedTopLevelBlocks {
  const changedIds = new Set<string>();
  let structureChanged = false;

  transaction.steps.forEach((step, index) => {
    const before = transaction.docs[index];
    const after = transaction.docs[index + 1] ?? transaction.doc;
    step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
      const oldIds = blockIdsAcrossRange(before, oldStart, oldEnd);
      const newIds = blockIdsAcrossRange(after, newStart, newEnd);
      oldIds.forEach((id) => changedIds.add(id));
      newIds.forEach((id) => changedIds.add(id));
      if (oldIds.join("\u001f") !== newIds.join("\u001f")) {
        structureChanged = true;
      }
    });
  });

  return { changedIds, structureChanged, order: topLevelBlockIds(transaction.doc) };
}
```

`blockIdsAcrossRange` must include the containing `blockContainer` at both boundaries and all block containers visited by `nodesBetween`, with positions clamped to the document content size.

- [ ] **Step 4: Write failing preview-cache batching tests**

Required assertions:

```ts
source.updateBlock("block-a", { content: "updated" });
source.updateBlock("block-a", { content: "updated twice" });

expect(scheduled).toHaveLength(1);
expect(cache.getSnapshot().revision).toBe(0);
scheduled[0]();
expect(cache.getSnapshot().revision).toBe(1);
expect(exportedIds).toEqual(["block-a"]);
```

Also assert that inserting a block updates order, deletion removes cached HTML, subscribers fire once per frame, and `getSnapshot()` preserves object identity until a flush.

- [ ] **Step 5: Run cache tests and verify RED**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/lib/rich-preview-cache.test.ts --reporter=verbose
```

Expected: FAIL because the cache is missing.

- [ ] **Step 6: Implement the preview cache**

Use this stable snapshot shape:

```ts
export interface RichPreviewBlockSnapshot {
  id: string;
  html: string;
  revision: number;
}

export interface RichPreviewSnapshot {
  revision: number;
  order: readonly string[];
}

export class RichPreviewCache {
  seed(blocks: readonly Block[]): void;
  handleTransaction(transaction: Transaction): void;
  getSnapshot(): RichPreviewSnapshot;
  getBlockSnapshot(id: string): RichPreviewBlockSnapshot | null;
  subscribe(listener: () => void): () => void;
  subscribeBlock(id: string, listener: () => void): () => void;
  destroy(): void;
}
```

Store only pending changed IDs in the transaction handler. In the scheduled frame, call `editor.getBlock(id)` and `editor.blocksToFullHTML([block])` once per changed ID, update order only when structural change was observed, publish changed block listeners, then publish one document listener.

- [ ] **Step 7: Run Task 4 tests and verify GREEN**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/lib/editor-transaction-blocks.test.ts src/renderer/src/features/editor/lib/rich-preview-cache.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add -- src/renderer/src/features/editor/lib/editor-transaction-blocks.ts src/renderer/src/features/editor/lib/editor-transaction-blocks.test.ts src/renderer/src/features/editor/lib/rich-preview-cache.ts src/renderer/src/features/editor/lib/rich-preview-cache.test.ts
git commit -m "feat: cache changed rich preview blocks"
```

---

### Task 5: Render a Bounded Virtual Rich Preview

**Files:**
- Create: `src/renderer/src/features/editor/components/virtual-rich-preview.tsx`
- Create: `src/renderer/src/features/editor/components/virtual-rich-preview.test.tsx`
- Create: `src/renderer/src/features/editor/lib/rich-preview-anchor.ts`
- Create: `src/renderer/src/features/editor/lib/rich-preview-anchor.test.ts`
- Modify: `src/renderer/src/styles/blocknote-overrides.css`

**Interfaces:**
- Consumes: `RichPreviewCache` and `RichPaneViewStateRegistry`.
- Produces: `RichPreviewAnchor { blockId: string; textOffset: number }`.
- Produces: `VirtualRichPreview({ paneKey, cache, onActivate })`.

- [ ] **Step 1: Write failing pointer-anchor tests**

Create a block wrapper containing multiple nested text nodes and assert an exact offset:

```ts
const root = document.createElement("div");
root.innerHTML = `
  <div data-block-id="block-a">
    <p><span>Hello </span><strong>world</strong></p>
  </div>
`;
document.body.append(root);
const text = root.querySelector("strong")!.firstChild!;

expect(resolveRichPreviewAnchor(text, 3)).toEqual({
  blockId: "block-a",
  textOffset: 9,
});
```

Also test nested-list descendants and a non-text image target falling back to offset `0`.

- [ ] **Step 2: Run the anchor test and verify RED**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/lib/rich-preview-anchor.test.ts --reporter=verbose
```

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement anchor mapping**

Walk text nodes inside the closest `[data-block-id]` wrapper with a `TreeWalker`, sum text lengths before the target node, clamp the local offset, and return block start for non-text targets.

- [ ] **Step 4: Write failing virtual preview component tests**

Mock only the `@tanstack/react-virtual` boundary so jsdom has deterministic virtual items. Return indices `0`, `1`, and `2` from a 100-block snapshot and assert:

```tsx
expect(container.querySelectorAll("[data-rich-preview-block]")).toHaveLength(3);
expect(container).toHaveTextContent("Heading A");
expect(container).not.toHaveTextContent("raw markdown source");
expect(screen.getByRole("textbox")).toHaveAttribute("aria-readonly", "true");
```

Fire scroll and assert only `richPaneViewStateRegistry.patch(paneKey, { scrollTop })` runs. Fire pointer-down on a nested text node and assert `onActivate` receives the exact block/text anchor.

- [ ] **Step 5: Run the component test and verify RED**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/components/virtual-rich-preview.test.tsx --reporter=verbose
```

Expected: FAIL because the component is missing.

- [ ] **Step 6: Implement the virtual preview**

Use the existing virtualizer with an overscan of eight:

```tsx
const virtualizer = useVirtualizer({
  count: snapshot.order.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 36,
  overscan: 8,
});
```

Render one absolutely positioned item per `virtualizer.getVirtualItems()`. Subscribe each item with bound closures:

```tsx
const block = useSyncExternalStore(
  (listener) => cache.subscribeBlock(id, listener),
  () => cache.getBlockSnapshot(id),
);
```

Set `data-block-id`, render the trusted `blocksToFullHTML` fragment with `dangerouslySetInnerHTML`, and use `virtualizer.measureElement` for mounted heights.

The scroll container must have `role="textbox"`, `aria-multiline="true"`, `aria-readonly="true"`, and the same editor font-size, line-height, padding, opacity, and theme variables as the live editor.

- [ ] **Step 7: Add preview containment styles**

Add scoped styles:

```css
.rich-virtual-preview {
  contain: layout style paint;
  overflow: auto;
}

.rich-virtual-preview__block {
  contain: layout style;
  width: 100%;
}

.rich-virtual-preview .bn-editor {
  background: transparent;
  padding-inline: var(--editor-padding);
}
```

- [ ] **Step 8: Run Task 5 tests and verify GREEN**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/lib/rich-preview-anchor.test.ts src/renderer/src/features/editor/components/virtual-rich-preview.test.tsx --reporter=dot
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add -- src/renderer/src/features/editor/components/virtual-rich-preview.tsx src/renderer/src/features/editor/components/virtual-rich-preview.test.tsx src/renderer/src/features/editor/lib/rich-preview-anchor.ts src/renderer/src/features/editor/lib/rich-preview-anchor.test.ts src/renderer/src/styles/blocknote-overrides.css
git commit -m "feat: render virtual rich document previews"
```

---

### Task 6: Create One Persistent BlockNote Session Host per Path

**Files:**
- Create: `src/renderer/src/features/editor/components/rich-document-session-host.tsx`
- Create: `src/renderer/src/features/editor/components/rich-document-session-host.test.tsx`
- Modify: `src/renderer/src/features/editor/components/blocknote-editor.tsx`
- Modify: `src/renderer/src/features/editor/lib/editor-view-selectors.ts`
- Modify: `src/renderer/src/features/editor/lib/editor-view-selectors.test.ts`

**Interfaces:**
- Produces: `RichEditorBinding { groupId; tabId; paneKey; path }`.
- Produces: `RichBlockNoteRuntime` extending `RichDocumentRuntime` with preview cache and selection/scroll methods.
- Produces: `RichDocumentSessionHost({ path })` and `selectRichDocumentRepresentative(path)`.
- Changes: `BlockNoteEditorInner` receives a path-level controller and reads the current binding at event time.

- [ ] **Step 1: Write failing representative selector tests**

Given two rich tabs with the same path and one source tab, assert one representative descriptor:

```ts
expect(selectRichDocumentRepresentative("C:/notes/large.md")(state)).toEqual({
  path: "C:/notes/large.md",
  content: "# Large",
  reloadKey: 2,
  loadStatus: "ready",
});
```

The selector result must not include group ID, tab ID, scroll position, word count, dirty state, or save state.

- [ ] **Step 2: Run selector tests and verify RED**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/lib/editor-view-selectors.test.ts --reporter=verbose
```

Expected: FAIL because the selector is missing.

- [ ] **Step 3: Implement the representative selector**

Search visible groups first, then all tabs, require `mode === "rich"`, and return only path, content, reload key, and load status. Preserve the previous descriptor object when those primitive values are unchanged.

- [ ] **Step 4: Write a failing persistent-host identity test**

Mock the BlockNote session editor with a mount counter, render one host, change the representative panel binding for the same path, and rerender:

```tsx
const view = render(
  <RichDocumentSessionHost path="C:/notes/large.md" />,
);
act(() => {
  useEditorStore.setState({ activeGroupId: "group-2" });
});
view.rerender(<RichDocumentSessionHost path="C:/notes/large.md" />);

expect(sessionMounts.get("C:/notes/large.md")).toBe(1);
expect(richDocumentSessionManager.getRuntime("C:/notes/large.md")).not.toBeNull();
```

- [ ] **Step 5: Run the host test and verify RED**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/components/rich-document-session-host.test.tsx --reporter=verbose
```

Expected: FAIL because the host and session layer are missing.

- [ ] **Step 6: Define the session controller used by BlockNote**

Add this contract near the BlockNote component props:

```ts
export interface RichEditorBinding {
  groupId: string;
  tabId: string;
  paneKey: RichPaneKey;
  path: string;
}

export interface RichEditorSessionController {
  path: string;
  getActiveBinding: () => RichEditorBinding | null;
  getBoundTabIds: () => string[];
  onMarkdownChange: (content: string) => void;
  onWordCountChange: (count: number) => void;
  onParseStateChange: (message: string | null) => void;
  onRuntimeReady: (runtime: RichBlockNoteRuntime) => () => void;
}
```

Replace captured `groupId`/`tabId` reads in focus, change, parse, save-flush, outline, and stale callbacks with `controller.getActiveBinding()` at invocation time. Keep parsing, schema, upload, formatting, code blocks, serialization, and change-gate behavior unchanged.

- [ ] **Step 7: Expose a path-level runtime from the editor**

The runtime must include:

```ts
export interface RichBlockNoteRuntime extends RichDocumentRuntime {
  editor: CoreBlockNoteEditor;
  previewCache: RichPreviewCache;
  focusAt: (anchor: RichPreviewAnchor | null) => void;
  readViewState: () => Pick<RichPaneViewState, "scrollTop" | "selection">;
  restoreViewState: (state: RichPaneViewState) => void;
  scrollToBlock: (blockId: string) => boolean;
}
```

Create the preview cache after the initial document is applied, seed it with the applied blocks, feed it document transactions, and destroy it with the editor runtime.

- [ ] **Step 8: Implement the persistent host and portal**

`RichDocumentSessionHost` must create one stable surface with `useState`, register it with `richDocumentSurfaceRegistry`, render the refactored BlockNote editor into it with `createPortal`, and register the runtime with `richDocumentSessionManager`.

The store adapter must update all bound same-path tabs without incrementing reload keys:

```ts
onMarkdownChange: (content) => {
  const store = useEditorStore.getState();
  const tabIds = richDocumentSessionManager.getBoundTabIds(path);
  store.syncFileContent(path, content, undefined, tabIds);
  editorSaveCoordinator.schedule(path, content);
},
```

- [ ] **Step 9: Run host, BlockNote, selector, cache, and store tests**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/components/rich-document-session-host.test.tsx src/renderer/src/features/editor/components/blocknote-editor.test.ts src/renderer/src/features/editor/lib/editor-view-selectors.test.ts src/renderer/src/features/editor/lib/rich-preview-cache.test.ts src/renderer/src/store/editor.store.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 10: Commit**

```powershell
git add -- src/renderer/src/features/editor/components/rich-document-session-host.tsx src/renderer/src/features/editor/components/rich-document-session-host.test.tsx src/renderer/src/features/editor/components/blocknote-editor.tsx src/renderer/src/features/editor/lib/editor-view-selectors.ts src/renderer/src/features/editor/lib/editor-view-selectors.test.ts
git commit -m "feat: host one rich editor session per document"
```

---

### Task 7: Integrate Live and Passive Rich Panes into the Persistent Panel Layout

**Files:**
- Create: `src/renderer/src/features/editor/components/rich-document-pane.tsx`
- Create: `src/renderer/src/features/editor/components/rich-document-pane.test.tsx`
- Modify: `src/renderer/src/features/editor/components/editor-workspace.tsx`
- Modify: `src/renderer/src/features/editor/components/editor-workspace.test.tsx`
- Modify: `src/renderer/src/features/editor/components/editor.tsx`
- Modify: `src/renderer/src/features/editor/components/editor.test.tsx`

**Interfaces:**
- Consumes: session manager, surface registry, pane view states, session hosts, and virtual preview.
- Produces: `RichDocumentPane({ groupId, tabId, path })`.
- Produces: `RichDocumentSessionLayer` that renders each retained path exactly once.

- [ ] **Step 1: Write failing two-, three-, and six-panel instance tests**

Extend `editor.test.tsx` with a mocked session host counter. For each panel count, create same-path groups and assert:

```ts
expect(sessionHostMounts.get("C:/notes/large.md")).toBe(1);
expect(screen.getAllByTestId("rich-document-pane")).toHaveLength(panelCount);
expect(screen.getAllByTestId("virtual-rich-preview")).toHaveLength(
  panelCount - 1,
);
```

The active group must contain the one live surface host. Splitting from two to three panels must not increase the session host mount count.

- [ ] **Step 2: Run editor integration tests and verify RED**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/components/editor.test.tsx src/renderer/src/features/editor/components/editor-workspace.test.tsx --reporter=verbose
```

Expected: FAIL because every panel still mounts `BlockNoteEditor` and no session layer exists.

- [ ] **Step 3: Implement `RichDocumentPane` registration and role rendering**

The component must:

```tsx
const paneKey = toRichPaneKey(groupId, tabId);
const isLive = useEditorStore(
  (state) =>
    state.activeGroupId === groupId &&
    state.panelGroups.find((group) => group.id === groupId)?.activeTabId ===
      tabId,
);
```

Register the visible binding and live host in layout effects. Render the live host as an absolute layer when live; otherwise render `VirtualRichPreview` from the path runtime's cache. If the runtime is still loading, render the existing `EditorStateView` loading state, never Markdown source.

When `isLive` becomes true in the layout effect, call `richDocumentSessionManager.setActivePane(path, paneKey)` so initial open and keyboard tab activation attach the session surface before paint. The visible-binding registration passes `{ paneKey, groupId, tabId }` to the manager.

- [ ] **Step 4: Replace only the rich terminal branch in `EditorWorkspace`**

Keep the current source-mode JSX intact. Replace the final `BlockNoteEditor` branch with this conditional fragment:

```tsx
) : tabFilePath ? (
  <RichDocumentPane groupId={groupId} tabId={tabId} path={tabFilePath} />
) : (
  <EditorStateView status="empty" />
)}
```

- [ ] **Step 5: Add the retained session layer to `Editor`**

Subscribe with `useSyncExternalStore`:

```tsx
function RichDocumentSessionLayer() {
  const paths = useSyncExternalStore(
    (listener) => richDocumentSessionManager.subscribe(listener),
    () => richDocumentSessionManager.getSnapshot(),
  );
  return paths.map((path) => (
    <RichDocumentSessionHost key={path} path={path} />
  ));
}
```

Render the layer next to persistent panel portals so session hosts do not inherit recursive panel layout ownership.

- [ ] **Step 6: Run integration tests and verify GREEN**

Run the command from Step 2 plus `rich-document-pane.test.tsx`. Expected: PASS for two, three, and six same-path panels with one session host.

- [ ] **Step 7: Commit**

```powershell
git add -- src/renderer/src/features/editor/components/rich-document-pane.tsx src/renderer/src/features/editor/components/rich-document-pane.test.tsx src/renderer/src/features/editor/components/editor-workspace.tsx src/renderer/src/features/editor/components/editor-workspace.test.tsx src/renderer/src/features/editor/components/editor.tsx src/renderer/src/features/editor/components/editor.test.tsx
git commit -m "feat: share rich sessions across split panes"
```

---

### Task 8: Make First Pointer Interaction Restore Caret, Selection, and Scroll

**Files:**
- Modify: `src/renderer/src/features/editor/components/rich-document-pane.tsx`
- Modify: `src/renderer/src/features/editor/components/rich-document-pane.test.tsx`
- Modify: `src/renderer/src/features/editor/components/blocknote-editor.tsx`
- Modify: `src/renderer/src/features/editor/lib/rich-document-surface-registry.ts`
- Modify: `src/renderer/src/features/editor/lib/rich-pane-view-state.ts`

**Interfaces:**
- Consumes: `RichPreviewAnchor`, `RichBlockNoteRuntime.focusAt`, and view-state registry.
- Produces: synchronous `activateRichPane(path, binding, anchor)` behavior.

- [ ] **Step 1: Write the failing first-click activation test**

Use real DOM nodes for the passive preview and a mocked runtime:

```tsx
fireEvent.pointerDown(screen.getByText("world").firstChild!, {
  clientX: 40,
  clientY: 20,
});

expect(surfaceRegistry.getActivePaneKey(path)).toBe("group-2:tab-2");
expect(runtime.restoreViewState).toHaveBeenCalledWith(
  expect.objectContaining({ scrollTop: 640 }),
);
expect(runtime.focusAt).toHaveBeenCalledWith({
  blockId: "block-a",
  textOffset: 9,
});
expect(useEditorStore.getState().activeGroupId).toBe("group-2");
```

Also assert the outgoing live pane receives its own saved scroll and selection, activation requires one pointer-down, and unsupported image content calls `focusAt({ blockId, textOffset: 0 })`.

- [ ] **Step 2: Run the pane test and verify RED**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/components/rich-document-pane.test.tsx --reporter=verbose
```

Expected: FAIL because passive pointer-down does not transfer the editor or restore the caret.

- [ ] **Step 3: Implement synchronous activation before the next paint**

In the pointer handler:

```ts
const activatePane = (anchor: RichPreviewAnchor | null) => {
  const runtime = richDocumentSessionManager.getRuntime(path);
  if (!runtime) return;
  const outgoing = richDocumentSessionManager.getActiveBinding();
  if (outgoing) {
    const outgoingRuntime = richDocumentSessionManager.getRuntime(outgoing.path);
    if (outgoingRuntime) {
      richPaneViewStateRegistry.patch(
        outgoing.binding.paneKey,
        outgoingRuntime.readViewState(),
      );
    }
  }
  richDocumentSessionManager.setActivePane(path, paneKey);
  runtime.restoreViewState(richPaneViewStateRegistry.read(paneKey));
  useEditorStore.getState().setActiveGroupId(groupId);
  useEditorStore.getState().setActiveTab(groupId, tabId);
  runtime.focusAt(anchor);
};
```

The surface move must happen inside `setActivePane` before Zustand notification. React then swaps live/preview layers in the same event turn.

- [ ] **Step 4: Implement ProseMirror caret restoration**

Resolve the BlockNote block by ID, find its ProseMirror `blockContainer` start, clamp the text offset to the block's text content size, create `TextSelection.near` or `TextSelection.create`, dispatch with `scrollIntoView`, then focus. Fall back to `editor.setTextCursorPosition(blockId, "start")` when the exact text position is not valid.

- [ ] **Step 5: Persist scroll outside the hot path**

Update refs on scroll. Use one 150 ms scroll-idle timer to call `setTabScrollTop` for the owning pane. Flush immediately on blur, tab switch, pane close, and runtime destruction.

- [ ] **Step 6: Run activation and viewport regressions**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/components/rich-document-pane.test.tsx src/renderer/src/features/editor/lib/editor-viewport.test.ts src/renderer/src/features/editor/lib/rich-preview-anchor.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- src/renderer/src/features/editor/components/rich-document-pane.tsx src/renderer/src/features/editor/components/rich-document-pane.test.tsx src/renderer/src/features/editor/components/blocknote-editor.tsx src/renderer/src/features/editor/lib/rich-document-surface-registry.ts src/renderer/src/features/editor/lib/rich-pane-view-state.ts
git commit -m "feat: activate passive rich panes on first input"
```

---

### Task 9: Route File Services Through Sessions and Remove Warmup/Peer Infrastructure

**Files:**
- Modify: `src/renderer/src/store/editor.store.ts`
- Modify: `src/renderer/src/store/editor.store.test.ts`
- Modify: `src/renderer/src/features/editor/components/editor.tsx`
- Modify: `src/renderer/src/features/editor/components/editor-tab-bar.tsx`
- Modify: `src/renderer/src/features/editor/components/editor-toolbar.tsx`
- Modify: `src/renderer/src/features/editor/components/editor-workspace.tsx`
- Modify: `src/renderer/src/features/editor/components/rich-document-session-host.tsx`
- Modify: `src/renderer/src/features/editor/components/rich-document-session-host.test.tsx`
- Modify: `src/renderer/src/features/editor/lib/editor-view-selectors.ts`
- Delete: `src/renderer/src/features/editor/lib/editor-instance-registry.ts`
- Delete: `src/renderer/src/features/editor/lib/editor-instance-registry.test.ts`

**Interfaces:**
- Removes: all `SplitWarmupState`, `splitWarmup`, prepare/ready/stale/discard actions, `SplitWarmupManager`, and `EditorInstanceRegistry` usage.
- Produces: `setFileParseState(path, message)` and no-op-safe `syncFileContent`.
- Preserves: existing save coordinator, file subscription, outline navigator, and change-flusher public APIs by routing bindings to the session runtime.

- [ ] **Step 1: Write failing store no-op and unlimited-split tests**

Add:

```ts
it("does not notify when a path snapshot is already current", () => {
  const before = useEditorStore.getState();
  useEditorStore.getState().syncFileContent(
    "note.md",
    before.panelGroups[0].tabs[0].content,
    undefined,
    [before.panelGroups[0].tabs[0].id],
  );
  expect(useEditorStore.getState()).toBe(before);
});

it("allows three direct visible splits without hidden groups", () => {
  const store = useEditorStore.getState();
  store.addPanelGroup("horizontal", "group-1");
  const second = useEditorStore.getState().panelGroups[1];
  useEditorStore.getState().addPanelGroup("vertical", second.id);

  expect(useEditorStore.getState().panelGroups).toHaveLength(3);
  expect(
    useEditorStore
      .getState()
      .panelGroups.some((group) => "splitWarmup" in group),
  ).toBe(false);
});
```

- [ ] **Step 2: Run store tests and verify RED**

```powershell
pnpm.cmd exec vitest run src/renderer/src/store/editor.store.test.ts --reporter=verbose
```

Expected: FAIL because warmup groups remain and no-op sync creates a new state.

- [ ] **Step 3: Remove warmup state and make split direct**

Delete warmup interfaces/actions and simplify `addPanelGroup` so it always creates one visible group with a cloned tab and `activeGroupId: sourceGroupId`. Keep `splitParentGroupId` and direction behavior unchanged.

Remove hidden-group filtering throughout editor layout and store removal paths because every stored group is now visible.

- [ ] **Step 4: Make path-level actions identity-safe**

Implement `syncFileContent` with a preflight change check. Return the existing state object when no tab content, word count, or reload key would change. Add:

```ts
setFileParseState: (path, message) => {
  set((state) => {
    let changed = false;
    const panelGroups = state.panelGroups.map((group) => {
      let groupChanged = false;
      const tabs = group.tabs.map((tab) => {
        if (tab.filePath !== path || tab.parseErrorMessage === message) return tab;
        changed = true;
        groupChanged = true;
        return {
          ...tab,
          parseErrorMessage: message,
          mode: message ? "source" : tab.mode,
        };
      });
      return groupChanged ? { ...group, tabs } : group;
    });
    return changed ? { panelGroups } : state;
  });
},
```

- [ ] **Step 5: Route services once per session**

In the session host:

- register one file subscription for `path`;
- register each visible binding's change flusher as a delegate to `runtime.serializePendingChange`;
- register each visible binding's outline navigator as a delegate to `runtime.scrollToBlock`;
- call one `editorSaveCoordinator.schedule(path, content)` after session serialization;
- update all same-path tab snapshots without reload;
- apply one external reload to the session runtime.

Tests must assert two duplicate panes still produce one file subscription, one serialization callback execution, one save schedule, and one external `replaceBlocks` operation.

- [ ] **Step 6: Remove warmup and peer registry code**

Delete `SplitWarmupManager`, warmup-only toolbar disabling/copy, standby props and callbacks in BlockNote, registry registration and transaction mirroring, and both registry files.

- [ ] **Step 7: Run the broad editor regression set**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor src/renderer/src/store/editor.store.test.ts --reporter=dot
```

Expected: all editor-focused files pass; no test or production file references `splitWarmup`, `EditorInstanceRegistry`, or `mirrorSource`.

- [ ] **Step 8: Verify dead-reference removal**

```powershell
rg -n "splitWarmup|SplitWarmup|editorInstanceRegistry|EditorInstanceRegistry|mirrorSource" src/renderer/src
```

Expected: no matches.

- [ ] **Step 9: Commit**

```powershell
git add -- src/renderer/src/store/editor.store.ts src/renderer/src/store/editor.store.test.ts src/renderer/src/features/editor/components/editor.tsx src/renderer/src/features/editor/components/editor-tab-bar.tsx src/renderer/src/features/editor/components/editor-toolbar.tsx src/renderer/src/features/editor/components/editor-workspace.tsx src/renderer/src/features/editor/components/rich-document-session-host.tsx src/renderer/src/features/editor/components/rich-document-session-host.test.tsx src/renderer/src/features/editor/lib/editor-view-selectors.ts src/renderer/src/features/editor/lib/editor-instance-registry.ts src/renderer/src/features/editor/lib/editor-instance-registry.test.ts
git commit -m "refactor: replace split peers with document sessions"
```

---

### Task 10: Add Diagnostics, Performance Proxy Tests, and Final Verification

**Files:**
- Create: `src/renderer/src/features/editor/lib/editor-performance.ts`
- Create: `src/renderer/src/features/editor/lib/editor-performance.test.ts`
- Modify: `src/renderer/src/features/editor/components/editor.tsx`
- Modify: `src/renderer/src/features/editor/components/rich-document-pane.tsx`
- Modify: `src/renderer/src/features/editor/components/blocknote-editor.tsx`
- Modify: `docs/superpowers/specs/2026-07-10-virtualized-rich-editor-sessions-design.md` only if measured acceptance details clarify the already approved specification.

**Interfaces:**
- Produces: `measureEditorOperation(name, callback)` and `observeEditorLongTasks(contextProvider)`.
- Accepts only redacted context: document length, visible pane count, mounted preview count, and operation name.

- [ ] **Step 1: Write failing diagnostic redaction tests**

Assert allowed fields and reject path/content fields:

```ts
expect(createEditorPerformanceContext({
  documentLength: 24_000,
  visiblePaneCount: 3,
  mountedPreviewBlockCount: 28,
})).toEqual({
  documentLength: 24_000,
  visiblePaneCount: 3,
  mountedPreviewBlockCount: 28,
});
expect(JSON.stringify(context)).not.toContain("large.md");
expect(JSON.stringify(context)).not.toContain("# private content");
```

- [ ] **Step 2: Run the diagnostic test and verify RED**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/lib/editor-performance.test.ts --reporter=verbose
```

Expected: FAIL because the diagnostic helper is missing.

- [ ] **Step 3: Implement development-only marks and long-task observation**

Allow only these names:

```ts
export type EditorPerformanceOperation =
  | "editor:split-to-paint"
  | "editor:pane-activate"
  | "editor:transaction"
  | "editor:preview-frame"
  | "editor:resize-frame";
```

Guard all marks and observers with `import.meta.env.DEV`. Do not log a path, document text, tab title, or block HTML. Disconnect the observer during cleanup.

- [ ] **Step 4: Add structural performance proxy tests**

Add or extend component tests to assert:

- two, three, and six same-path panes mount one session editor;
- one user input transaction updates one live editor and schedules one preview frame;
- mounted virtual preview items equal the mocked visible range plus at most sixteen overscan items;
- divider resize does not write scroll or content to Zustand;
- switching between already visible panes does not call parse or `replaceBlocks`;
- no synchronization-related store action exists.

- [ ] **Step 5: Run all focused editor tests**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor src/renderer/src/store/editor.store.test.ts --reporter=dot
```

Expected: all focused tests pass.

- [ ] **Step 6: Run TypeScript checking**

```powershell
pnpm.cmd typecheck
```

Expected: exit code 0.

- [ ] **Step 7: Run lint and formatting checks**

```powershell
pnpm.cmd format:check
pnpm.cmd lint
```

Expected: both exit code 0. Existing repository warnings may remain, but no new warning may originate from touched files except the established BlockNote `_tiptapEditor` warning.

- [ ] **Step 8: Run the complete test suite**

```powershell
pnpm.cmd exec vitest run --reporter=dot
```

Expected: record the exact pass/fail counts. If known unrelated repository failures remain, confirm all editor-focused tests are green and report the unrelated failures without editing their files.

- [ ] **Step 9: Run the production build**

```powershell
pnpm.cmd build
```

Expected: exit code 0.

- [ ] **Step 10: Perform the manual performance scenario**

Use a production renderer build and a representative 10,000–50,000 character Markdown file. Record the production trace with Chromium DevTools; repeat the key interactions in a development renderer to inspect the development-only named marks:

1. Split right to two panels and verify immediate rich preview paint.
2. Activate each panel by clicking text and verify the first click places the caret.
3. Type continuously and inspect `editor:transaction` and long-task diagnostics.
4. Scroll both live and passive panes.
5. Drag horizontal and vertical dividers continuously.
6. Add a third panel and repeat.
7. Add six panels for the stress case and verify one BlockNote session remains.

Expected primary acceptance: no task above 50 ms for steady two- and three-pane interaction, split/activation p95 at or below 50 ms, and sustained scroll/resize near or above 55 FPS.

- [ ] **Step 11: Audit scope and cleanliness**

```powershell
git diff --check
git status --short
git diff --stat HEAD~10..HEAD
```

Confirm no dependency or lockfile changes, no raw Markdown transition, no panel cap, and no unrelated formatting.

- [ ] **Step 12: Commit diagnostics and final regression coverage**

```powershell
git add -- src/renderer/src/features/editor/lib/editor-performance.ts src/renderer/src/features/editor/lib/editor-performance.test.ts src/renderer/src/features/editor/components/editor.tsx src/renderer/src/features/editor/components/rich-document-pane.tsx src/renderer/src/features/editor/components/blocknote-editor.tsx
git commit -m "test: verify rich split panel performance"
```

---

## Final Acceptance Checklist

- [ ] Unlimited split controls remain enabled.
- [ ] Two and three same-document panes share one BlockNote/ProseMirror instance.
- [ ] Six same-document panes pass the structural stress tests.
- [ ] Passive panes show full rich styling and scroll independently.
- [ ] First pointer-down transfers the editor and restores the closest caret position.
- [ ] Split and activation never parse, call `replaceBlocks`, or display source text for an already visible document.
- [ ] One user edit produces one live transaction, one preview frame, one serialization pipeline, and one save schedule.
- [ ] Rich content and scroll hot paths do not fan out Zustand writes.
- [ ] Source mode, find, outline, images, code blocks, tables, drag/drop, and keyboard shortcuts remain correct.
- [ ] Focused tests, typecheck, format check, lint, build, and manual performance acceptance are complete.
