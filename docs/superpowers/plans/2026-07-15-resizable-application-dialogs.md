# Resizable Application Dialogs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Settings, Git, and diff dialogs one viewport-safe drag and resize model while keeping Settings usable in small Electron windows.

**Architecture:** Extend `useResizableDialog` into a shared geometry controller for drag sessions, eight resize directions, viewport clamping, opening resets, and window-resize correction. Render resize hit areas through a focused UI component, move `DragResizeProvider` to the application shell, and connect each large dialog without changing business state or IPC behavior.

**Tech Stack:** React 19, TypeScript 5.9, Radix Dialog, Tailwind CSS 3, Vitest 3, Testing Library, Electron Vite.

## Global Constraints

- Reuse the existing `pnpm` installation; do not install dependencies or modify `pnpm-lock.yaml`.
- Preserve the existing uncommitted editor and quote-list work; stage only files listed by each task.
- Use TypeScript and kebab-case filenames.
- Write Chinese comments for new core method logic.
- Keep a preferred 16 px viewport margin.
- Restore default centered geometry every time a large dialog opens.
- Do not persist geometry between openings or application sessions.
- Do not change Settings, Git, or diff business behavior or Git IPC APIs.
- Do not add resize behavior to small confirmation and reminder dialogs.

---

## File Structure

- `src/renderer/src/hooks/use-resizable-dialog.ts`: shared pointer sessions, geometry calculations, viewport correction, and reset lifecycle.
- `src/renderer/src/hooks/use-resizable-dialog.test.tsx`: pointer-event regression tests for the shared hook.
- `src/renderer/src/components/ui/dialog-resize-handles.tsx`: presentational edge and corner hit areas.
- `src/renderer/src/app/App.tsx`: application-level `DragResizeProvider` ownership.
- `src/renderer/src/app/App.test.tsx`: proves application dialogs can consume the provider.
- `src/renderer/src/pages/home/home-page.tsx`: diff dialog migration to shared geometry.
- `src/renderer/src/pages/home/home-page.test.tsx`: diff integration coverage.
- `src/renderer/src/features/settings/components/settings-modal.tsx`: responsive Settings layout and shared geometry integration.
- `src/renderer/src/features/settings/components/settings-modal.test.tsx`: Settings size, scroll, controls, and reopen coverage.
- `src/renderer/src/features/git/components/git-panel.tsx`: main Git geometry and compact-state viewport caps.
- `src/renderer/src/features/git/components/git-panel.test.tsx`: Git geometry, compact-state, and reopen coverage.

---

### Task 1: Build the shared dialog geometry controller

**Files:**
- Modify: `src/renderer/src/hooks/use-resizable-dialog.ts:1-207`
- Create: `src/renderer/src/hooks/use-resizable-dialog.test.tsx`
- Create: `src/renderer/src/components/ui/dialog-resize-handles.tsx`

**Interfaces:**
- Consumes: `useDragResize()` with `startDrag`, `endDrag`, `startResize`, and `endResize`.
- Produces: `useResizableDialog(options: ResizableDialogOptions): ResizableDialogResult`.
- Produces: `DialogResizeHandles({ resizeHandleProps }: DialogResizeHandlesProps)`.

- [ ] **Step 1: Write failing shared-behavior tests**

Create `src/renderer/src/hooks/use-resizable-dialog.test.tsx` with this harness and four tests:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DragResizeProvider } from "@/components/drag-resize-provider";
import { DialogResizeHandles } from "@/components/ui/dialog-resize-handles";
import { useResizableDialog } from "./use-resizable-dialog";

function Harness({
  isOpen = true,
  minWidth = 100,
  minHeight = 80,
}: {
  isOpen?: boolean;
  minWidth?: number;
  minHeight?: number;
}) {
  const { contentRef, dragHandleProps, resizeHandleProps } =
    useResizableDialog({ isOpen, minWidth, minHeight });
  return (
    <div ref={contentRef} data-testid="dialog">
      <div data-testid="drag-handle" {...dragHandleProps} />
      <DialogResizeHandles resizeHandleProps={resizeHandleProps} />
    </div>
  );
}

function renderHarness(isOpen = true, minWidth = 100, minHeight = 80) {
  return render(
    <DragResizeProvider debounceMs={0}>
      <Harness isOpen={isOpen} minWidth={minWidth} minHeight={minHeight} />
    </DragResizeProvider>,
  );
}

function mockRect(
  element: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => undefined,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
});

describe("useResizableDialog", () => {
  it("activates header dragging after the threshold", () => {
    renderHarness();
    const dialog = screen.getByTestId("dialog");
    const handle = screen.getByTestId("drag-handle");
    mockRect(dialog, { left: 100, top: 100, width: 400, height: 300 });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 110, clientY: 110 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 114, clientY: 114 });
    expect(dialog.style.left).toBe("");
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 120, clientY: 120 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 140, clientY: 150 });
    expect(dialog.style.left).toBe("120px");
    expect(dialog.style.top).toBe("130px");
  });

  it("caps the configured minimum size to a small viewport", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 320 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 240 });
    renderHarness(true, 480, 280);
    const dialog = screen.getByTestId("dialog");
    mockRect(dialog, { left: 16, top: 16, width: 288, height: 208 });
    const east = document.querySelector<HTMLElement>('[data-dialog-resize-handle="e"]')!;
    fireEvent.pointerDown(east, { button: 0, pointerId: 2, clientX: 304, clientY: 100 });
    fireEvent.pointerMove(east, { pointerId: 2, clientX: 100, clientY: 100 });
    expect(dialog.style.width).toBe("288px");
    expect(dialog.style.height).toBe("208px");
  });

  it.each([
    ["n", { width: "300px", height: "170px", left: "200px", top: "180px" }],
    ["s", { width: "300px", height: "230px", left: "200px", top: "150px" }],
    ["e", { width: "340px", height: "200px", left: "200px", top: "150px" }],
    ["w", { width: "260px", height: "200px", left: "240px", top: "150px" }],
    ["ne", { width: "340px", height: "170px", left: "200px", top: "180px" }],
    ["nw", { width: "260px", height: "170px", left: "240px", top: "180px" }],
    ["se", { width: "340px", height: "230px", left: "200px", top: "150px" }],
    ["sw", { width: "260px", height: "230px", left: "240px", top: "150px" }],
  ] as const)("resizes from the %s handle", (direction, expected) => {
    renderHarness();
    const dialog = screen.getByTestId("dialog");
    mockRect(dialog, { left: 200, top: 150, width: 300, height: 200 });
    const handle = document.querySelector<HTMLElement>(
      `[data-dialog-resize-handle="${direction}"]`,
    )!;
    fireEvent.pointerDown(handle, { button: 0, pointerId: 3, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(handle, { pointerId: 3, clientX: 40, clientY: 30 });
    expect(dialog.style.width).toBe(expected.width);
    expect(dialog.style.height).toBe(expected.height);
    expect(dialog.style.left).toBe(expected.left);
    expect(dialog.style.top).toBe(expected.top);
  });

  it("re-clamps geometry after the viewport shrinks", () => {
    renderHarness();
    const dialog = screen.getByTestId("dialog");
    mockRect(dialog, { left: 100, top: 100, width: 700, height: 500 });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 600 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 400 });
    fireEvent(window, new Event("resize"));
    expect(dialog.style.width).toBe("568px");
    expect(dialog.style.height).toBe("368px");
    expect(dialog.style.left).toBe("16px");
    expect(dialog.style.top).toBe("16px");
  });

  it("clears inline geometry every time the dialog opens", () => {
    const { rerender } = renderHarness();
    const dialog = screen.getByTestId("dialog");
    dialog.style.width = "520px";
    dialog.style.left = "40px";
    rerender(<DragResizeProvider debounceMs={0}><Harness isOpen={false} /></DragResizeProvider>);
    rerender(<DragResizeProvider debounceMs={0}><Harness isOpen /></DragResizeProvider>);
    expect(screen.getByTestId("dialog").style.width).toBe("");
    expect(screen.getByTestId("dialog").style.left).toBe("");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test src/renderer/src/hooks/use-resizable-dialog.test.tsx`

Expected: FAIL because the handle component and option-based drag API do not exist.

- [ ] **Step 3: Implement the shared handle component**

Create `src/renderer/src/components/ui/dialog-resize-handles.tsx`:

```tsx
import type { ResizableDialogResult, ResizeDirection } from "@/hooks/use-resizable-dialog";

interface DialogResizeHandlesProps {
  resizeHandleProps: ResizableDialogResult["resizeHandleProps"];
}

const HANDLE_CLASSES: Record<ResizeDirection, string> = {
  n: "left-0 top-0 h-3 w-full cursor-n-resize",
  s: "bottom-0 left-0 h-3 w-full cursor-s-resize",
  e: "right-0 top-0 h-full w-3 cursor-e-resize",
  w: "left-0 top-0 h-full w-3 cursor-w-resize",
  ne: "right-0 top-0 h-3 w-3 cursor-ne-resize",
  nw: "left-0 top-0 h-3 w-3 cursor-nw-resize",
  se: "bottom-0 right-0 h-3 w-3 cursor-se-resize",
  sw: "bottom-0 left-0 h-3 w-3 cursor-sw-resize",
};

const DIRECTIONS = Object.keys(HANDLE_CLASSES) as ResizeDirection[];

export function DialogResizeHandles({ resizeHandleProps }: DialogResizeHandlesProps) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-30">
      {DIRECTIONS.map((direction) => (
        <div
          key={direction}
          data-dialog-resize-handle={direction}
          className={`pointer-events-auto absolute ${HANDLE_CLASSES[direction]}`}
          {...resizeHandleProps[direction]}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implement the option-based geometry hook**

Replace the hook's public interface with:

```tsx
export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export interface ResizableDialogOptions {
  isOpen: boolean;
  minWidth?: number;
  minHeight?: number;
  viewportMargin?: number;
  dragActivationDistance?: number;
}

type PointerHandlers = {
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onPointerCancel: PointerEventHandler<HTMLElement>;
};

export interface ResizableDialogResult {
  contentRef: RefObject<HTMLDivElement | null>;
  dragHandleProps: PointerHandlers;
  resizeHandleProps: Record<ResizeDirection, PointerHandlers>;
  resetGeometry: () => void;
}
```

Define `useResizableDialog` with destructured defaults of `480` for `minWidth`, `280` for `minHeight`, `16` for `viewportMargin`, and `8` for `dragActivationDistance`, returning `ResizableDialogResult`.

Use these viewport rules:

```tsx
function getViewportBounds(margin: number) {
  const horizontalMargin = window.innerWidth > margin * 2 ? margin : 0;
  const verticalMargin = window.innerHeight > margin * 2 ? margin : 0;
  return {
    left: horizontalMargin,
    top: verticalMargin,
    right: window.innerWidth - horizontalMargin,
    bottom: window.innerHeight - verticalMargin,
    width: Math.max(1, window.innerWidth - horizontalMargin * 2),
    height: Math.max(1, window.innerHeight - verticalMargin * 2),
  };
}

function constrainGeometry(
  geometry: ResizeGeometry,
  minWidth: number,
  minHeight: number,
  margin: number,
): ResizeGeometry {
  const bounds = getViewportBounds(margin);
  const width = clamp(geometry.width, Math.min(minWidth, bounds.width), bounds.width);
  const height = clamp(geometry.height, Math.min(minHeight, bounds.height), bounds.height);
  return {
    width,
    height,
    left: clamp(geometry.left, bounds.left, bounds.right - width),
    top: clamp(geometry.top, bounds.top, bounds.bottom - height),
  };
}
```

Implement drag pointer capture with the existing 8 px activation threshold. Read the dialog rect once when activation occurs, set `transition: none`, convert centered positioning to explicit `left` and `top`, and clamp every move. Implement west/east and north/south resizing against fixed opposite edges, then pass the result through `constrainGeometry`. Ignore non-primary buttons and unmatched pointer IDs; release capture on pointer up and clear sessions on cancellation.

Implement `resetGeometry` with `useCallback`: clear both active session refs, call `endDrag()` or `endResize()` only when that interaction was active, and remove `width`, `height`, `left`, `top`, `transform`, and `transition` from `contentRef.current`. Add an unmount cleanup effect that ends any active provider state.

Reset and viewport lifecycle must be:

```tsx
useLayoutEffect(() => {
  if (isOpen) resetGeometry();
}, [isOpen, resetGeometry]);

useEffect(() => {
  if (!isOpen) return;
  const handleViewportResize = () => {
    const target = contentRef.current;
    if (!target) return;
    applyGeometry(
      target,
      constrainGeometry(captureGeometry(target), minWidth, minHeight, viewportMargin),
    );
  };
  window.addEventListener("resize", handleViewportResize);
  return () => window.removeEventListener("resize", handleViewportResize);
}, [isOpen, minHeight, minWidth, viewportMargin]);
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `pnpm test src/renderer/src/hooks/use-resizable-dialog.test.tsx`

Expected: PASS with four shared geometry tests.

- [ ] **Step 6: Commit the shared behavior**

```bash
git add src/renderer/src/hooks/use-resizable-dialog.ts src/renderer/src/hooks/use-resizable-dialog.test.tsx src/renderer/src/components/ui/dialog-resize-handles.tsx
git commit -m "feat: share dialog drag and resize behavior"
```

---

### Task 2: Move provider ownership and migrate the diff dialog

**Files:**
- Modify: `src/renderer/src/app/App.tsx:1-151`
- Modify: `src/renderer/src/app/App.test.tsx:1-382`
- Modify: `src/renderer/src/pages/home/home-page.tsx:1-628`
- Modify: `src/renderer/src/pages/home/home-page.test.tsx:1-342`

**Interfaces:**
- Consumes: `DragResizeProvider`, `useResizableDialog({ isOpen })`, and `DialogResizeHandles` from Task 1.
- Produces: one application-level provider and shared diff drag props.

- [ ] **Step 1: Write failing provider and diff integration tests**

Change the Settings mock in `App.test.tsx` so it consumes the real context:

```tsx
vi.mock("@/features/settings", async () => {
  const { useDragResize } =
    await vi.importActual<typeof import("@/components/drag-resize-provider")>(
      "@/components/drag-resize-provider",
    );
  return {
    SettingsModal: () => {
      const { isIdle } = useDragResize();
      return <output data-testid="dialog-provider-state">{String(isIdle)}</output>;
    },
  };
});

it("provides drag and resize state to application-level dialogs", () => {
  render(<App />);
  expect(screen.getByTestId("dialog-provider-state")).toHaveTextContent("true");
});
```

In `home-page.test.tsx`, alias Testing Library's `render` to `baseRender`, wrap it with `DragResizeProvider`, and add:

```tsx
const render = (
  ui: Parameters<typeof baseRender>[0],
  options?: Parameters<typeof baseRender>[1],
) =>
  baseRender(ui, {
    ...options,
    wrapper: ({ children }) => (
      <DragResizeProvider debounceMs={0}>{children}</DragResizeProvider>
    ),
  });
```

```tsx
it("uses the shared drag and resize surface for the diff popup", () => {
  render(<HomePage />);
  expect(document.querySelectorAll("[data-dialog-resize-handle]")).toHaveLength(8);
  expect(document.querySelector("[data-dialog-drag-handle]")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm test src/renderer/src/app/App.test.tsx src/renderer/src/pages/home/home-page.test.tsx`

Expected: FAIL because Settings is outside the current provider and diff lacks the shared drag marker.

- [ ] **Step 3: Lift the provider into `App`**

Import `DragResizeProvider`, then wrap the existing application `<div style={windowStyle}>` with it inside `Tooltip.Provider`. Remove the provider wrapper from `HomePage`, leaving:

```tsx
export function HomePage() {
  return <HomePageContent />;
}
```

- [ ] **Step 4: Migrate diff geometry markup**

Replace the current hook call and opening reset effect with:

```tsx
const { contentRef, dragHandleProps, resizeHandleProps } =
  useResizableDialog({ isOpen });
```

Pass `dragHandleProps` into `DiffDialog`, spread it on the title bar, add `data-dialog-drag-handle`, retain pointer propagation blocking on title-bar buttons, delete the local drag session and repeated eight-handle markup, and render:

```tsx
<DialogResizeHandles resizeHandleProps={resizeHandleProps} />
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `pnpm test src/renderer/src/app/App.test.tsx src/renderer/src/pages/home/home-page.test.tsx src/renderer/src/hooks/use-resizable-dialog.test.tsx`

Expected: PASS; the provider probe succeeds and diff exposes one drag marker and eight handles.

- [ ] **Step 6: Commit provider and diff migration**

```bash
git add src/renderer/src/app/App.tsx src/renderer/src/app/App.test.tsx src/renderer/src/pages/home/home-page.tsx src/renderer/src/pages/home/home-page.test.tsx
git commit -m "refactor: unify diff dialog geometry"
```

---

### Task 3: Make Settings responsive, draggable, and resizable

**Files:**
- Modify: `src/renderer/src/features/settings/components/settings-modal.tsx:1-833`
- Modify: `src/renderer/src/features/settings/components/settings-modal.test.tsx:1-285`

**Interfaces:**
- Consumes: `useResizableDialog({ isOpen, minWidth, minHeight })` and `DialogResizeHandles`.
- Produces: a Settings surface capped at `780 × 640` and reduced to the viewport minus 32 px when necessary.
- Produces: `data-settings-layout`, `data-settings-content`, `data-dialog-drag-handle`, and eight resize handles.

- [ ] **Step 1: Wrap Settings tests with the provider and write failing layout tests**

Alias Testing Library's `render` import to `baseRender`, import `act` and `DragResizeProvider`, and define:

```tsx
const render = (
  ui: Parameters<typeof baseRender>[0],
  options?: Parameters<typeof baseRender>[1],
) =>
  baseRender(ui, {
    ...options,
    wrapper: ({ children }) => (
      <DragResizeProvider debounceMs={0}>{children}</DragResizeProvider>
    ),
  });
```

Add:

```tsx
it("keeps the Settings surface inside small application windows", () => {
  render(<SettingsModal />);
  const dialog = screen.getByRole("dialog", { name: "设置" });
  expect(dialog).toHaveClass(
    "h-[calc(100vh-32px)]",
    "max-h-[640px]",
    "w-[calc(100vw-32px)]",
    "max-w-[780px]",
    "flex-col",
  );
  expect(screen.getByTestId("settings-layout")).toHaveClass("min-h-0", "flex-1");
  expect(screen.getByTestId("settings-content")).toHaveClass(
    "min-w-0",
    "overflow-y-auto",
  );
  expect(screen.getByTestId("settings-navigation")).toHaveClass(
    "w-[180px]",
    "sm:w-[220px]",
    "overflow-y-auto",
  );
});

it("uses the shared drag and resize controls", () => {
  render(<SettingsModal />);
  expect(document.querySelector("[data-dialog-drag-handle]")).toBeInTheDocument();
  expect(document.querySelectorAll("[data-dialog-resize-handle]")).toHaveLength(8);
});

it("restores default Settings geometry after reopening", async () => {
  render(<SettingsModal />);
  const dialog = screen.getByRole("dialog", { name: "设置" });
  dialog.style.width = "520px";
  dialog.style.left = "40px";
  act(() => useUIStore.getState().setSettingsOpen(false));
  act(() => useUIStore.getState().setSettingsOpen(true));
  await waitFor(() => {
    expect(screen.getByRole("dialog", { name: "设置" }).style.width).toBe("");
    expect(screen.getByRole("dialog", { name: "设置" }).style.left).toBe("");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test src/renderer/src/features/settings/components/settings-modal.test.tsx`

Expected: FAIL because Settings still uses a fixed 540 px body and has no shared controls.

- [ ] **Step 3: Connect Settings to shared geometry**

After reading `isSettingsOpen`, add:

```tsx
const { contentRef, dragHandleProps, resizeHandleProps } =
  useResizableDialog({
    isOpen: isSettingsOpen,
    minWidth: 480,
    minHeight: 360,
  });
```

Attach the ref and replace only the current `DialogContent` class string; preserve both existing export-menu outside-interaction callbacks:

```tsx
<DialogContent
  ref={contentRef}
  className="flex h-[calc(100vh-32px)] max-h-[640px] w-[calc(100vw-32px)] max-w-[780px] flex-col gap-0 overflow-visible p-0"
  onInteractOutside={(event) => {
    if (isExportSettingsDropdownEvent(event)) event.preventDefault();
  }}
  onFocusOutside={(event) => {
    if (isExportSettingsDropdownEvent(event)) event.preventDefault();
  }}
>
```

- [ ] **Step 4: Convert the body to constrained flex layout and add controls**

Update the header:

```tsx
<DialogHeader
  data-dialog-drag-handle
  {...dragHandleProps}
  className="flex-shrink-0 select-none px-8 pb-4 pt-8"
>
```

Change the current body opening element, navigation opening element, and content element to:

```tsx
<div
  data-testid="settings-layout"
  className="flex min-h-0 flex-1 gap-0 overflow-hidden"
>
```

```tsx
<div
  data-testid="settings-navigation"
  className="w-[180px] flex-shrink-0 overflow-y-auto px-2 sm:w-[220px]"
  style={{
    borderRight: "1px solid var(--border-color)",
    paddingTop: "20px",
    paddingBottom: "20px",
  }}
>
```

```tsx
<div
  data-testid="settings-content"
  className="min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
>
  {renderContent()}
</div>
```

Remove `style={{ height: "540px" }}` and add this immediately before `</DialogContent>`:

```tsx
<DialogResizeHandles resizeHandleProps={resizeHandleProps} />
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `pnpm test src/renderer/src/features/settings/components/settings-modal.test.tsx src/renderer/src/hooks/use-resizable-dialog.test.tsx`

Expected: PASS, including existing export-menu and update behavior tests.

- [ ] **Step 6: Commit the Settings change**

```bash
git add src/renderer/src/features/settings/components/settings-modal.tsx src/renderer/src/features/settings/components/settings-modal.test.tsx
git commit -m "feat: make settings dialog responsive"
```

---

### Task 4: Make the main Git dialog draggable and resizable

**Files:**
- Modify: `src/renderer/src/features/git/components/git-panel.tsx:1-2070`
- Modify: `src/renderer/src/features/git/components/git-panel.test.tsx:1-652`

**Interfaces:**
- Consumes: `useResizableDialog({ isOpen, minWidth, minHeight })` and `DialogResizeHandles`.
- Produces: a responsive main Git surface with one drag handle, eight resize handles, and opening reset.
- Keeps loading and non-repository surfaces compact at a 400 px preferred width.

- [ ] **Step 1: Wrap Git tests with the provider and write failing geometry tests**

Alias Testing Library's `render` to `baseRender`, import `DragResizeProvider`, and define:

```tsx
const render = (
  ui: Parameters<typeof baseRender>[0],
  options?: Parameters<typeof baseRender>[1],
) =>
  baseRender(ui, {
    ...options,
    wrapper: ({ children }) => (
      <DragResizeProvider debounceMs={0}>{children}</DragResizeProvider>
    ),
  });
```

Add:

```tsx
it("uses responsive shared geometry for the main Git surface", async () => {
  render(<GitPanel isOpen onClose={vi.fn()} />);
  await screen.findByText("changed.md");
  const dialog = document.querySelector<HTMLElement>('[data-git-dialog="main"]')!;
  expect(dialog).toHaveClass(
    "h-[82vh]",
    "max-h-[calc(100vh-32px)]",
    "w-[calc(100vw-32px)]",
    "max-w-[680px]",
  );
  expect(dialog.querySelector("[data-dialog-drag-handle]")).toBeInTheDocument();
  expect(dialog.querySelectorAll("[data-dialog-resize-handle]")).toHaveLength(8);
});

it("keeps the Git loading surface compact but viewport safe", () => {
  electronMocks.detectGitRepo.mockReturnValueOnce(new Promise(() => undefined));
  render(<GitPanel isOpen onClose={vi.fn()} />);
  const loading = screen.getByRole("status", { name: "加载中" });
  expect(loading.closest('[data-git-dialog="loading"]')).toHaveClass(
    "w-[calc(100vw-32px)]",
    "max-w-[400px]",
    "max-h-[calc(100vh-32px)]",
  );
});

it("keeps the non-repository surface compact but viewport safe", async () => {
  electronMocks.detectGitRepo.mockResolvedValueOnce({
    code: CodeResult.Success,
    data: { isGitRepo: false },
  });
  render(<GitPanel isOpen onClose={vi.fn()} />);
  await screen.findByText("当前目录不是 Git 仓库");
  expect(document.querySelector('[data-git-dialog="not-repository"]')).toHaveClass(
    "w-[calc(100vw-32px)]",
    "max-w-[400px]",
    "max-h-[calc(100vh-32px)]",
  );
});

it("restores default Git geometry after reopening", async () => {
  const { rerender } = render(<GitPanel isOpen onClose={vi.fn()} />);
  await screen.findByText("changed.md");
  const dialog = document.querySelector<HTMLElement>('[data-git-dialog="main"]')!;
  dialog.style.width = "540px";
  dialog.style.left = "32px";
  rerender(<GitPanel isOpen={false} onClose={vi.fn()} />);
  rerender(<GitPanel isOpen onClose={vi.fn()} />);
  await screen.findByText("changed.md");
  const reopened = document.querySelector<HTMLElement>('[data-git-dialog="main"]')!;
  expect(reopened.style.width).toBe("");
  expect(reopened.style.left).toBe("");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test src/renderer/src/features/git/components/git-panel.test.tsx`

Expected: FAIL because Git has no shared geometry markers or viewport-safe width classes.

- [ ] **Step 3: Connect the main Git state to shared geometry**

After `isOpening` is derived, add:

```tsx
const isMainDialogOpen = isOpen && !isOpening && isGitRepo === true;
const { contentRef, dragHandleProps, resizeHandleProps } =
  useResizableDialog({
    isOpen: isMainDialogOpen,
    minWidth: 480,
    minHeight: 360,
  });
```

Replace the main surface opening element with:

```tsx
<div
  ref={contentRef}
  data-git-dialog="main"
  className="relative flex h-[82vh] max-h-[calc(100vh-32px)] w-[calc(100vw-32px)] max-w-[680px] flex-col overflow-hidden rounded-xl shadow-2xl"
  style={{ backgroundColor: "var(--bg-secondary)" }}
  onClick={(event) => event.stopPropagation()}
>
```

Spread `dragHandleProps` on the existing main header, add `data-dialog-drag-handle` and `select-none`, and add `onPointerDown={(event) => event.stopPropagation()}` to the close button. Render this as the last child of the main surface:

```tsx
<DialogResizeHandles resizeHandleProps={resizeHandleProps} />
```

- [ ] **Step 4: Cap compact Git states to the viewport**

Replace the loading and non-repository surface opening classes with:

```tsx
<div
  data-git-dialog="loading"
  className="max-h-[calc(100vh-32px)] w-[calc(100vw-32px)] max-w-[400px] overflow-auto rounded-xl shadow-2xl"
>
```

```tsx
<div
  data-git-dialog="not-repository"
  className="max-h-[calc(100vh-32px)] w-[calc(100vw-32px)] max-w-[400px] overflow-auto rounded-xl shadow-2xl"
>
```

Keep both compact surfaces non-resizable and preserve their current loading, close, and informational behavior.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run: `pnpm test src/renderer/src/features/git/components/git-panel.test.tsx src/renderer/src/hooks/use-resizable-dialog.test.tsx`

Expected: PASS, including existing Git loading, refresh, action, history, and nested confirmation tests.

- [ ] **Step 6: Commit the Git change**

```bash
git add src/renderer/src/features/git/components/git-panel.tsx src/renderer/src/features/git/components/git-panel.test.tsx
git commit -m "feat: resize and drag git dialog"
```

---

### Task 5: Verify the integrated dialog behavior

**Files:**
- Verify: all files changed in Tasks 1-4.
- Do not stage or modify the pre-existing editor files or `docs/superpowers/plans/2026-07-15-quote-nested-lists.md`.

**Interfaces:**
- Consumes: completed shared geometry, diff, Settings, and Git integrations.
- Produces: test, type, lint, build, and diff-boundary evidence.

- [ ] **Step 1: Run focused dialog suites**

Run:

```bash
pnpm test src/renderer/src/hooks/use-resizable-dialog.test.tsx src/renderer/src/app/App.test.tsx src/renderer/src/pages/home/home-page.test.tsx src/renderer/src/features/settings/components/settings-modal.test.tsx src/renderer/src/features/git/components/git-panel.test.tsx
```

Expected: PASS with no unhandled dialog-interaction errors.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 3: Run TypeScript checks**

Run: `pnpm typecheck`

Expected: exit code 0.

- [ ] **Step 4: Run lint**

Run: `pnpm lint`

Expected: exit code 0 with no new warnings in changed files.

- [ ] **Step 5: Run the production build**

Run: `pnpm build`

Expected: exit code 0 and renderer, main, and preload bundles emitted successfully.

- [ ] **Step 6: Check formatting and diff boundaries**

Run:

```bash
pnpm format:check
git diff --check
git status --short
```

Expected: formatting and whitespace checks pass; the status still lists the user's pre-existing editor work separately from the dialog feature commits.
