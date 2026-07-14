# File Tree Hover Scrollbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide the file tree scrollbar until the pointer hovers over the file
tree scroll container.

**Architecture:** Mark the existing virtualized file tree scroll container
with a semantic class. Add scoped WebKit scrollbar rules in the global
stylesheet so only that container collapses its scrollbar in the idle state
and restores the project-standard 8px scrollbar while hovered.

**Tech Stack:** React 19, TypeScript, Tailwind CSS utility classes, global CSS,
Vitest, Testing Library.

## Global Constraints

- Change only the file tree scrollbar behavior; retain existing virtualized
  scrolling and global scrollbar styles for all other UI regions.
- Display the scrollbar only while the pointer hovers over the file tree; do
  not reveal it merely on keyboard focus.
- Use 2-space indentation and Chinese comments only when core method logic
  requires an explanatory comment.
- Do not install dependencies or modify `pnpm-lock.yaml`.

---

### Task 1: Scope the file tree hover scrollbar

**Files:**

- Modify: `src/renderer/src/features/file-tree/components/file-tree.tsx:1162-1170`
- Modify: `src/renderer/src/styles/globals.css:541-545`
- Test: `src/renderer/src/features/file-tree/components/file-tree.test.tsx`

**Interfaces:**

- Consumes: the existing `parentRef` virtualizer scroll container.
- Produces: the `file-tree-scroll-container` CSS hook and hover-only scrollbar
  behavior for the virtualized file tree.

- [ ] **Step 1: Write the failing test**

  Add this test after the existing `beforeEach` block in
  `src/renderer/src/features/file-tree/components/file-tree.test.tsx`:

  ```tsx
  it("marks the virtualized file tree scroll container for hover scrollbar styling", () => {
    const { container } = render(<FileTree />);

    expect(
      container.querySelector(".file-tree-scroll-container"),
    ).toBeInTheDocument();
  });
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run:

  ```powershell
  pnpm test -- src/renderer/src/features/file-tree/components/file-tree.test.tsx
  ```

  Expected: FAIL because no element has the
  `file-tree-scroll-container` class.

- [ ] **Step 3: Add the minimal implementation**

  Update the virtualized scroll container in
  `src/renderer/src/features/file-tree/components/file-tree.tsx`:

  ```tsx
  <div
    ref={parentRef}
    className="file-tree-scroll-container min-h-0 flex-1 overflow-auto"
    style={{
      contain: "layout paint style",
      overflowAnchor: "none",
    }}
  >
  ```

  Add these scoped rules immediately before the existing global
  `::-webkit-scrollbar` rule in `src/renderer/src/styles/globals.css`:

  ```css
  .file-tree-scroll-container::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .file-tree-scroll-container:hover::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  ```

- [ ] **Step 4: Run the focused test to verify it passes**

  Run:

  ```powershell
  pnpm test -- src/renderer/src/features/file-tree/components/file-tree.test.tsx
  ```

  Expected: PASS, including the new CSS-hook assertion and all pre-existing
  file tree tests.

- [ ] **Step 5: Format and run required verification**

  Run:

  ```powershell
  pnpm format
  pnpm typecheck
  pnpm lint
  pnpm build
  ```

  Expected: every command exits with code 0. Confirm that formatting has not
  modified unrelated user changes before staging.

- [ ] **Step 6: Commit the focused change**

  Run:

  ```powershell
  git add -- src/renderer/src/features/file-tree/components/file-tree.tsx src/renderer/src/features/file-tree/components/file-tree.test.tsx src/renderer/src/styles/globals.css
  git commit -m "fix: show file tree scrollbar on hover"
  ```

  Expected: a Conventional Commit containing only the file tree hover
  scrollbar implementation and its test.
