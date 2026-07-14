# Git Operation Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add icons, matching button loaders, and a blocking central overlay to the four Git footer actions.

**Architecture:** `GitPanel` will track one `activeFooterOperation` union value. Pull, push, commit, and commit-and-push set it before their existing asynchronous bridge call and clear it in `finally`; the footer and modal overlay read the same state.

**Tech Stack:** React, TypeScript, lucide-react, Vitest, React Testing Library.

## Global Constraints

- Scope is limited to pull, push, commit, and commit-and-push.
- Keep visible loading copy absent; expose an accessible overlay label only.
- Keep existing `loading` behavior intact.
- Only the active action shows a spinner; all other footer buttons stay disabled through existing `loading` state.

---

## File Structure

- Modify: `src/renderer/src/features/git/components/git-panel.tsx` — operation state, handler lifecycle, footer icons, overlay.
- Modify: `src/renderer/src/features/git/components/git-panel.test.tsx` — deferred-operation regressions.

### Task 1: Add and verify the operation lifecycle state

**Files:**
- Modify: `src/renderer/src/features/git/components/git-panel.tsx:65,175-205,493-529,708-754`
- Test: `src/renderer/src/features/git/components/git-panel.test.tsx:187-248`

**Interfaces:**
- Consumes: `pullFromRemote(dir)`, `pushToRemote(dir)`, and `commitChanges(dir, options)` from `useElectron()`.
- Produces: `GitFooterOperation` and `activeFooterOperation` for Task 2.

- [ ] **Step 1: Write failing deferred-operation tests**

```tsx
it.each([
  ["拉取", "pull", "pullFromRemote"],
  ["推送", "push", "pushToRemote"],
  ["提交", "commit", "commitChanges"],
  ["提交并推送", "commit-and-push", "commitChanges"],
] as const)("keeps %s loading until its Git request settles", async (label, _operation, method) => {
  let resolveOperation: (result: { code: CodeResult }) => void;
  electronMocks[method].mockImplementation(
    () => new Promise((resolve) => { resolveOperation = resolve; }),
  );
  render(<GitPanel isOpen onClose={vi.fn()} />);
  await screen.findByText("changed.md");
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("status", { name: "Git 操作进行中" })).toBeInTheDocument();
  resolveOperation!({ code: CodeResult.Success });
  await waitFor(() => expect(screen.getByRole("button", { name: label })).toHaveAttribute("aria-busy", "false"));
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cmd /c npx vitest run src/renderer/src/features/git/components/git-panel.test.tsx`

Expected: FAIL because no footer button publishes `aria-busy` and no operation overlay exists.

- [ ] **Step 3: Add the state and bind it to handlers**

```tsx
type GitFooterOperation = "pull" | "push" | "commit" | "commit-and-push";

const [activeFooterOperation, setActiveFooterOperation] =
  useState<GitFooterOperation | null>(null);

// In handlePush, before pushToRemote(dir):
setActiveFooterOperation("push");
// In handlePull, before pullFromRemote(dir):
setActiveFooterOperation("pull");
// In handleCommit, before commitChanges(dir, options):
setActiveFooterOperation(pushAfterCommit ? "commit-and-push" : "commit");
// In each existing finally block, before setLoading(false):
setActiveFooterOperation(null);
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cmd /c npx vitest run src/renderer/src/features/git/components/git-panel.test.tsx`

Expected: PASS with the new lifecycle regression and all existing Git panel tests.

- [ ] **Step 5: Commit the lifecycle change**

```powershell
git add -- src/renderer/src/features/git/components/git-panel.tsx src/renderer/src/features/git/components/git-panel.test.tsx
git commit -m "feat: track git footer operations"
```

### Task 2: Add semantic icons and the centered overlay

**Files:**
- Modify: `src/renderer/src/features/git/components/git-panel.tsx:35-52,1523-2043`
- Test: `src/renderer/src/features/git/components/git-panel.test.tsx:187-248`

**Interfaces:**
- Consumes: `activeFooterOperation` from Task 1.
- Produces: icon-bearing footer buttons, `aria-busy` states, and a `role="status"` overlay named `Git 操作进行中`.

- [ ] **Step 1: Extend the failing test with icon assertions**

```tsx
for (const label of ["拉取", "推送", "提交", "提交并推送"]) {
  expect(screen.getByRole("button", { name: label }).querySelector("svg")).toBeInTheDocument();
}
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cmd /c npx vitest run src/renderer/src/features/git/components/git-panel.test.tsx`

Expected: FAIL because commit and commit-and-push currently have no icon element.

- [ ] **Step 3: Render matching icons, spinners, and overlay**

```tsx
import { Download, Upload, Send, Loader2 } from "lucide-react";

{activeFooterOperation ? (
  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20" role="status" aria-label="Git 操作进行中">
    <Loader2 className="h-7 w-7 animate-spin" />
  </div>
) : null}

<Button aria-busy={activeFooterOperation === "pull"} onClick={handlePull} disabled={loading}>
  {activeFooterOperation === "pull" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
  拉取
</Button>
<Button aria-busy={activeFooterOperation === "push"} onClick={handlePush} disabled={loading}>
  {activeFooterOperation === "push" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
  推送
</Button>
<Button aria-busy={activeFooterOperation === "commit"} onClick={() => handleCommit(false)} disabled={!canCommit}>
  {activeFooterOperation === "commit" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCommit className="h-3.5 w-3.5" />}
  提交
</Button>
<Button aria-busy={activeFooterOperation === "commit-and-push"} onClick={() => handleCommit(true)} disabled={!canCommit}>
  {activeFooterOperation === "commit-and-push" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
  提交并推送
</Button>
```

- [ ] **Step 4: Run all required verification**

```powershell
cmd /c npx oxfmt --write src/renderer/src/features/git/components/git-panel.tsx src/renderer/src/features/git/components/git-panel.test.tsx
cmd /c npx vitest run src/renderer/src/features/git/components/git-panel.test.tsx
cmd /c npx tsc --noEmit
cmd /c npx oxlint
cmd /c npx electron-vite build
```

Expected: tests, typecheck, and build exit 0; Oxlint may retain existing warnings but reports no errors.

- [ ] **Step 5: Commit the UI change**

```powershell
git add -- src/renderer/src/features/git/components/git-panel.tsx src/renderer/src/features/git/components/git-panel.test.tsx
git commit -m "feat: show git footer operation loading"
```
