# Filesystem Watch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add filtered filesystem watching for opened files and workspace tree refreshes.

**Architecture:** The main process owns filesystem watchers and emits filtered IPC notifications. Renderer code subscribes through preload APIs, debounces tree refresh effects by relying on main-process event coalescing, and reuses the existing editor external-change flow for opened tabs.

**Tech Stack:** Electron main/preload IPC, Node `fs.watch`, React hooks, Zustand stores, TypeScript, Vitest.

---

## File Structure

- Create `src/main/file-watch.ts`: ignore helper, workspace watch controller, and single-file watch helpers.
- Modify `src/main/file.ts`: reuse ignore helper in `readDirectory`.
- Modify `src/main/ipc/file.ipc.ts`: replace inline watcher map with file/workspace watch functions.
- Modify `src/shared/constants/ipc-channels.ts`: add workspace watch channels.
- Modify `src/preload/api/file.api.ts`: expose workspace watch APIs.
- Modify `src/renderer/src/types/electron.d.ts`: type workspace watch APIs.
- Modify `src/renderer/src/hooks/use-electron.ts`: start workspace watching after folder open/load and refresh the tree from workspace change events.
- Test `src/main/file-watch.test.ts`: verify ignore rules and workspace event coalescing/filtering.

## Task 1: Ignore Rules

**Files:**

- Create: `src/main/file-watch.ts`
- Test: `src/main/file-watch.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";

import { shouldIgnoreFsWatchPath } from "./file-watch";

describe("shouldIgnoreFsWatchPath", () => {
  it("ignores dependency and git internals in any path segment", () => {
    expect(shouldIgnoreFsWatchPath("notes/.git/index")).toBe(true);
    expect(shouldIgnoreFsWatchPath("notes/node_modules/pkg/index.js")).toBe(
      true,
    );
  });

  it("ignores temporary, swap, backup, and cloud placeholder files", () => {
    expect(shouldIgnoreFsWatchPath("notes/.DS_Store")).toBe(true);
    expect(shouldIgnoreFsWatchPath("notes/.tolaria-rename-txn")).toBe(true);
    expect(shouldIgnoreFsWatchPath("notes/.#draft.md")).toBe(true);
    expect(shouldIgnoreFsWatchPath("notes/draft.md~")).toBe(true);
    expect(shouldIgnoreFsWatchPath("notes/draft.tmp")).toBe(true);
    expect(shouldIgnoreFsWatchPath("notes/draft.swp")).toBe(true);
    expect(shouldIgnoreFsWatchPath("notes/draft.swx")).toBe(true);
    expect(shouldIgnoreFsWatchPath("notes/draft.md.icloud")).toBe(true);
  });

  it("does not ignore regular markdown files", () => {
    expect(shouldIgnoreFsWatchPath("notes/daily.md")).toBe(false);
    expect(shouldIgnoreFsWatchPath("notes/folder/daily.md")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/file-watch.test.ts`
Expected: FAIL because `src/main/file-watch.ts` does not exist.

- [ ] **Step 3: Implement minimal ignore helper**

Create `src/main/file-watch.ts` with:

```ts
import path from "node:path";

const IGNORED_EXACT_NAMES = new Set([
  ".git",
  "node_modules",
  ".DS_Store",
  ".tolaria-rename-txn",
]);

export function shouldIgnoreFsWatchPath(targetPath: string): boolean {
  return targetPath
    .split(/[\\/]+/)
    .filter(Boolean)
    .some((segment) => {
      if (IGNORED_EXACT_NAMES.has(segment)) return true;
      if (segment.startsWith(".#")) return true;
      if (segment.endsWith("~")) return true;
      if (segment.endsWith(".tmp")) return true;
      if (segment.endsWith(".swp") || segment.endsWith(".swx")) return true;
      if (segment.endsWith(".icloud")) return true;
      return false;
    });
}

export function resolveWatchEventPath(
  rootPath: string,
  fileName?: string | null,
): string {
  return fileName ? path.join(rootPath, fileName) : rootPath;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/file-watch.test.ts`
Expected: PASS.

## Task 2: Directory Tree Filtering

**Files:**

- Modify: `src/main/file.ts`
- Test: `src/main/file-watch.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readDirectory } from "./file";

describe("readDirectory ignore integration", () => {
  it("skips ignored folders and files while keeping markdown notes", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "keep-notes-watch-"));
    fs.mkdirSync(path.join(root, "node_modules"));
    fs.writeFileSync(
      path.join(root, "node_modules", "ignored.md"),
      "# ignored",
    );
    fs.mkdirSync(path.join(root, ".git"));
    fs.writeFileSync(path.join(root, ".git", "ignored.md"), "# ignored");
    fs.writeFileSync(path.join(root, ".DS_Store"), "");
    fs.writeFileSync(path.join(root, "daily.md"), "# daily");

    const tree = await readDirectory(root);

    expect(tree).toEqual([
      { title: "daily.md", key: path.join(root, "daily.md") },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/file-watch.test.ts`
Expected: FAIL because `readDirectory` still uses local ad-hoc filtering.

- [ ] **Step 3: Reuse ignore helper in `readDirectory`**

Change `src/main/file.ts` to import `shouldIgnoreFsWatchPath` and skip any ignored `filePath` before `stat`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/file-watch.test.ts`
Expected: PASS.

## Task 3: Workspace Watch Coalescing

**Files:**

- Modify: `src/main/file-watch.ts`
- Test: `src/main/file-watch.test.ts`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
import { vi } from "vitest";

import { WorkspaceWatchRegistry } from "./file-watch";

describe("WorkspaceWatchRegistry", () => {
  it("coalesces multiple relevant events into one workspace notification", () => {
    vi.useFakeTimers();
    const close = vi.fn();
    let listener:
      | ((eventType: string, fileName: string | Buffer | null) => void)
      | undefined;
    const onChange = vi.fn();
    const registry = new WorkspaceWatchRegistry({
      watch: (_path, _options, callback) => {
        listener = callback;
        return { close };
      },
      debounceMs: 80,
    });

    registry.watchWorkspace("notes", onChange);
    listener?.("rename", "a.md");
    listener?.("change", "b.md");
    vi.advanceTimersByTime(79);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("notes");

    registry.unwatchWorkspace("notes");
    vi.useRealTimers();
  });

  it("ignores filtered workspace events", () => {
    vi.useFakeTimers();
    let listener:
      | ((eventType: string, fileName: string | Buffer | null) => void)
      | undefined;
    const onChange = vi.fn();
    const registry = new WorkspaceWatchRegistry({
      watch: (_path, _options, callback) => {
        listener = callback;
        return { close: vi.fn() };
      },
      debounceMs: 80,
    });

    registry.watchWorkspace("notes", onChange);
    listener?.("change", "node_modules/pkg/index.js");
    listener?.("change", ".DS_Store");
    vi.advanceTimersByTime(80);
    expect(onChange).not.toHaveBeenCalled();

    registry.unwatchWorkspace("notes");
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/file-watch.test.ts`
Expected: FAIL because `WorkspaceWatchRegistry` does not exist.

- [ ] **Step 3: Implement workspace watch registry**

Add a `WorkspaceWatchRegistry` class to `src/main/file-watch.ts` that accepts an injectable `watch` function, uses `fs.watch(rootPath, { recursive: true })` by default, filters with `shouldIgnoreFsWatchPath`, and debounces notifications by root path.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/file-watch.test.ts`
Expected: PASS.

## Task 4: IPC and Renderer Integration

**Files:**

- Modify: `src/main/ipc/file.ipc.ts`
- Modify: `src/shared/constants/ipc-channels.ts`
- Modify: `src/preload/api/file.api.ts`
- Modify: `src/renderer/src/types/electron.d.ts`
- Modify: `src/renderer/src/hooks/use-electron.ts`

- [ ] **Step 1: Add channels and preload methods**

Add `WATCH_WORKSPACE`, `UNWATCH_WORKSPACE`, and `ON_WORKSPACE_CHANGED` under `IPC_CHANNELS.FILE`. Expose matching methods from preload and renderer types.

- [ ] **Step 2: Register main-process workspace IPC**

Use one `WorkspaceWatchRegistry` instance in `file.ipc.ts`. On workspace events, send `IPC_CHANNELS.FILE.ON_WORKSPACE_CHANGED` with the root path.

- [ ] **Step 3: Subscribe in renderer**

In `useElectron`, when `openFolder` or `loadTree` succeeds, call `watchWorkspace(rootPath)`. Add a single effect-style subscription where practical, or a module-level guarded subscription, so `onWorkspaceChanged` refreshes the current tree through `generateTree`.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

## Task 5: Final Verification

**Files:**

- All changed files

- [ ] **Step 1: Run focused tests**

Run: `pnpm test src/main/file-watch.test.ts src/renderer/src/features/editor/lib/file-watch-registry.test.ts src/renderer/src/features/editor/lib/editor-external-change.test.ts`
Expected: PASS.

- [ ] **Step 2: Run project checks**

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm lint`
Expected: PASS.

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 3: Review diff**

Run: `git diff -- src/main src/preload src/shared src/renderer/src/hooks src/renderer/src/types docs/superpowers`
Expected: Diff only contains filesystem watch changes and docs.
