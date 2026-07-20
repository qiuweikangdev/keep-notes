# Find Widget Opacity Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the find-and-replace widget fully opaque in translucent main windows while preserving correct placement and behavior in tabbed editor panels and quick-editor windows.

**Architecture:** `FindWidget` will retain its current inline absolute-positioned mode for the quick editor and gain an optional anchored portal mode for tabbed editor panels. The portal mode renders into `document.body`, outside the main application's opacity stacking context, and derives fixed viewport coordinates from the editor workspace anchor.

**Tech Stack:** Electron, React 19, React DOM portals, TypeScript, Tailwind CSS 3, Vitest, Testing Library.

## Global Constraints

- Do not change the application root opacity behavior or the appearance setting.
- Preserve search matching, replacement, undo, keyboard shortcuts, focus, highlighting, and pointer-event behavior.
- Preserve the quick-editor window's inline widget layout.
- Support main-window resizing and split-panel resizing while the widget is open.
- Use Chinese comments for new core-logic comments.
- Do not install dependencies or modify `pnpm-lock.yaml`.
- Verify with `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

---

### Task 1: Add failing opacity and integration regressions

**Files:**

- Modify: `src/renderer/src/features/editor/components/find-widget.test.tsx`
- Modify: `src/renderer/src/features/editor/components/editor-workspace.test.tsx`

**Interfaces:**

- Consumes: the existing `FindWidget` props and `EditorWorkspace` find-controller integration.
- Produces: regression coverage for `portalAnchor?: HTMLElement | null`, body-level rendering, anchor-relative placement, and tab-panel wiring.

- [ ] **Step 1: Add the failing anchored-portal component test**

Extend `find-widget.test.tsx` with cleanup imports and a test that renders under a translucent ancestor:

```tsx
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("portals an anchored widget outside a translucent ancestor", () => {
  const translucentRoot = document.createElement("div");
  translucentRoot.style.opacity = "0.6";
  const anchor = document.createElement("div");
  translucentRoot.append(anchor);
  document.body.append(translucentRoot);
  let resizeCallback: ResizeObserverCallback | null = null;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(1200);
  const bounds = vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({
    x: 200,
    y: 100,
    top: 100,
    right: 1100,
    bottom: 700,
    left: 200,
    width: 900,
    height: 600,
    toJSON: () => ({}),
  });

  render(
    <FindWidget
      isOpen
      isReplaceOpen={false}
      query="note"
      replacement=""
      activeIndex={0}
      matchCount={1}
      options={{}}
      portalAnchor={anchor}
      onQueryChange={vi.fn()}
      onReplacementChange={vi.fn()}
      onStep={vi.fn()}
      onClose={vi.fn()}
      onToggleReplace={vi.fn()}
      onOptionsChange={vi.fn()}
      onReplaceCurrent={vi.fn()}
      onReplaceAll={vi.fn()}
      onSelectAllMatches={vi.fn()}
      onUndoReplace={vi.fn()}
    />,
    { container: anchor },
  );

  const widget = screen.getByRole("search", {
    name: "文件内搜索与替换",
  });
  expect(translucentRoot).not.toContainElement(widget);
  expect(widget).toHaveClass("fixed");
  expect(widget).toHaveStyle({
    top: "108px",
    right: "108px",
    maxWidth: "884px",
  });

  bounds.mockReturnValue({
    x: 400,
    y: 120,
    top: 120,
    right: 1150,
    bottom: 700,
    left: 400,
    width: 750,
    height: 580,
    toJSON: () => ({}),
  });
  act(() => {
    resizeCallback?.([], {} as ResizeObserver);
  });
  expect(widget).toHaveStyle({
    top: "128px",
    right: "58px",
    maxWidth: "734px",
  });
});
```

- [ ] **Step 2: Add the failing `EditorWorkspace` integration assertion**

Change the existing controller test so it retains the Testing Library container and verifies that the opened widget is outside it:

```tsx
it("opens the find widget outside the translucent editor tree", () => {
  const { container } = render(
    <EditorWorkspace groupId="group-1" tabId="tab-1" />,
  );

  act(() => {
    editorFindController.open("group-1", "tab-1");
  });

  const widget = screen.getByRole("search", {
    name: "文件内搜索与替换",
  });
  expect(widget).toBeInTheDocument();
  expect(container).not.toContainElement(widget);
});
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
pnpm test src/renderer/src/features/editor/components/find-widget.test.tsx src/renderer/src/features/editor/components/editor-workspace.test.tsx
```

Expected: FAIL because `FindWidget` has no `portalAnchor` prop and `EditorWorkspace` still renders the widget beneath its own root.

### Task 2: Implement optional anchored portal rendering

**Files:**

- Modify: `src/renderer/src/features/editor/components/find-widget.tsx`
- Modify: `src/renderer/src/features/editor/components/editor-workspace.tsx`
- Test: `src/renderer/src/features/editor/components/find-widget.test.tsx`
- Test: `src/renderer/src/features/editor/components/editor-workspace.test.tsx`

**Interfaces:**

- Consumes: `portalAnchor?: HTMLElement | null`, `HTMLElement.getBoundingClientRect()`, `ResizeObserver`, and the browser `resize` event.
- Produces: a body-level fixed widget at `{ top, right, maxWidth }` for tab panels; the existing inline absolute widget when `portalAnchor` is absent.

- [ ] **Step 1: Add the positioning API and observer**

Update the React and React DOM imports, add the prop, and calculate anchored coordinates while open:

```tsx
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface FindWidgetProps {
  portalAnchor?: HTMLElement | null;
}

interface FindWidgetPosition {
  top: number;
  right: number;
  maxWidth: number;
}

function getFindWidgetPosition(anchor: HTMLElement): FindWidgetPosition {
  const bounds = anchor.getBoundingClientRect();
  return {
    top: bounds.top + 8,
    right: Math.max(8, window.innerWidth - bounds.right + 8),
    maxWidth: Math.max(0, bounds.width - 16),
  };
}
```

Inside `FindWidget`, destructure `portalAnchor` and add:

```tsx
const [portalPosition, setPortalPosition] =
  useState<FindWidgetPosition | null>(null);

useLayoutEffect(() => {
  if (!isOpen || !portalAnchor) return;

  const updatePosition = () => {
    setPortalPosition(getFindWidgetPosition(portalAnchor));
  };
  updatePosition();
  window.addEventListener("resize", updatePosition);

  if (typeof ResizeObserver === "undefined") {
    return () => window.removeEventListener("resize", updatePosition);
  }

  const resizeObserver = new ResizeObserver(updatePosition);
  resizeObserver.observe(portalAnchor);
  return () => {
    resizeObserver.disconnect();
    window.removeEventListener("resize", updatePosition);
  };
}, [isOpen, portalAnchor]);
```

- [ ] **Step 2: Render the anchored variant outside the opacity tree**

Rename the current returned JSX to `widget`, change its outer search element, and return the inline or portaled variant with this exact diff:

```diff
-return (
+const portalStyle: CSSProperties | undefined = portalAnchor
+  ? portalPosition
+    ? {
+        top: portalPosition.top,
+        right: portalPosition.right,
+        maxWidth: portalPosition.maxWidth,
+      }
+    : { visibility: "hidden" }
+  : undefined;
+
+const widget = (
   <Tooltip.Provider delayDuration={200}>
     <div
       data-editor-find-ignore
       role="search"
       aria-label="文件内搜索与替换"
-      className="absolute right-2 top-2 z-50 flex w-[492px] max-w-[calc(100%-16px)] overflow-visible rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-xl"
+      className={`${portalAnchor ? "fixed" : "absolute right-2 top-2"} z-50 flex w-[492px] max-w-[calc(100%-16px)] overflow-visible rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] shadow-xl`}
+      style={portalStyle}
       onKeyDown={handleWidgetKeyDown}
       onPointerDown={(event) => event.stopPropagation()}
@@
   </Tooltip.Provider>
 );
+
+return portalAnchor ? createPortal(widget, document.body) : widget;
```

The `@@` marker is the unchanged control subtree already present between the outer search element tags; no control or handler changes in this step.

- [ ] **Step 3: Wire the tabbed editor to the anchored mode**

Pass the already-mounted workspace root by adding one prop immediately after `options={findOptions}`:

```diff
       options={findOptions}
+      portalAnchor={editorRootRef.current}
       onQueryChange={setFindQuery}
```

Do not pass `portalAnchor` from `QuickEditorWindow`; its existing inline absolute mode remains active.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
pnpm test src/renderer/src/features/editor/components/find-widget.test.tsx src/renderer/src/features/editor/components/editor-workspace.test.tsx src/renderer/src/features/editor/components/quick-editor-window.test.ts src/renderer/src/features/editor/components/quick-editor-window-css.test.ts
```

Expected: PASS, covering opacity isolation, tab-panel integration, quick-editor search interaction, and quick-editor overlay layout.

- [ ] **Step 5: Format the changed files**

Run:

```bash
pnpm exec oxfmt --write src/renderer/src/features/editor/components/find-widget.tsx src/renderer/src/features/editor/components/find-widget.test.tsx src/renderer/src/features/editor/components/editor-workspace.tsx src/renderer/src/features/editor/components/editor-workspace.test.tsx
```

Expected: exit code 0 with only the four task files formatted.

- [ ] **Step 6: Commit the focused implementation**

```bash
git add docs/superpowers/plans/2026-07-20-find-widget-opacity.md src/renderer/src/features/editor/components/find-widget.tsx src/renderer/src/features/editor/components/find-widget.test.tsx src/renderer/src/features/editor/components/editor-workspace.tsx src/renderer/src/features/editor/components/editor-workspace.test.tsx
git commit -m "fix: isolate find widget from window opacity"
```

### Task 3: Run repository verification

**Files:**

- No source changes expected.

**Interfaces:**

- Consumes: the completed portal regression tests and implementation.
- Produces: verified TypeScript, lint, test, and production build status.

- [ ] **Step 1: Run the complete test suite**

Run: `pnpm test`

Expected: all Vitest files pass.

- [ ] **Step 2: Run TypeScript validation**

Run: `pnpm typecheck`

Expected: exit code 0.

- [ ] **Step 3: Run lint validation**

Run: `pnpm lint`

Expected: exit code 0 with no warnings or errors introduced by this change.

- [ ] **Step 4: Run the production build**

Run: `pnpm build`

Expected: exit code 0 and successful Electron Vite output for the main, preload, and renderer bundles.

- [ ] **Step 5: Review the final diff**

Run:

```bash
git status --short
git diff HEAD^ --check
git diff HEAD^ --stat
```

Expected: no whitespace errors; only the approved plan, component, workspace wiring, and focused tests are present.
