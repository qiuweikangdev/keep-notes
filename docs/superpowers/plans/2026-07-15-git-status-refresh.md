# Git Status Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep existing Git change rows visible while status is refreshed after discarding changes.

**Architecture:** `GitPanel` keeps `gitStatus` as the last successful status snapshot. The changes content chooses the existing full loader only when no snapshot exists; otherwise it retains the list and layers an interaction-blocking refresh indicator above it. The existing `loadGitInfo` request flow remains unchanged.

**Tech Stack:** React 19, TypeScript, Tailwind utility classes, Vitest, Testing Library.

## Global Constraints

- Modify only the Git panel component and its colocated component test.
- Keep the initial Git panel loading behavior unchanged.
- Do not add dependencies or change Git IPC APIs.
- Use Chinese comments only when new core method logic requires a comment.

---

### Task 1: Preserve the changes list during status refresh

**Files:**
- Modify: `src/renderer/src/features/git/components/git-panel.tsx:1984-2021`
- Test: `src/renderer/src/features/git/components/git-panel.test.tsx`

**Interfaces:**
- Consumes: `gitStatus: GitStatus | null`, `isGitInfoLoading: boolean`, `allFiles`.
- Produces: A full loader only during the initial status fetch; a visible status list with an overlay during a refresh.

- [ ] **Step 1: Write the failing test**

Add this test next to the opening loading-state test:

```tsx
it("keeps the changes list visible while refreshing Git status", async () => {
  render(<GitPanel isOpen onClose={vi.fn()} />);

  await screen.findByText("changed.md");

  let resolveStatus: (value: unknown) => void;
  electronMocks.getGitStatus.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveStatus = resolve;
      }),
  );

  fireEvent.click(screen.getAllByLabelText("放弃更改")[0]);
  fireEvent.click(await screen.findByRole("button", { name: "确认" }));

  expect(screen.getByText("changed.md")).toBeInTheDocument();
  expect(
    screen.getByRole("status", { name: "正在刷新文件状态" }),
  ).toBeInTheDocument();

  resolveStatus!({
    code: CodeResult.Success,
    data: {
      current: "main",
      tracking: "origin/main",
      files: [],
      ahead: 0,
      behind: 0,
      created: [],
      not_added: [],
      modified: [],
      deleted: [],
      renamed: [],
      staged: [],
      conflicted: [],
    },
  });

  expect(await screen.findByText("无更改")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/renderer/src/features/git/components/git-panel.test.tsx`

Expected: FAIL because `changed.md` disappears while the pending refresh replaces the list with the generic loader, and the named refresh status does not exist.

- [ ] **Step 3: Write the minimal implementation**

In `GitPanel`, derive initial loading from the existing status snapshot and replace the changes-tab rendering with the following structure:

```tsx
const isInitialGitInfoLoading = isGitInfoLoading && gitStatus === null;
const isRefreshingGitStatus = isGitInfoLoading && gitStatus !== null;
```

```tsx
{activeTab === "changes" && isInitialGitInfoLoading ? (
  <div
    className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 py-6"
    role="status"
    aria-label="加载中"
    style={{ color: "var(--text-muted)" }}
  >
    <Loader2 className="h-5 w-5 animate-spin" />
  </div>
) : null}

{activeTab === "changes" && !isInitialGitInfoLoading && allFiles.length > 0 ? (
  <div
    className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
    style={{ backgroundColor: "var(--bg-primary)" }}
  >
    {renderFileSection("已暂存的更改", stagedFilePaths, "staged")}
    {renderFileSection("更改", unstagedFilePaths, "unstaged")}
    {isRefreshingGitStatus ? (
      <div
        className="absolute inset-0 z-10 flex items-center justify-center bg-black/10"
        role="status"
        aria-label="正在刷新文件状态"
      >
        <Loader2
          className="h-5 w-5 animate-spin"
          style={{ color: "var(--accent-color)" }}
        />
      </div>
    ) : null}
  </div>
) : null}
```

Keep the existing empty-state conditional, changing its guard from `!isGitInfoLoading` to `!isInitialGitInfoLoading` so that the state is still shown after a successful refresh that returns no files.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm test src/renderer/src/features/git/components/git-panel.test.tsx`

Expected: PASS, including the new refresh regression test.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/renderer/src/features/git/components/git-panel.tsx src/renderer/src/features/git/components/git-panel.test.tsx
git commit -m "fix: retain git changes during refresh"
```

### Task 2: Verify the repository checks

**Files:**
- Verify: `src/renderer/src/features/git/components/git-panel.tsx`
- Verify: `src/renderer/src/features/git/components/git-panel.test.tsx`

**Interfaces:**
- Consumes: The completed changes-tab loading behavior from Task 1.
- Produces: Type, lint, test, and production-build evidence for the change.

- [ ] **Step 1: Run type checking**

Run: `pnpm typecheck`

Expected: PASS with exit code 0.

- [ ] **Step 2: Run linting**

Run: `pnpm lint`

Expected: PASS with exit code 0.

- [ ] **Step 3: Run the production build**

Run: `pnpm build`

Expected: PASS with exit code 0.
