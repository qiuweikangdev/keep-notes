# Tolaria-Style Markdown Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stable Tolaria-style Markdown editing experience with rich/source modes, race-free file switching, path-scoped autosave, polished Markdown rendering, and responsive file-tree updates.

**Architecture:** Keep BlockNote as the rich rendered editor, add a raw Markdown source view, and move file loading, Markdown conversion, parsed-block caching, and saving into focused modules. Zustand remains the source of renderer UI state, while path-scoped runtime coordinators prevent stale async work and excessive disk writes.

**Tech Stack:** Electron 28, Vite 5, React 19, TypeScript 5.9, Zustand 4, BlockNote 0.51, Vitest 2, Testing Library, Tailwind CSS

---

## File Structure

### New Files

- `vitest.config.ts`: Vitest aliases, jsdom environment, and setup registration.
- `src/renderer/src/test/setup.ts`: DOM test setup and cleanup.
- `docs/superpowers/fixtures/markdown-editor-verification.md`: committed visual and round-trip verification fixture.
- `src/renderer/src/features/editor/lib/markdown.ts`: Markdown normalization, comparison, parsing, and serialization adapter.
- `src/renderer/src/features/editor/lib/markdown.test.ts`: Markdown adapter regression tests.
- `src/renderer/src/features/editor/lib/editor-cache.ts`: bounded content and parsed-block caches.
- `src/renderer/src/features/editor/lib/editor-cache.test.ts`: cache freshness and eviction tests.
- `src/renderer/src/features/editor/lib/editor-load-session.ts`: request IDs and stale-result guards.
- `src/renderer/src/features/editor/lib/editor-load-session.test.ts`: file-switch race tests.
- `src/renderer/src/features/editor/lib/editor-save-coordinator.ts`: path-scoped debounced writes and explicit flush.
- `src/renderer/src/features/editor/lib/editor-save-coordinator.test.ts`: debounce, revision, and path isolation tests.
- `src/renderer/src/features/editor/lib/editor-runtime.ts`: shared cache, load-session, and save-coordinator instances.
- `src/renderer/src/features/editor/hooks/use-editor-document.ts`: BlockNote document swap lifecycle.
- `src/renderer/src/features/editor/components/editor-toolbar.tsx`: mode toggle and save/load status.
- `src/renderer/src/features/editor/components/editor-state-view.tsx`: loading, error, and no-file states.
- `src/renderer/src/features/editor/components/markdown-source-editor.tsx`: exact source editing.
- `src/renderer/src/features/editor/components/editor-workspace.tsx`: state composition for one active panel tab.

### Modified Files

- `package.json`: test scripts and test dependencies.
- `pnpm-lock.yaml`: dependency lock updates.
- `src/main/file.ts`: throw read/write errors instead of converting them to empty success.
- `src/renderer/src/store/editor.store.ts`: richer tab state and focused actions.
- `src/renderer/src/store/tree.store.ts`: expanded path set and path-focused actions.
- `src/renderer/src/hooks/use-electron.ts`: race-safe cached file opening.
- `src/renderer/src/features/editor/components/editor.tsx`: render `EditorWorkspace`.
- `src/renderer/src/features/editor/components/blocknote-editor.tsx`: editor-only lifecycle and debounced serialization.
- `src/renderer/src/features/editor/components/editor-tab-bar.tsx`: status indicators and flush-on-close.
- `src/renderer/src/features/editor/components/editor-bridge.tsx`: flush before exposing save content.
- `src/renderer/src/features/editor/index.ts`: export `EditorWorkspace` through the existing feature barrel.
- `src/renderer/src/features/file-tree/components/file-tree.tsx`: stable callbacks and optimized search.
- `src/renderer/src/features/file-tree/components/tree-node.tsx`: fine-grained selectors and no editor subscription.
- `src/renderer/src/styles/blocknote-overrides.css`: Tolaria-aligned Markdown element styles.
- `src/renderer/src/styles/globals.css`: source editor, skeleton, reduced motion, and narrow-panel rules.

## Task 1: Establish the Test Harness and Markdown Adapter

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `vitest.config.ts`
- Create: `src/renderer/src/test/setup.ts`
- Create: `src/renderer/src/features/editor/lib/markdown.test.ts`
- Create: `src/renderer/src/features/editor/lib/markdown.ts`

- [ ] **Step 1: Add compatible test dependencies and scripts**

Run:

```powershell
cmd /c pnpm add -D vitest@^2.1.9 jsdom@^25.0.1 @testing-library/react@^16.1.0 @testing-library/jest-dom@^6.6.3 @testing-library/user-event@^14.5.2
```

Add these scripts to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Expected: `package.json` and `pnpm-lock.yaml` contain the new development dependencies.

- [ ] **Step 2: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src/renderer/src"),
      "@shared": resolve(__dirname, "src/shared"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/renderer/src/test/setup.ts"],
    restoreMocks: true,
  },
});
```

Create `src/renderer/src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());
```

- [ ] **Step 3: Write failing Markdown normalization tests**

Create `src/renderer/src/features/editor/lib/markdown.test.ts` with focused cases:

```ts
import { describe, expect, it } from "vitest";
import {
  markdownEquals,
  normalizeMarkdown,
  normalizeMarkdownListMarkers,
} from "./markdown";

describe("normalizeMarkdownListMarkers", () => {
  it("normalizes only unordered list markers at line starts", () => {
    expect(normalizeMarkdownListMarkers("* one\n  * nested\ntext * value"))
      .toBe("- one\n  - nested\ntext * value");
  });
});

describe("normalizeMarkdown", () => {
  it("normalizes line endings and trailing spaces while preserving indentation", () => {
    expect(normalizeMarkdown("  code  \r\ntext\t \r\n"))
      .toBe("  code\ntext\n");
  });

  it("keeps a single final newline for non-empty documents", () => {
    expect(normalizeMarkdown("hello\n\n\n")).toBe("hello\n");
    expect(normalizeMarkdown("")).toBe("");
  });
});

describe("markdownEquals", () => {
  it("treats list marker and line-ending differences as equivalent", () => {
    expect(markdownEquals("* item\r\n", "- item\n")).toBe(true);
  });
});
```

- [ ] **Step 4: Run the tests and verify RED**

Run:

```powershell
cmd /c pnpm test -- src/renderer/src/features/editor/lib/markdown.test.ts
```

Expected: FAIL because `./markdown` does not exist.

- [ ] **Step 5: Implement the normalization adapter**

Create `markdown.ts` with these exported contracts:

```ts
import type { BlockNoteEditor } from "@blocknote/core";

export type MarkdownParseResult<T> =
  | { ok: true; blocks: T }
  | { ok: false; error: Error };

export type MarkdownSerializeResult =
  | { ok: true; markdown: string }
  | { ok: false; error: Error };

export function normalizeMarkdownListMarkers(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => line.replace(/^(\s*)\* /, "$1- "))
    .join("\n");
}

export function normalizeMarkdown(markdown: string): string {
  const normalized = normalizeMarkdownListMarkers(markdown.replace(/\r\n?/g, "\n"))
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n+$/, "");

  return normalized ? `${normalized}\n` : "";
}

export function markdownEquals(left: string, right: string): boolean {
  return normalizeMarkdown(left) === normalizeMarkdown(right);
}

export async function parseMarkdown<T>(
  editor: Pick<BlockNoteEditor, "tryParseMarkdownToBlocks">,
  markdown: string,
): Promise<MarkdownParseResult<T>> {
  try {
    const blocks = await editor.tryParseMarkdownToBlocks(markdown);
    return { ok: true, blocks: blocks as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

export async function serializeMarkdown(
  editor: Pick<BlockNoteEditor, "blocksToMarkdownLossy" | "document">,
): Promise<MarkdownSerializeResult> {
  try {
    const markdown = await editor.blocksToMarkdownLossy(editor.document);
    return { ok: true, markdown: normalizeMarkdown(markdown) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
```

Adjust the generic BlockNote typings to the installed package's actual method signatures without changing behavior.

- [ ] **Step 6: Run the Markdown tests and verify GREEN**

Run:

```powershell
cmd /c pnpm test -- src/renderer/src/features/editor/lib/markdown.test.ts
```

Expected: all Markdown adapter tests pass.

- [ ] **Step 7: Commit**

```powershell
git add package.json pnpm-lock.yaml vitest.config.ts src/renderer/src/test/setup.ts src/renderer/src/features/editor/lib/markdown.ts src/renderer/src/features/editor/lib/markdown.test.ts
git commit -m "test: add Markdown editor test harness"
```

## Task 2: Add Path-Scoped Content, Parsed-Block, and Load-Request Caches

**Files:**
- Create: `src/renderer/src/features/editor/lib/editor-cache.test.ts`
- Create: `src/renderer/src/features/editor/lib/editor-cache.ts`
- Create: `src/renderer/src/features/editor/lib/editor-load-session.test.ts`
- Create: `src/renderer/src/features/editor/lib/editor-load-session.ts`
- Create: `src/renderer/src/features/editor/lib/editor-runtime.ts`

- [ ] **Step 1: Write failing bounded-cache tests**

Test these behaviors:

```ts
import { describe, expect, it } from "vitest";
import { EditorCache } from "./editor-cache";

describe("EditorCache", () => {
  it("returns content only when the stored source matches", () => {
    const cache = new EditorCache<string>({ maxEntries: 2 });
    cache.setContent("a.md", "alpha");
    cache.setBlocks("a.md", "alpha", "parsed-alpha", 24);

    expect(cache.getContent("a.md")).toBe("alpha");
    expect(cache.getBlocks("a.md", "alpha")).toEqual({
      blocks: "parsed-alpha",
      scrollTop: 24,
    });
    expect(cache.getBlocks("a.md", "changed")).toBeNull();
  });

  it("evicts the least recently used path", () => {
    const cache = new EditorCache<string>({ maxEntries: 2 });
    cache.setContent("a.md", "a");
    cache.setContent("b.md", "b");
    cache.getContent("a.md");
    cache.setContent("c.md", "c");

    expect(cache.getContent("a.md")).toBe("a");
    expect(cache.getContent("b.md")).toBeNull();
    expect(cache.getContent("c.md")).toBe("c");
  });
});
```

- [ ] **Step 2: Run cache tests and verify RED**

Run:

```powershell
cmd /c pnpm test -- src/renderer/src/features/editor/lib/editor-cache.test.ts
```

Expected: FAIL because the cache module is missing.

- [ ] **Step 3: Implement a small LRU editor cache**

Implement:

```ts
interface EditorCacheOptions {
  maxEntries: number;
}

interface CachedEditorEntry<TBlocks> {
  content: string | null;
  parsed: {
    source: string;
    blocks: TBlocks;
    scrollTop: number;
  } | null;
}

export class EditorCache<TBlocks> {
  private readonly entries = new Map<string, CachedEditorEntry<TBlocks>>();

  constructor(private readonly options: EditorCacheOptions) {}

  getContent(path: string): string | null;
  setContent(path: string, content: string): void;
  getBlocks(path: string, source: string): { blocks: TBlocks; scrollTop: number } | null;
  setBlocks(path: string, source: string, blocks: TBlocks, scrollTop: number): void;
  setScrollTop(path: string, scrollTop: number): void;
  delete(path: string): void;
  clear(): void;
}
```

Every read refreshes recency. Every write trims to `maxEntries`.

- [ ] **Step 4: Write failing stale-load tests**

Create `editor-load-session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EditorLoadSession } from "./editor-load-session";

describe("EditorLoadSession", () => {
  it("accepts only the latest request for a tab", () => {
    const session = new EditorLoadSession();
    const first = session.begin("group-1", "tab-1", "a.md");
    const second = session.begin("group-1", "tab-1", "b.md");

    expect(session.isCurrent(first)).toBe(false);
    expect(session.isCurrent(second)).toBe(true);
  });

  it("does not mix requests between tabs", () => {
    const session = new EditorLoadSession();
    const left = session.begin("left", "tab", "a.md");
    const right = session.begin("right", "tab", "b.md");

    expect(session.isCurrent(left)).toBe(true);
    expect(session.isCurrent(right)).toBe(true);
  });
});
```

- [ ] **Step 5: Run load-session tests and verify RED**

Run:

```powershell
cmd /c pnpm test -- src/renderer/src/features/editor/lib/editor-load-session.test.ts
```

Expected: FAIL because the session module is missing.

- [ ] **Step 6: Implement request tokens**

Use this public API:

```ts
export interface EditorLoadToken {
  groupId: string;
  tabId: string;
  path: string;
  requestId: number;
}

export class EditorLoadSession {
  private requestId = 0;
  private readonly active = new Map<string, EditorLoadToken>();

  begin(groupId: string, tabId: string, path: string): EditorLoadToken;
  isCurrent(token: EditorLoadToken): boolean;
  cancel(groupId: string, tabId: string): void;
}
```

Key active requests by `${groupId}:${tabId}`.

- [ ] **Step 7: Add shared runtime instances**

Create `editor-runtime.ts`:

```ts
import type { Block } from "@blocknote/core";
import { EditorCache } from "./editor-cache";
import { EditorLoadSession } from "./editor-load-session";

export const editorCache = new EditorCache<Block[]>({ maxEntries: 24 });
export const editorLoadSession = new EditorLoadSession();
```

The save coordinator is added to this file in Task 3.

- [ ] **Step 8: Run both test files and verify GREEN**

Run:

```powershell
cmd /c pnpm test -- src/renderer/src/features/editor/lib/editor-cache.test.ts src/renderer/src/features/editor/lib/editor-load-session.test.ts
```

Expected: all cache and request-token tests pass.

- [ ] **Step 9: Commit**

```powershell
git add src/renderer/src/features/editor/lib/editor-cache.ts src/renderer/src/features/editor/lib/editor-cache.test.ts src/renderer/src/features/editor/lib/editor-load-session.ts src/renderer/src/features/editor/lib/editor-load-session.test.ts src/renderer/src/features/editor/lib/editor-runtime.ts
git commit -m "feat: add editor file session caches"
```

## Task 3: Implement Revision-Safe Autosave

**Files:**
- Create: `src/renderer/src/features/editor/lib/editor-save-coordinator.test.ts`
- Create: `src/renderer/src/features/editor/lib/editor-save-coordinator.ts`
- Modify: `src/renderer/src/features/editor/lib/editor-runtime.ts`
- Modify: `src/main/file.ts`

- [ ] **Step 1: Write failing save-coordinator tests**

Cover latest-write batching and path isolation with fake timers:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditorSaveCoordinator } from "./editor-save-coordinator";

describe("EditorSaveCoordinator", () => {
  beforeEach(() => vi.useFakeTimers());

  it("persists only the latest revision after the idle delay", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const coordinator = new EditorSaveCoordinator({ delayMs: 800, write });

    coordinator.schedule("a.md", "one");
    coordinator.schedule("a.md", "two");
    await vi.advanceTimersByTimeAsync(800);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("a.md", "two");
  });

  it("flushes one path without clearing another", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const coordinator = new EditorSaveCoordinator({ delayMs: 800, write });

    coordinator.schedule("a.md", "a");
    coordinator.schedule("b.md", "b");
    await coordinator.flush("a.md");

    expect(write).toHaveBeenCalledWith("a.md", "a");
    expect(coordinator.hasPending("b.md")).toBe(true);
  });
});
```

Add a test where the first write resolves after a newer revision is queued and
verify the newer revision remains pending.

- [ ] **Step 2: Run save tests and verify RED**

Run:

```powershell
cmd /c pnpm test -- src/renderer/src/features/editor/lib/editor-save-coordinator.test.ts
```

Expected: FAIL because the coordinator is missing.

- [ ] **Step 3: Implement the coordinator**

Use this public contract:

```ts
interface EditorSaveCoordinatorOptions {
  delayMs: number;
  write: (path: string, content: string) => Promise<void>;
  onStateChange?: (
    path: string,
    state: "dirty" | "saving" | "clean" | "error",
    error?: Error,
  ) => void;
}

export class EditorSaveCoordinator {
  constructor(options: EditorSaveCoordinatorOptions);
  schedule(path: string, content: string): number;
  hasPending(path: string): boolean;
  flush(path: string): Promise<boolean>;
  flushAll(): Promise<void>;
  cancel(path: string): void;
  markExternalContent(path: string, content: string): void;
  isOwnWrite(path: string, content: string): boolean;
}
```

Internally store one pending record per path:

```ts
interface PendingSave {
  content: string;
  revision: number;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<boolean> | null;
}
```

After a write, clear the pending record only when its revision and content still
match the persisted snapshot.

- [ ] **Step 4: Add a save-coordinator factory to the runtime module**

Extend `editor-runtime.ts`:

```ts
import { EditorSaveCoordinator } from "./editor-save-coordinator";

export function createEditorSaveCoordinator(options: {
  write: (path: string, content: string) => Promise<void>;
  onStateChange: (
    path: string,
    state: "dirty" | "saving" | "clean" | "error",
    error?: Error,
  ) => void;
}) {
  return new EditorSaveCoordinator({
    delayMs: 800,
    write: options.write,
    onStateChange: options.onStateChange,
  });
}
```

The concrete singleton is created in Task 4 after the store gains
`setFileSaveState`.

- [ ] **Step 5: Make filesystem failures observable**

Change `readFileContent` and `writeFileContent` in `src/main/file.ts` to log and
rethrow errors:

```ts
export async function readFileContent(filePath: string) {
  try {
    return await fs.promises.readFile(filePath, "utf-8");
  } catch (error) {
    console.error("Error while reading file:", error);
    throw error;
  }
}
```

Apply the same pattern to writes. This preserves the existing preload return
types while allowing renderer `try/catch` to distinguish empty files from
failed reads.

- [ ] **Step 6: Run save tests and verify GREEN**

Run:

```powershell
cmd /c pnpm test -- src/renderer/src/features/editor/lib/editor-save-coordinator.test.ts
```

Expected: all save coordinator tests pass.

- [ ] **Step 7: Commit**

```powershell
git add src/main/file.ts src/renderer/src/features/editor/lib/editor-save-coordinator.ts src/renderer/src/features/editor/lib/editor-save-coordinator.test.ts src/renderer/src/features/editor/lib/editor-runtime.ts
git commit -m "feat: add revision-safe editor autosave"
```

## Task 4: Expand Tab State and Implement Race-Free File Opening

**Files:**
- Modify: `src/renderer/src/store/editor.store.ts`
- Modify: `src/renderer/src/hooks/use-electron.ts`
- Modify: `src/renderer/src/store/tree.store.ts`
- Test: `src/renderer/src/features/editor/lib/editor-load-session.test.ts`

- [ ] **Step 1: Add failing state-transition tests**

Extend the load-session test with a small fake store adapter or add
`editor-file-open.test.ts` for this exact sequence:

```ts
it("keeps the second file when the first read resolves last", async () => {
  const first = deferred<string>();
  const second = deferred<string>();
  const read = vi.fn((path: string) => path === "a.md" ? first.promise : second.promise);
  const applied: Array<{ path: string; content: string }> = [];
  const open = createFileOpenController({
    read,
    apply: (path, content) => applied.push({ path, content }),
  });

  const openA = open("group", "tab", "a.md");
  const openB = open("group", "tab", "b.md");
  second.resolve("B");
  await openB;
  first.resolve("A");
  await openA;

  expect(applied).toEqual([{ path: "b.md", content: "B" }]);
});
```

Implement `createFileOpenController` in `editor-load-session.ts` as a
dependency-injected helper used by `useElectron`.

- [ ] **Step 2: Run the race test and verify RED**

Run:

```powershell
cmd /c pnpm test -- src/renderer/src/features/editor/lib/editor-load-session.test.ts
```

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Add richer tab fields and atomic actions**

Extend `EditorTab` with:

```ts
type EditorMode = "rich" | "source";
type EditorLoadStatus = "idle" | "loading" | "ready" | "error";
type EditorSaveStatus = "clean" | "dirty" | "saving" | "error";

interface EditorTab {
  id: string;
  filePath: string | null;
  content: string;
  wordCount: number;
  isDirty: boolean;
  reloadKey: number;
  mode: EditorMode;
  loadStatus: EditorLoadStatus;
  saveStatus: EditorSaveStatus;
  errorMessage: string | null;
  scrollTop: number;
}
```

Add actions:

```ts
beginTabLoad(groupId: string, tabId: string, path: string): void;
completeTabLoad(groupId: string, tabId: string, path: string, content: string): void;
failTabLoad(groupId: string, tabId: string, path: string, message: string): void;
setTabMode(groupId: string, tabId: string, mode: EditorMode): void;
setTabScrollTop(groupId: string, tabId: string, scrollTop: number): void;
setFileSaveState(path: string, status: EditorSaveStatus, message: string | null): void;
syncFileContent(path: string, content: string, sourceTabId?: string): void;
```

`completeTabLoad` and `failTabLoad` must verify the tab still targets `path`.
`syncFileContent` updates every tab with the same path while preserving unrelated
tab objects.

- [ ] **Step 4: Implement the file-open controller and cached loading**

`createFileOpenController` must:

1. Begin a request token.
2. Return cached content when available.
3. Await `read(path)` otherwise.
4. Ignore stale tokens.
5. Cache successful content.
6. Report typed errors.

Use it in `useElectron.openFile`:

```ts
const state = useEditorStore.getState();
const target = resolveTargetTab(state, targetGroupId);
await editorSaveCoordinator.flush(currentActivePath);
state.setActiveTab(target.groupId, target.tabId);
state.beginTabLoad(target.groupId, target.tabId, filePath);
useTreeStore.getState().setSelectedKey(filePath);

await fileOpenController.open({
  groupId: target.groupId,
  tabId: target.tabId,
  path: filePath,
  onSuccess: (content) => {
    useEditorStore.getState().completeTabLoad(
      target.groupId,
      target.tabId,
      filePath,
      content,
    );
  },
  onError: (error) => {
    useEditorStore.getState().failTabLoad(
      target.groupId,
      target.tabId,
      filePath,
      error.message,
    );
  },
});
```

Remove the single global `openingFileRef`, because request tokens now isolate
each tab and panel.

- [ ] **Step 5: Configure the concrete save coordinator**

Extend `editor-runtime.ts` after the Task 4 store actions exist:

```ts
import { useEditorStore } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";

export const editorSaveCoordinator = createEditorSaveCoordinator({
  write: async (path, content) => {
    await window.electronAPI.writeFile(path, content);
    useTreeStore.getState().updateNodeContent(path, content);
  },
  onStateChange: (path, state, error) => {
    useEditorStore
      .getState()
      .setFileSaveState(path, state, error?.message ?? null);
  },
});
```

- [ ] **Step 6: Convert expanded paths to a Set-backed store**

Change tree state to:

```ts
expandedKeys: Set<string>;
setExpandedKeys: (keys: Iterable<string>) => void;
```

`toggleExpandedKey` clones only the set:

```ts
toggleExpandedKey: (key) =>
  set((state) => {
    const expandedKeys = new Set(state.expandedKeys);
    if (expandedKeys.has(key)) expandedKeys.delete(key);
    else expandedKeys.add(key);
    return { expandedKeys };
  }),
```

Because expanded keys are not persisted, no serialization migration is needed.

- [ ] **Step 7: Run the load tests and verify GREEN**

Run:

```powershell
cmd /c pnpm test -- src/renderer/src/features/editor/lib/editor-load-session.test.ts
```

Expected: stale reads are ignored and independent tabs remain independent.

- [ ] **Step 8: Run focused type checking**

Run:

```powershell
cmd /c pnpm typecheck:web
```

Expected: no TypeScript errors after updating all `expandedKeys` consumers.

- [ ] **Step 9: Commit**

```powershell
git add src/renderer/src/store/editor.store.ts src/renderer/src/store/tree.store.ts src/renderer/src/hooks/use-electron.ts src/renderer/src/features/editor/lib/editor-load-session.ts src/renderer/src/features/editor/lib/editor-load-session.test.ts src/renderer/src/features/editor/lib/editor-runtime.ts
git commit -m "feat: make Markdown file switching race-safe"
```

## Task 5: Build the Rich/Source Editor Workspace

**Files:**
- Create: `src/renderer/src/features/editor/hooks/use-editor-document.ts`
- Create: `src/renderer/src/features/editor/components/editor-toolbar.tsx`
- Create: `src/renderer/src/features/editor/components/editor-state-view.tsx`
- Create: `src/renderer/src/features/editor/components/markdown-source-editor.tsx`
- Create: `src/renderer/src/features/editor/components/editor-workspace.tsx`
- Modify: `src/renderer/src/features/editor/components/blocknote-editor.tsx`
- Modify: `src/renderer/src/features/editor/components/editor.tsx`
- Modify: `src/renderer/src/features/editor/components/editor-tab-bar.tsx`
- Modify: `src/renderer/src/features/editor/components/editor-bridge.tsx`

- [ ] **Step 1: Write failing component tests for loading, errors, and source editing**

Create component tests with these behaviors:

```tsx
it("shows a skeleton instead of the previous document while loading", () => {
  render(<EditorStateView status="loading" fileName="b.md" />);
  expect(screen.getByTestId("editor-loading-skeleton")).toBeInTheDocument();
  expect(screen.queryByText("old content")).not.toBeInTheDocument();
});

it("renders a retry action for read errors", async () => {
  const retry = vi.fn();
  render(
    <EditorStateView
      status="error"
      fileName="broken.md"
      message="Access denied"
      onRetry={retry}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "重试加载" }));
  expect(retry).toHaveBeenCalledTimes(1);
});

it("inserts two spaces when Tab is pressed in source mode", () => {
  // Render MarkdownSourceEditor, place caret, press Tab, and assert the value.
});
```

- [ ] **Step 2: Run the component tests and verify RED**

Run:

```powershell
cmd /c pnpm test -- src/renderer/src/features/editor/components/editor-state-view.test.tsx src/renderer/src/features/editor/components/markdown-source-editor.test.tsx
```

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the document swap hook**

`use-editor-document.ts` owns:

```ts
interface UseEditorDocumentOptions {
  editor: BlockNoteEditor;
  path: string | null;
  content: string;
  reloadKey: number;
  scrollTop: number;
  scrollElementRef: RefObject<HTMLDivElement | null>;
  onParseError: (message: string) => void;
}
```

The hook must:

- Flush the current serialized editor change before a path change.
- Cache current blocks and scroll position.
- Increment an apply token for every requested document.
- Clear DOM selection before applying another path.
- Reuse parsed blocks only for an exact source match.
- Parse through `parseMarkdown`.
- Ignore stale parse completion.
- Replace empty Markdown with one paragraph block.
- Restore scroll after `requestAnimationFrame`.
- Suppress editor change events during document replacement.

Return:

```ts
{
  suppressChangeRef,
  flushSerializedChangeRef,
}
```

- [ ] **Step 4: Refactor BlockNote editor responsibilities**

`BlockNoteEditor` receives an already selected tab:

```ts
interface BlockNoteEditorProps {
  groupId: string;
  tabId: string;
  path: string | null;
  content: string;
  reloadKey: number;
  scrollTop: number;
  onParseError: (message: string) => void;
}
```

On editor change:

1. Wait 250 ms.
2. Skip while `suppressChangeRef.current` is true.
3. Serialize through `serializeMarkdown`.
4. Skip when `markdownEquals(serialized, currentTabContent)` is true.
5. Call `syncFileContent(path, markdown, tabId)`.
6. Schedule `editorSaveCoordinator.schedule(path, markdown)`.
7. Update the active tab word count.

Cancel the serialization timer on unmount and expose a flush callback to the
runtime registry so file switches and the bridge can force serialization.

Add this registry to `editor-runtime.ts`:

```ts
type EditorChangeFlusher = () => void;

const editorChangeFlushers = new Map<string, EditorChangeFlusher>();

function editorInstanceKey(groupId: string, tabId: string): string {
  return `${groupId}:${tabId}`;
}

export function registerEditorChangeFlusher(
  groupId: string,
  tabId: string,
  flush: EditorChangeFlusher,
): () => void {
  const key = editorInstanceKey(groupId, tabId);
  editorChangeFlushers.set(key, flush);
  return () => {
    if (editorChangeFlushers.get(key) === flush) {
      editorChangeFlushers.delete(key);
    }
  };
}

export function flushEditorChange(groupId: string, tabId: string): void {
  editorChangeFlushers.get(editorInstanceKey(groupId, tabId))?.();
}
```

- [ ] **Step 5: Implement source editor and states**

`MarkdownSourceEditor`:

- Uses a textarea with `spellCheck={false}`.
- Calls `onChange` immediately.
- Inserts two spaces on Tab.
- Persists selection through normal textarea behavior.
- Calls `onScrollTopChange`.
- Uses `aria-label="Markdown 源码"`.

`EditorStateView`:

- `loading`: five-line skeleton and file name for assistive text.
- `error`: concise error, `重试加载` button.
- `empty`: no-file instruction only, not for empty ready documents.

- [ ] **Step 6: Implement toolbar and workspace composition**

`EditorToolbar` includes:

- File name
- `富文本` and `源码` mode buttons
- `正在保存`, `已保存`, or `保存失败`
- Retry save button only on save error

`EditorWorkspace`:

- Selects exactly one tab by `groupId` and `activeTabId`.
- Shows `EditorStateView` for loading and error.
- Shows `MarkdownSourceEditor` when mode is `source`.
- Shows `BlockNoteEditor` when mode is `rich`.
- On source input, updates matching file tabs and schedules save.
- On switching source to rich, parses before changing mode; if parsing fails,
  source mode remains active with the exact content.
- Retry load calls `openFile(path, groupId)`.

- [ ] **Step 7: Replace direct editor rendering**

In `editor.tsx`, replace:

```tsx
<BlockNoteEditor groupId={groupId} tabId={group.activeTabId} />
```

with:

```tsx
<EditorWorkspace groupId={groupId} tabId={group.activeTabId} />
```

Use selector-based subscriptions for `Editor`, `EditorPanelGroup`, and
`EditorTabBar` so content changes do not rerender every panel and tab.

- [ ] **Step 8: Flush on tab close and bridge reads**

Before closing a tab:

```ts
flushEditorChange(groupId, tabId);
if (tab.filePath) await editorSaveCoordinator.flush(tab.filePath);
removeTab(groupId, tabId);
```

Before `__getEditorContent` returns, synchronously flush pending rich-editor
serialization if available. Keep the bridge API synchronous by ensuring the
editor serialization flush updates store content immediately before returning;
disk persistence remains asynchronous.

- [ ] **Step 9: Run component tests and verify GREEN**

Run:

```powershell
cmd /c pnpm test -- src/renderer/src/features/editor/components/editor-state-view.test.tsx src/renderer/src/features/editor/components/markdown-source-editor.test.tsx
```

Expected: all editor state and source interaction tests pass.

- [ ] **Step 10: Run all editor tests**

Run:

```powershell
cmd /c pnpm test -- src/renderer/src/features/editor
```

Expected: Markdown, cache, load, save, and component tests all pass.

- [ ] **Step 11: Commit**

```powershell
git add src/renderer/src/features/editor src/renderer/src/store/editor.store.ts
git commit -m "feat: add rich and source Markdown modes"
```

## Task 6: Optimize File Tree Subscriptions

**Files:**
- Modify: `src/renderer/src/features/file-tree/components/file-tree.tsx`
- Modify: `src/renderer/src/features/file-tree/components/tree-node.tsx`
- Create: `src/renderer/src/features/file-tree/components/tree-node.test.tsx`

- [ ] **Step 1: Write a failing render-isolation test**

Create a test wrapper with two memoized nodes and a render counter:

```tsx
it("does not rerender an unrelated node when selection changes", () => {
  const counts = new Map<string, number>();
  render(<TreeHarness counts={counts} />);

  act(() => useTreeStore.getState().setSelectedKey("a.md"));
  const bAfterA = counts.get("b.md");
  act(() => useTreeStore.getState().setSelectedKey("folder/c.md"));

  expect(counts.get("b.md")).toBe(bAfterA);
});
```

Expose an optional development-only `onRender` prop or test a small
`TreeNodeSelectionProbe` selector component. Do not ship render counters in
production.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
cmd /c pnpm test -- src/renderer/src/features/file-tree/components/tree-node.test.tsx
```

Expected: the unrelated node rerenders because current subscriptions are broad.

- [ ] **Step 3: Narrow every tree-node subscription**

Replace broad destructuring:

```ts
const { selectedKey, expandedKeys, treeData, treeRoot } = useTreeStore();
const { panelGroups, activeGroupId } = useEditorStore();
```

with scalar selectors:

```ts
const isSelected = useTreeStore((state) => state.selectedKey === node.key);
const isExpanded = useTreeStore((state) => state.expandedKeys.has(node.key));
const setSelectedKey = useTreeStore((state) => state.setSelectedKey);
const toggleExpandedKey = useTreeStore((state) => state.toggleExpandedKey);
```

Read `treeData`, `treeRoot`, and editor state imperatively inside create,
rename, move, delete, and diff callbacks:

```ts
const treeData = useTreeStore.getState().treeData;
const editorState = useEditorStore.getState();
```

This prevents editor keystrokes from rerendering tree nodes.

- [ ] **Step 4: Stabilize parent callbacks and search**

In `FileTree`:

- Subscribe separately to `treeData`, `treeRoot`, and actions.
- Compute `normalizedQuery` once with `useMemo`.
- Keep `onCreateInFolder` stable with `useCallback`.
- Pass no newly created object props to unchanged child nodes.

Keep recursive rendering only for expanded folders.

- [ ] **Step 5: Run the render-isolation test and verify GREEN**

Run:

```powershell
cmd /c pnpm test -- src/renderer/src/features/file-tree/components/tree-node.test.tsx
```

Expected: unrelated nodes retain their render count.

- [ ] **Step 6: Run typecheck and lint for tree changes**

Run:

```powershell
cmd /c pnpm typecheck:web
cmd /c pnpm lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```powershell
git add src/renderer/src/features/file-tree src/renderer/src/store/tree.store.ts
git commit -m "perf: isolate file tree node updates"
```

## Task 7: Apply Tolaria-Aligned Markdown Typography and Interaction Polish

**Files:**
- Create: `docs/superpowers/fixtures/markdown-editor-verification.md`
- Modify: `src/renderer/src/styles/blocknote-overrides.css`
- Modify: `src/renderer/src/styles/globals.css`
- Modify: `src/renderer/src/features/editor/components/editor-toolbar.tsx`
- Modify: `src/renderer/src/features/editor/components/editor-state-view.tsx`

- [ ] **Step 1: Add a Markdown fixture for visual verification**

Create `docs/superpowers/fixtures/markdown-editor-verification.md` with:

```md
# Heading One

Paragraph with **bold**, *italic*, ~~deleted~~, `inline code`, and [a link](https://example.com).

## Lists

- First
  - Nested
- [ ] Todo
- [x] Done

> A multiline blockquote
> with a second line.

```ts
const greeting = "hello";
console.log(greeting);
```

| Name | Value |
| --- | ---: |
| Alpha | 1 |

---
```

The fixture must contain no personal or temporary filesystem paths.

- [ ] **Step 2: Scope the editor reading layout**

In `blocknote-overrides.css`, establish:

```css
.markdown-editor-canvas .bn-container {
  width: 100%;
  min-height: 100%;
}

.markdown-editor-canvas .bn-editor {
  width: 100%;
  max-width: 760px;
  min-height: 100%;
  margin: 0 auto;
  padding: 28px clamp(16px, 5vw, var(--editor-padding, 60px)) 120px;
  font-size: var(--editor-font-size, 16px);
  line-height: var(--editor-line-height, 1.8);
  caret-color: var(--accent-color);
}
```

Remove duplicate or obsolete `.milkdown` editor styles from the active
BlockNote path only when confirmed unused by `rg "milkdown" src`.

- [ ] **Step 3: Style supported Markdown elements**

Add scoped rules for:

- Paragraph bottom spacing
- H1 through H4 size, weight, line height, and margins
- Stable unordered and ordered marker widths
- Nested list indentation without decorative guide lines
- Task checkbox alignment and accent
- Inline code
- Fenced code blocks and language select
- One-pixel logical blockquote border
- Table cells, headers, and horizontal overflow
- Horizontal rule
- Links and focus-visible state
- Images with bounded width and modest radius
- Strong, emphasis, and strikethrough
- Text selection

Use existing CSS variables and avoid `dangerouslySetInnerHTML`.

- [ ] **Step 4: Add source editor and state styles**

In `globals.css` add:

```css
.markdown-source-editor {
  width: min(100%, 860px);
  min-height: 100%;
  margin: 0 auto;
  padding: 28px clamp(16px, 5vw, var(--editor-padding, 60px)) 120px;
  resize: none;
  border: 0;
  outline: 0;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: "SF Mono", "Fira Code", Consolas, monospace;
  font-size: 14px;
  line-height: 1.7;
  tab-size: 2;
}
```

Add skeleton shimmer-free pulse using opacity only, plus:

```css
@media (prefers-reduced-motion: reduce) {
  .editor-loading-line,
  .editor-toolbar * {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 5: Run impeccable static checks**

Run the installed detector on edited UI files:

```powershell
node "$HOME\.codex\skills\impeccable\scripts\detect.mjs" --json src/renderer/src/features/editor src/renderer/src/styles/blocknote-overrides.css src/renderer/src/styles/globals.css
```

Expected: no prohibited gradient text, oversized radii, decorative heavy side
stripes, or unbounded text overflow.

- [ ] **Step 6: Run all automated gates**

Run:

```powershell
cmd /c pnpm test
cmd /c pnpm typecheck
cmd /c pnpm lint
cmd /c pnpm build
```

Expected: every command exits with code 0.

- [ ] **Step 7: Commit**

```powershell
git add docs/superpowers/fixtures/markdown-editor-verification.md src/renderer/src/styles src/renderer/src/features/editor
git commit -m "style: polish Markdown editing experience"
```

## Task 8: Runtime Verification and Acceptance Audit

**Files:**
- Modify only files required to fix defects found during verification.

- [ ] **Step 1: Start the Electron application**

Run:

```powershell
cmd /c pnpm dev
```

Expected: the Electron window opens without renderer console errors.

- [ ] **Step 2: Verify file switching**

Using at least three Markdown files:

1. Switch A to B to C rapidly.
2. Confirm the toolbar and tree highlight change immediately.
3. Confirm old content is replaced by a skeleton, never shown under the new
   file name.
4. Confirm the final editor content belongs to C.
5. Switch to an empty file and confirm no previous blocks remain.
6. Switch back and confirm scroll position restoration.

- [ ] **Step 3: Verify editing and saving**

1. Type rapidly in a large document.
2. Confirm no disk write occurs for every keystroke.
3. Confirm save state changes from dirty to saving to clean.
4. Switch files before the debounce expires and confirm content flushes.
5. Open the same path in another panel and confirm synchronized content.
6. Trigger a write failure with a read-only or invalid target fixture and confirm
   the error state is recoverable.

- [ ] **Step 4: Verify rich/source round trips**

For the fixture document:

1. Inspect headings, inline styles, code language, nested lists, tasks,
   blockquote, table, image, and rule in rich mode.
2. Switch to source and confirm valid Markdown.
3. Edit source, switch back, and confirm the rich document reflects changes.
4. Enter malformed or unsupported Markdown and confirm exact source is retained
   when parsing fails.
5. Confirm raw HTML does not execute.

- [ ] **Step 5: Verify performance behavior**

1. Open a directory with many nested Markdown files.
2. Expand and collapse folders while typing in the editor.
3. Confirm editor keystrokes do not rerender unrelated tree nodes using React
   DevTools highlight updates or temporary local instrumentation.
4. Confirm reopening a recently visited file avoids repeated Markdown parsing.
5. Confirm a large document scrolls and accepts input without visible stalls.

- [ ] **Step 6: Verify themes and accessibility**

Check light, dark, Nord, Dracula, and Solarized:

- Text contrast remains readable.
- Caret and selection remain visible.
- Focus-visible rings appear on mode, retry, and save controls.
- Narrow split panels use 16 px minimum padding without overflow.
- Reduced-motion mode removes non-essential animation.

- [ ] **Step 7: Re-run fresh final gates**

Run:

```powershell
cmd /c pnpm test
cmd /c pnpm typecheck
cmd /c pnpm lint
cmd /c pnpm build
git diff --check
git status --short
```

Expected: all commands pass; status contains only intentional feature changes
and the user's pre-existing deletion of
`electron.vite.config.1780482490701.mjs`.

- [ ] **Step 8: Final requirement audit**

Compare the current application against every acceptance item in
`docs/superpowers/specs/2026-06-09-markdown-editor-tolaria-design.md`.
For each item, record the test, command, source inspection, or runtime observation
that proves it. Fix any uncovered gap before declaring completion.

- [ ] **Step 9: Commit verification fixes**

If verification required fixes, stage the exact files changed during verification
after checking `git diff --name-only`, then run:

```powershell
git commit -m "fix: resolve Markdown editor verification issues"
```

If no fixes were needed, do not create an empty commit.
