# Large Document Editor Responsiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep large rich-text documents responsive during typing and file switching without changing Markdown output, auto-save results, tab reuse, or small-document behavior.

**Architecture:** Add a cancelable quiet-period wrapper around the existing browser-idle scheduling path, and apply it only at the existing 10,000-character large-document threshold. During large rich-text file reuse, retain the old document session, complete the target transition first, and then serialize and save the old session in a caught background task.

**Tech Stack:** Electron 42, React 19, TypeScript 5.9, BlockNote 0.51, Zustand 4, Vitest 3, pnpm 11.

## Global Constraints

- Do not add or update dependencies or modify `pnpm-lock.yaml`.
- Preserve Markdown parsing, serialization, source preservation, undo history, tab reuse, file watching, and automatic-save output.
- Keep small rich-text documents and all source-mode documents on the current synchronous file-reuse path.
- Use the existing `LARGE_DOCUMENT_CHAR_LIMIT` value of `10000`.
- Write Chinese comments for core method logic.
- Limit production changes to scheduling and file-transition ordering.

---

### Task 1: Add a Cancelable Quiet-Period Idle Scheduler

**Files:**
- Modify: `src/renderer/src/features/editor/lib/editor-large-document.ts`
- Create: `src/renderer/src/features/editor/lib/editor-large-document.test.ts`

**Interfaces:**
- Consumes: browser timer and idle-callback APIs through an optional `EditorIdleSchedulerEnvironment`, allowing deterministic tests without mutating global browser APIs.
- Produces: `LARGE_DOCUMENT_SERIALIZATION_QUIET_PERIOD_MS`, `getEditorSerializationQuietPeriod(content: string): number`, and `scheduleEditorIdleTask(callback: () => void, timeout?: number, quietPeriodMs?: number, environment?: EditorIdleSchedulerEnvironment): () => void`.

- [ ] **Step 1: Write the failing tests**

```ts
it("waits for the quiet period before requesting idle work", () => {
  vi.useFakeTimers();
  const requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
    callback({ didTimeout: false, timeRemaining: () => 10 });
    return 7;
  });
  const environment = {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    requestIdleCallback,
    cancelIdleCallback: vi.fn(),
  };
  const callback = vi.fn();

  scheduleEditorIdleTask(
    callback,
    1200,
    LARGE_DOCUMENT_SERIALIZATION_QUIET_PERIOD_MS,
    environment,
  );

  expect(requestIdleCallback).not.toHaveBeenCalled();
  vi.advanceTimersByTime(LARGE_DOCUMENT_SERIALIZATION_QUIET_PERIOD_MS);
  expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), {
    timeout: 1200,
  });
  expect(callback).toHaveBeenCalledOnce();
});

it("cancels delayed work before it reaches the idle queue", () => {
  vi.useFakeTimers();
  const requestIdleCallback = vi.fn();
  const environment = {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    requestIdleCallback,
    cancelIdleCallback: vi.fn(),
  };
  const callback = vi.fn();
  const cancel = scheduleEditorIdleTask(callback, 1200, 800, environment);

  cancel();
  vi.runAllTimers();

  expect(requestIdleCallback).not.toHaveBeenCalled();
  expect(callback).not.toHaveBeenCalled();
});

it("cancels work after it enters the idle queue", () => {
  const cancelIdleCallback = vi.fn();
  const environment = {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    requestIdleCallback: vi.fn(() => 11),
    cancelIdleCallback,
  };
  const callback = vi.fn();
  const cancel = scheduleEditorIdleTask(callback, 1200, 0, environment);

  cancel();

  expect(cancelIdleCallback).toHaveBeenCalledWith(11);
  expect(callback).not.toHaveBeenCalled();
});

it("uses the quiet period only at the existing threshold", () => {
  expect(getEditorSerializationQuietPeriod("x".repeat(9_999))).toBe(0);
  expect(getEditorSerializationQuietPeriod("x".repeat(10_000))).toBe(
    LARGE_DOCUMENT_SERIALIZATION_QUIET_PERIOD_MS,
  );
});
```

- [ ] **Step 2: Run the new test and verify RED**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/lib/editor-large-document.test.ts --pool=forks --poolOptions.forks.singleFork --no-file-parallelism
```

Expected: FAIL because the scheduler exports do not exist.

- [ ] **Step 3: Implement the minimum scheduler**

```ts
export const LARGE_DOCUMENT_SERIALIZATION_QUIET_PERIOD_MS = 800;

export interface EditorIdleSchedulerEnvironment {
  setTimeout: typeof window.setTimeout;
  clearTimeout: typeof window.clearTimeout;
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
}

export function getEditorSerializationQuietPeriod(content: string): number {
  return isLargeEditorDocument(content)
    ? LARGE_DOCUMENT_SERIALIZATION_QUIET_PERIOD_MS
    : 0;
}

export function scheduleEditorIdleTask(
  callback: () => void,
  timeout = 1200,
  quietPeriodMs = 0,
  environment: EditorIdleSchedulerEnvironment = window,
): () => void {
  let delayHandle: number | null = null;
  let idleHandle: number | null = null;
  let canceled = false;

  const run = () => {
    if (canceled) return;
    delayHandle = null;
    idleHandle = null;
    callback();
  };

  const requestIdleWork = () => {
    delayHandle = null;
    if (canceled) return;

    if (typeof environment.requestIdleCallback === "function") {
      idleHandle = environment.requestIdleCallback(run, { timeout });
      return;
    }

    delayHandle = environment.setTimeout(run, timeout);
  };

  // 安静期只负责防抖；到期后再进入浏览器空闲队列，避免抢占连续输入。
  if (quietPeriodMs > 0) {
    delayHandle = environment.setTimeout(requestIdleWork, quietPeriodMs);
  } else {
    requestIdleWork();
  }

  return () => {
    canceled = true;
    if (delayHandle !== null) environment.clearTimeout(delayHandle);
    if (idleHandle !== null) environment.cancelIdleCallback?.(idleHandle);
    delayHandle = null;
    idleHandle = null;
  };
}
```

Retain the existing idle timeout. Without `requestIdleCallback`, keep the current timeout fallback after any configured quiet period.

- [ ] **Step 4: Re-run the Task 1 test and verify GREEN**

Use the Step 2 command. Expected: all tests PASS.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- src/renderer/src/features/editor/lib/editor-large-document.ts src/renderer/src/features/editor/lib/editor-large-document.test.ts
git commit -m "perf: debounce large document serialization"
```

### Task 2: Apply the Quiet Period to Automatic Rich-Text Serialization

**Files:**
- Modify: `src/renderer/src/features/editor/components/blocknote-editor.tsx`
- Modify: `src/renderer/src/features/editor/components/blocknote-editor.test.ts`

**Interfaces:**
- Consumes: the Task 1 scheduler exports.
- Produces: unchanged explicit `serializePendingChange()` behavior and debounced automatic large-document serialization.

- [ ] **Step 1: Write the failing rich-editor test**

Extend the existing BlockNote editor harness with fake timers and a captured `requestIdleCallback`. Load content at `LARGE_DOCUMENT_CHAR_LIMIT`, trigger the existing user-edit callback, and assert it is not submitted before `LARGE_DOCUMENT_SERIALIZATION_QUIET_PERIOD_MS`. Add a separate case that reads the registered runtime from `richDocumentSessionManager`, calls `runtime.serializePendingChange()` before the quiet period, and proves `serializeMarkdown` starts immediately.

```ts
expect(requestIdleCallback).not.toHaveBeenCalled();
act(() => vi.advanceTimersByTime(LARGE_DOCUMENT_SERIALIZATION_QUIET_PERIOD_MS));
expect(requestIdleCallback).toHaveBeenCalled();
await runtime.serializePendingChange();
expect(markdownMocks.serializeMarkdown).toHaveBeenCalled();
```

- [ ] **Step 2: Run the rich-editor test and verify RED**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/components/blocknote-editor.test.ts --pool=forks --poolOptions.forks.singleFork --no-file-parallelism
```

Expected: FAIL because automatic work currently enters the idle queue without a quiet period.

- [ ] **Step 3: Integrate the Task 1 scheduler**

Remove the local scheduler, import the Task 1 helpers, and pass the quiet period in both automatic scheduling locations:

```ts
const quietPeriodMs = getEditorSerializationQuietPeriod(contentRef.current);
serializationCancelRef.current = scheduleEditorIdleTask(
  () => {
    serializationCancelRef.current = null;
    void serializeChangeRef.current();
  },
  idleTimeout,
  quietPeriodMs,
);
```

Keep explicit runtime flushing unchanged so save, close, and rename operations remain immediate.

- [ ] **Step 4: Run scheduler and rich-editor tests**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/lib/editor-large-document.test.ts src/renderer/src/features/editor/components/blocknote-editor.test.ts --pool=forks --poolOptions.forks.singleFork --no-file-parallelism
```

Expected: both files PASS, including overlapping serialization coverage.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- src/renderer/src/features/editor/components/blocknote-editor.tsx src/renderer/src/features/editor/components/blocknote-editor.test.ts
git commit -m "perf: defer large rich editor exports"
```

### Task 3: Make Large-Document File Reuse Non-Blocking

**Files:**
- Modify: `src/renderer/src/hooks/use-electron.ts`
- Create: `src/renderer/src/hooks/use-electron-open-file.test.tsx`

**Interfaces:**
- Consumes: `isLargeEditorDocument`, `richDocumentSessionManager.retainBackground`, `richDocumentSessionManager.serializePendingChange`, and `editorSaveCoordinator.flush`.
- Produces: a caught, path-stable background flush scheduled after target loading settles.

- [ ] **Step 1: Write the failing file-transition tests**

Create a saved rich-text tab at `LARGE_DOCUMENT_CHAR_LIMIT`, register an old-path runtime whose `serializePendingChange` returns a deferred promise, make target `readFile` resolve immediately, and assert `openFile(targetPath)` completes before that promise resolves. Advance the zero-delay task, prove the old-path runtime—not the reused tab registration—was called, and assert the retained-session release callback runs only after old-path serialization and save flushing settle. Add a 9,999-character rich-text case and a large source-mode case that both continue waiting before `readFile`, preserving the current synchronous paths.

```ts
await openPromise;
expect(useEditorStore.getState().panelGroups[0].tabs[0]).toMatchObject({
  filePath: targetPath,
  content: "# Target",
  loadStatus: "ready",
});
act(() => vi.advanceTimersByTime(0));
expect(previousRuntime.serializePendingChange).toHaveBeenCalledOnce();
expect(releaseBackground).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the transition test and verify RED**

```powershell
pnpm.cmd exec vitest run src/renderer/src/hooks/use-electron-open-file.test.tsx --pool=forks --poolOptions.forks.singleFork --no-file-parallelism
```

Expected: FAIL because target loading currently waits for the unresolved old flusher.

- [ ] **Step 3: Implement retained background flushing**

Capture the previous path, content length, mode, and tab identity before the transition. Only tabs satisfying `activeTab.mode === "rich" && isLargeEditorDocument(activeTab.content)` use the background path. Flush through the retained previous path rather than the reused panel/tab flusher, because that registration can point to the target document after React commits the transition:

```ts
const releaseBackground = richDocumentSessionManager.retainBackground(
  previousPath,
  tabId,
);
const flushPreviousInBackground = () => {
  window.setTimeout(() => {
    void (async () => {
      try {
        await richDocumentSessionManager.serializePendingChange(previousPath);
        await editorSaveCoordinator.flush(previousPath);
      } catch {
        // 后台冲刷失败沿用现有保存状态，不能形成未处理的 Promise 拒绝。
      } finally {
        releaseBackground();
      }
    })();
  }, 0);
};
```

Begin and await the existing target `fileOpenController.open`, then invoke `flushPreviousInBackground()` from `finally`. The zero-delay task boundary lets the committed target state render before old-document serialization starts. Keep the existing awaited `flushEditorChange(groupId, tabId)` path unchanged for small rich-text and source-mode tabs.

- [ ] **Step 4: Run transition, session, and save tests**

```powershell
pnpm.cmd exec vitest run src/renderer/src/hooks/use-electron-open-file.test.tsx src/renderer/src/features/editor/lib/rich-document-session-manager.test.ts src/renderer/src/features/editor/lib/editor-save-coordinator.test.ts src/renderer/src/features/editor/lib/editor-file-transition.test.ts --pool=forks --poolOptions.forks.singleFork --no-file-parallelism
```

Expected: all files PASS.

- [ ] **Step 5: Commit Task 3**

```powershell
git add -- src/renderer/src/hooks/use-electron.ts src/renderer/src/hooks/use-electron-open-file.test.tsx
git commit -m "perf: switch away from large documents promptly"
```

### Task 4: Verify the Complete Performance-Only Change

**Files:**
- Verify only; no planned production changes.

**Interfaces:**
- Consumes: all Task 1-3 behavior.
- Produces: repository-level verification evidence.

- [ ] **Step 1: Run the targeted editor suite**

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor src/renderer/src/hooks/use-electron-open-file.test.tsx --pool=forks --poolOptions.forks.singleFork --no-file-parallelism
```

- [ ] **Step 2: Run TypeScript validation**

```powershell
pnpm.cmd typecheck
```

- [ ] **Step 3: Run lint validation**

```powershell
pnpm.cmd lint
```

- [ ] **Step 4: Run the production build**

```powershell
pnpm.cmd build
```

- [ ] **Step 5: Inspect final scope**

```powershell
git diff --check
git status --short
git log -4 --oneline
```

Expected: every command exits with code 0, tests have no unhandled rejections, and the final scope contains only the approved specification, plan, scheduler, editor integration, hook, and tests.

### Task 5: Preserve Close Safety for Deferred Saves

**Files:**
- Create: `src/renderer/src/features/editor/lib/editor-background-save-coordinator.ts`
- Create: `src/renderer/src/features/editor/lib/editor-background-save-coordinator.test.ts`
- Modify: `src/renderer/src/features/editor/lib/editor-save-coordinator.ts`
- Modify: `src/renderer/src/features/editor/lib/editor-runtime.ts`
- Modify: `src/renderer/src/hooks/use-electron.ts`
- Modify: `src/renderer/src/hooks/use-electron.test.tsx`
- Modify: `src/renderer/src/features/editor/components/editor-bridge.tsx`
- Modify: `src/renderer/src/features/editor/components/editor-bridge.test.tsx`
- Modify: `src/main/window.ts`
- Modify: `src/main/window.test.ts`

- [x] **Step 1: Add failing tests for pending close protection, serialization rejection, and disk-write failure snapshots**
- [x] **Step 2: Track a path-level dirty identity before the reused tab transitions**
- [x] **Step 3: Retain failed sessions and retry them from close-save**
- [x] **Step 4: Use a synthetic close-save identity so the target tab cannot be mutated**
- [x] **Step 5: Surface close-save failures and keep the window open**
- [x] **Step 6: Re-run repository verification and external review**
