# Sidebar Divider Drag Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the sidebar/editor divider invisible at rest and show a 3px theme-colored line only during sidebar resizing.

**Architecture:** `HomePageContent` owns a boolean that represents the active sidebar resize interaction. The sidebar `PanelResizeHandle` forwards its public `onDragging` callback to that boolean and conditionally renders its visual divider; the resize target remains wider than the visible 3px feedback.

**Tech Stack:** React 19, TypeScript, react-resizable-panels, Vitest, Testing Library.

## Global Constraints

- Change only the sidebar/editor resize handle; editor split and diff panel handles remain unchanged.
- Default rendering must have no visible border.
- During an active left/right resize drag, render a 3px line using `var(--border-color)`.
- Preserve existing panel size persistence and resize hit area.
- Add Chinese comments only when non-obvious core logic requires one.

---

### Task 1: Sidebar divider drag feedback

**Files:**
- Modify: `src/renderer/src/pages/home/home-page.tsx:55-265`
- Modify: `src/renderer/src/pages/home/home-page.test.tsx:19-26, 129-195`

**Interfaces:**
- Consumes: React pointer event handlers and `PanelResizeHandle` children.
- Produces: `data-testid="sidebar-panel-resize-divider"`, which is absent while idle and present only between pointer down and pointer up/cancel.

- [x] **Step 1: Write the failing test**

Update the `PanelResizeHandle` test mock so it forwards the drag-state callback and children:

```tsx
PanelResizeHandle: ({ children, onDragging, ...props }) => (
  <div
    data-testid="sidebar-panel-resize-handle"
    onPointerDown={() => onDragging?.(true)}
    onPointerUp={() => onDragging?.(false)}
    {...props}
  >
    {children}
  </div>
),
```

Add this test to the `HomePage` suite:

```tsx
it("shows the 3px sidebar divider only while resizing", () => {
  render(<HomePage />);

  const handle = screen.getByTestId("sidebar-panel-resize-handle");
  expect(
    screen.queryByTestId("sidebar-panel-resize-divider"),
  ).not.toBeInTheDocument();

  fireEvent.pointerDown(handle, { pointerId: 1, button: 0 });
  expect(screen.getByTestId("sidebar-panel-resize-divider")).toHaveStyle({
    width: "3px",
    backgroundColor: "var(--border-color)",
  });

  fireEvent.pointerUp(handle, { pointerId: 1 });
  expect(
    screen.queryByTestId("sidebar-panel-resize-divider"),
  ).not.toBeInTheDocument();
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/pages/home/home-page.test.tsx`

Expected: FAIL because the current production component renders a 2px divider.

- [x] **Step 3: Write minimal implementation**

In `HomePageContent`, add an `isSidebarResizing` state value:

```tsx
const [isSidebarResizing, setIsSidebarResizing] = useState(false);
```

Replace the sidebar `PanelResizeHandle` with an `onDragging` callback and a conditional divider:

```tsx
<PanelResizeHandle
  className="group/resize"
  style={{
    width: "1px",
    minWidth: "1px",
    position: "relative",
    cursor: "col-resize",
  }}
  onDragging={setIsSidebarResizing}
>
  {isSidebarResizing ? (
    <div
      data-testid="sidebar-panel-resize-divider"
      className="absolute inset-y-0 left-1/2 -translate-x-1/2"
      style={{ width: "3px", backgroundColor: "var(--border-color)" }}
    />
  ) : null}
</PanelResizeHandle>
```

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm test src/renderer/src/pages/home/home-page.test.tsx`

Expected: PASS, including `shows the 2px sidebar divider only while resizing`.

- [x] **Step 5: Run project verification**

Run: `pnpm typecheck`

Expected: PASS with no TypeScript errors.

Run: `pnpm lint`

Expected: PASS with no lint errors.

Run: `pnpm build`

Expected: PASS; Electron renderer build completes.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/pages/home/home-page.tsx src/renderer/src/pages/home/home-page.test.tsx docs/superpowers/specs/2026-07-14-sidebar-divider-drag-design.md docs/superpowers/plans/2026-07-14-sidebar-divider-drag-feedback.md
git commit -m "fix: show sidebar divider while resizing"
```
