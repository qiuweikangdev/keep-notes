# Floating Editor Outline Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand outline drawer to the floating editor and consolidate every right-side window action into one menu.

**Architecture:** Keep outline state local to each `QuickEditorWindow`. Extract heading data from the window's BlockNote document, render it in a focused overlay component, and expose window actions through a reusable menu component that uses the project's existing Radix wrapper and theme tokens.

**Tech Stack:** React 19, TypeScript, BlockNote, Radix DropdownMenu, Lucide icons, Vitest, Testing Library, CSS.

## Global Constraints

- Use the existing `node_modules`; do not install or update dependencies.
- Keep the left collapse control and make `More` the only right-side title-bar control.
- Do not display or register an outline keyboard shortcut.
- Use identical typography, icon color, text color, hover state, and focus state for every menu item, including close.
- Keep close as the final item after a separator, without danger styling.
- Keep the drawer renderer-local; do not add IPC or main-window store coupling.
- Write Chinese comments for core method logic.

---

## File Structure

- Create `src/renderer/src/features/editor/components/quick-editor-outline.tsx`: heading extraction and outline drawer rendering.
- Create `src/renderer/src/features/editor/components/quick-editor-outline.test.tsx`: extraction and drawer behavior tests.
- Create `src/renderer/src/features/editor/components/quick-editor-actions-menu.tsx`: the single title-bar menu trigger and uniform menu items.
- Create `src/renderer/src/features/editor/components/quick-editor-actions-menu.test.tsx`: menu order, callbacks, and styling tests.
- Modify `src/renderer/src/features/editor/components/quick-editor-window.tsx`: local outline state, active-heading tracking, navigation, menu integration, and close rules.
- Modify `src/renderer/src/features/editor/components/quick-editor-window.css`: overlay drawer and menu layout.
- Modify `src/renderer/src/features/editor/components/quick-editor-window.test.ts`: floating-window integration coverage.

---

### Task 1: Add the Floating Outline Model and Drawer

**Files:**
- Create: `src/renderer/src/features/editor/components/quick-editor-outline.tsx`
- Create: `src/renderer/src/features/editor/components/quick-editor-outline.test.tsx`

**Interfaces:**
- Produces: `QuickEditorOutlineHeading`, `extractQuickEditorOutlineHeadings(blocks)`, and `QuickEditorOutline`.
- Consumes: BlockNote-like block objects containing `id`, `type`, `content`, `props.level`, and `children`.

- [ ] **Step 1: Write failing extraction and rendering tests**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  extractQuickEditorOutlineHeadings,
  QuickEditorOutline,
} from "./quick-editor-outline";

describe("quick editor outline", () => {
  it("extracts nested headings in document order", () => {
    expect(
      extractQuickEditorOutlineHeadings([
        {
          id: "heading-1",
          type: "heading",
          props: { level: 1 },
          content: [{ type: "text", text: "Overview" }],
          children: [
            {
              id: "heading-2",
              type: "heading",
              props: { level: 2 },
              content: [{ type: "text", text: "Details" }],
            },
          ],
        },
      ]),
    ).toEqual([
      { id: "heading-1", level: 1, text: "Overview" },
      { id: "heading-2", level: 2, text: "Details" },
    ]);
  });

  it("renders an empty state and forwards heading selection", () => {
    const { rerender } = render(
      <QuickEditorOutline
        headings={[]}
        activeHeadingId={null}
        onHeadingSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("暂无标题")).toBeInTheDocument();

    const onHeadingSelect = vi.fn();
    rerender(
      <QuickEditorOutline
        headings={[{ id: "heading-1", level: 1, text: "Overview" }]}
        activeHeadingId="heading-1"
        onHeadingSelect={onHeadingSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(onHeadingSelect).toHaveBeenCalledWith("heading-1");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test -- src/renderer/src/features/editor/components/quick-editor-outline.test.tsx`

Expected: FAIL because `quick-editor-outline.tsx` does not exist.

- [ ] **Step 3: Implement heading extraction and the drawer component**

```tsx
export interface QuickEditorOutlineHeading {
  id: string;
  level: number;
  text: string;
}

interface QuickEditorOutlineBlock {
  id: string;
  type: string;
  props?: { level?: number };
  content?: unknown;
  children?: QuickEditorOutlineBlock[];
}

function readInlineText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      return record.type === "text" && typeof record.text === "string"
        ? record.text
        : "";
    })
    .join("");
}

export function extractQuickEditorOutlineHeadings(
  blocks: readonly QuickEditorOutlineBlock[],
): QuickEditorOutlineHeading[] {
  const headings: QuickEditorOutlineHeading[] = [];
  const visit = (items: readonly QuickEditorOutlineBlock[]) => {
    for (const block of items) {
      if (block.type === "heading") {
        headings.push({
          id: block.id,
          level: block.props?.level ?? 1,
          text: readInlineText(block.content),
        });
      }
      if (block.children?.length) visit(block.children);
    }
  };
  visit(blocks);
  return headings;
}

interface QuickEditorOutlineProps {
  headings: QuickEditorOutlineHeading[];
  activeHeadingId: string | null;
  onHeadingSelect: (id: string) => void;
}

export function QuickEditorOutline(props: QuickEditorOutlineProps) {
  return (
    <nav aria-label="文档大纲" className="quick-editor-outline">
      <div className="quick-editor-outline__header">大纲</div>
      <div className="quick-editor-outline__list">
        {props.headings.length === 0 ? (
          <div className="quick-editor-outline__empty">暂无标题</div>
        ) : (
          props.headings.map((heading) => (
            <button
              key={heading.id}
              type="button"
              className="quick-editor-outline__item"
              data-active={heading.id === props.activeHeadingId || undefined}
              style={{ paddingLeft: `${12 + (heading.level - 1) * 16}px` }}
              onClick={() => props.onHeadingSelect(heading.id)}
            >
              <span>{heading.text || "未命名标题"}</span>
            </button>
          ))
        )}
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm test -- src/renderer/src/features/editor/components/quick-editor-outline.test.tsx`

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit the outline unit**

```bash
git add src/renderer/src/features/editor/components/quick-editor-outline.tsx src/renderer/src/features/editor/components/quick-editor-outline.test.tsx
git commit -m "feat: add floating editor outline drawer"
```

---

### Task 2: Consolidate Floating Window Actions into One Menu

**Files:**
- Create: `src/renderer/src/features/editor/components/quick-editor-actions-menu.tsx`
- Create: `src/renderer/src/features/editor/components/quick-editor-actions-menu.test.tsx`

**Interfaces:**
- Produces: `QuickEditorActionsMenu`.
- Consumes: `isOutlineOpen`, `isOutlineDisabled`, `onToggleOutline`, `onNewWindow`, `onReturnToApplication`, and `onCloseWindow`.

- [ ] **Step 1: Write failing menu tests**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuickEditorActionsMenu } from "./quick-editor-actions-menu";

it("uses one trigger and exposes uniformly styled actions", () => {
  const handlers = {
    onToggleOutline: vi.fn(),
    onNewWindow: vi.fn(),
    onReturnToApplication: vi.fn(),
    onCloseWindow: vi.fn(),
  };
  render(
    <QuickEditorActionsMenu
      isOutlineOpen={false}
      isOutlineDisabled={false}
      {...handlers}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
  const items = screen.getAllByRole("menuitem");
  expect(items.map((item) => item.textContent)).toEqual([
    "显示大纲",
    "新建浮动窗口",
    "返回主窗口",
    "关闭浮动窗口",
  ]);
  expect(screen.queryByText(/Ctrl|Cmd|Shift/)).not.toBeInTheDocument();
  expect(new Set(items.map((item) => item.className)).size).toBe(1);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm test -- src/renderer/src/features/editor/components/quick-editor-actions-menu.test.tsx`

Expected: FAIL because `QuickEditorActionsMenu` does not exist.

- [ ] **Step 3: Implement the menu using the existing dropdown wrapper**

```tsx
import type { ReactNode } from "react";
import { ListTree, MoreHorizontal, PictureInPicture2, Plus, X } from "lucide-react";
import { DropdownMenu } from "@/components/ui/dropdown-menu";

const itemClassName =
  "quick-editor-actions-menu__item flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none data-[disabled]:opacity-45 data-[highlighted]:bg-[var(--hover-bg)]";

interface QuickEditorActionsMenuProps {
  isOutlineOpen: boolean;
  isOutlineDisabled: boolean;
  onToggleOutline: () => void;
  onNewWindow: () => void;
  onReturnToApplication: () => void;
  onCloseWindow: () => void;
}

function ActionItem(props: {
  children: ReactNode;
  disabled?: boolean;
  icon: ReactNode;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      className={itemClassName}
      disabled={props.disabled}
      onSelect={props.onSelect}
    >
      {props.icon}
      <span>{props.children}</span>
    </DropdownMenu.Item>
  );
}

export function QuickEditorActionsMenu(props: QuickEditorActionsMenuProps) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="更多操作"
          className="quick-editor-window__action"
        >
          <MoreHorizontal aria-hidden="true" size={16} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="quick-editor-actions-menu"
        >
          <ActionItem
            disabled={props.isOutlineDisabled}
            icon={<ListTree aria-hidden="true" size={14} />}
            onSelect={props.onToggleOutline}
          >
            {props.isOutlineOpen ? "隐藏大纲" : "显示大纲"}
          </ActionItem>
          <DropdownMenu.Separator className="quick-editor-actions-menu__separator" />
          <ActionItem icon={<Plus aria-hidden="true" size={14} />} onSelect={props.onNewWindow}>新建浮动窗口</ActionItem>
          <ActionItem icon={<PictureInPicture2 aria-hidden="true" size={14} />} onSelect={props.onReturnToApplication}>返回主窗口</ActionItem>
          <DropdownMenu.Separator className="quick-editor-actions-menu__separator" />
          <ActionItem icon={<X aria-hidden="true" size={14} />} onSelect={props.onCloseWindow}>关闭浮动窗口</ActionItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm test -- src/renderer/src/features/editor/components/quick-editor-actions-menu.test.tsx`

Expected: PASS and no shortcut text is rendered.

- [ ] **Step 5: Commit the menu unit**

```bash
git add src/renderer/src/features/editor/components/quick-editor-actions-menu.tsx src/renderer/src/features/editor/components/quick-editor-actions-menu.test.tsx
git commit -m "refactor: consolidate floating editor actions"
```

---

### Task 3: Integrate Outline State, Navigation, and Styling

**Files:**
- Modify: `src/renderer/src/features/editor/components/quick-editor-window.tsx`
- Modify: `src/renderer/src/features/editor/components/quick-editor-window.css`
- Modify: `src/renderer/src/features/editor/components/quick-editor-window.test.ts`

**Interfaces:**
- Consumes: `extractQuickEditorOutlineHeadings`, `QuickEditorOutline`, and `QuickEditorActionsMenu` from Tasks 1 and 2.
- Produces: a complete floating editor with one right-side menu trigger and a local right overlay drawer.

- [ ] **Step 1: Add failing integration tests**

Extend the existing floating-editor render test to assert:

```tsx
expect(screen.getByRole("button", { name: "更多操作" })).toBeInTheDocument();
expect(screen.queryByRole("button", { name: "新建浮动窗口" })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "返回主窗口" })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "关闭浮动窗口" })).not.toBeInTheDocument();

fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
fireEvent.click(screen.getByRole("menuitem", { name: "显示大纲" }));
expect(screen.getByRole("navigation", { name: "文档大纲" })).toBeInTheDocument();

fireEvent.pointerDown(screen.getByRole("textbox"));
expect(screen.queryByRole("navigation", { name: "文档大纲" })).not.toBeInTheDocument();
```

Add a heading-navigation test using initial content `# Overview\n\n## Details`, stub `HTMLElement.prototype.scrollIntoView`, open the drawer, click `Details`, and expect `scrollIntoView` to be called.

- [ ] **Step 2: Run the integration test and verify RED**

Run: `pnpm test -- src/renderer/src/features/editor/components/quick-editor-window.test.ts`

Expected: FAIL because the old direct action buttons remain and no outline navigation exists.

- [ ] **Step 3: Add local outline state and refresh logic**

Add the local state and refresh callback:

```tsx
const scrollContainerRef = useRef<HTMLDivElement>(null);
const [isOutlineOpen, setIsOutlineOpen] = useState(false);
const [outlineHeadings, setOutlineHeadings] = useState<
  QuickEditorOutlineHeading[]
>([]);
const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);

const refreshOutline = useCallback(() => {
  // 浮窗独立维护大纲，避免多个浮窗与主窗口窗格互相覆盖导航状态。
  const headings = extractQuickEditorOutlineHeadings(editor.document);
  setOutlineHeadings(headings);
  setActiveHeadingId((current) =>
    current && headings.some((heading) => heading.id === current)
      ? current
      : (headings[0]?.id ?? null),
  );
}, [editor]);
```

Call `refreshOutline()` in the existing `useEditorChange` callback after dirty-state/content synchronization. Also call it immediately after each successful `editor.replaceBlocks(...)` in replacement, initial-content, and live-update paths so programmatic document changes update the drawer without waiting for another edit event.

- [ ] **Step 4: Add active-heading tracking and navigation**

Add one DOM lookup helper and the two callbacks:

```tsx
function findQuickEditorBlockElement(root: Element | null, blockId: string) {
  return Array.from(
    root?.querySelectorAll<HTMLElement>("[data-id]") ?? [],
  ).find((element) => element.dataset.id === blockId) ?? null;
}

const handleEditorScroll = useCallback(() => {
  const container = scrollContainerRef.current;
  if (!container || outlineHeadings.length === 0) return;
  const activationTop = container.getBoundingClientRect().top + 24;
  let nextActiveId = outlineHeadings[0]?.id ?? null;
  for (const heading of outlineHeadings) {
    const element = findQuickEditorBlockElement(editor.domElement, heading.id);
    if (!element || element.getBoundingClientRect().top > activationTop) break;
    nextActiveId = heading.id;
  }
  setActiveHeadingId(nextActiveId);
}, [editor, outlineHeadings]);

const handleOutlineHeadingSelect = useCallback(
  (blockId: string) => {
    const element = findQuickEditorBlockElement(editor.domElement, blockId);
    if (!element || !editor.getBlock(blockId)) return;
    editor.setTextCursorPosition(blockId, "start");
    element.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
    setActiveHeadingId(blockId);
  },
  [editor],
);
```

Attach `ref={scrollContainerRef}` and `onScroll={handleEditorScroll}` to `.quick-editor-window__scroll`.

- [ ] **Step 5: Replace direct actions and render the drawer**

Replace the right-side `Plus`, `PictureInPicture2`, and `X` buttons with:

```tsx
<QuickEditorActionsMenu
  isOutlineOpen={isOutlineOpen}
  isOutlineDisabled={editorIsHidden}
  onToggleOutline={() => setIsOutlineOpen((current) => !current)}
  onNewWindow={() => window.electronAPI.createQuickEditorWindow()}
  onReturnToApplication={() => void handleReturnToApplication()}
  onCloseWindow={() => window.electronAPI.closeQuickEditorWindow()}
/>
```

Render `QuickEditorOutline` beside the editor scroll container only when `isOutlineOpen && !editorIsHidden`. Close it when the editor scroll surface receives a pointer-down event, when `Escape` is pressed, or when the editor collapses.

```tsx
<div
  ref={scrollContainerRef}
  className="quick-editor-window__scroll"
  onPointerDown={() => setIsOutlineOpen(false)}
  onScroll={handleEditorScroll}
>
  <BlockNoteView
    editor={editor}
    theme={isDark ? "dark" : "light"}
    spellCheck={false}
    style={{
      fontSize: `${appearance.fontSize}px`,
      lineHeight: appearance.lineHeight,
    }}
  />
</div>
{isOutlineOpen && !editorIsHidden ? (
  <QuickEditorOutline
    headings={outlineHeadings}
    activeHeadingId={activeHeadingId}
    onHeadingSelect={handleOutlineHeadingSelect}
  />
) : null}
```

At the start of `handleKeyDownCapture`, handle `Escape` when the drawer is open:

```tsx
if (event.key === "Escape" && isOutlineOpen) {
  event.preventDefault();
  event.stopPropagation();
  setIsOutlineOpen(false);
  editor.focus();
  return;
}
```

Add the collapsed-state cleanup:

```tsx
useEffect(() => {
  if (editorIsHidden) setIsOutlineOpen(false);
}, [editorIsHidden]);
```

- [ ] **Step 6: Add menu and drawer CSS**

Add the following component rules, using no close-specific selector:

```css
.quick-editor-actions-menu {
  z-index: 70;
  min-width: 184px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  padding: 4px;
  color: var(--text-secondary);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.quick-editor-actions-menu__item {
  color: var(--text-secondary);
}

.quick-editor-actions-menu__separator {
  height: 1px;
  margin: 4px;
  background: var(--border-color);
}

.quick-editor-outline {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  width: min(240px, calc(100vw - 56px));
  flex-direction: column;
  border-left: 1px solid var(--border-color);
  background: var(--bg-secondary);
  box-shadow: -4px 0 8px rgba(0, 0, 0, 0.1);
}

.quick-editor-outline__header,
.quick-editor-outline__empty,
.quick-editor-outline__item {
  font-size: 13px;
}

.quick-editor-outline__header {
  padding: 12px;
  color: var(--text-primary);
  font-weight: 600;
}

.quick-editor-outline__list {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding-bottom: 8px;
}

.quick-editor-outline__empty {
  padding: 8px 12px;
  color: var(--text-muted);
}

.quick-editor-outline__item {
  display: flex;
  width: 100%;
  min-height: 30px;
  align-items: center;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  padding-right: 12px;
  text-align: left;
}

.quick-editor-outline__item:hover,
.quick-editor-outline__item:focus-visible {
  background: var(--hover-bg);
  color: var(--text-primary);
  outline: none;
}

.quick-editor-outline__item[data-active="true"] {
  background: var(--active-bg);
  color: var(--text-primary);
  font-weight: 500;
}
```

Extend the existing reduced-motion media query so any newly added menu or drawer transition is disabled.

- [ ] **Step 7: Run focused tests and format touched files**

Run:

```bash
pnpm test -- src/renderer/src/features/editor/components/quick-editor-outline.test.tsx src/renderer/src/features/editor/components/quick-editor-actions-menu.test.tsx src/renderer/src/features/editor/components/quick-editor-window.test.ts
pnpm exec oxfmt --write src/renderer/src/features/editor/components/quick-editor-outline.tsx src/renderer/src/features/editor/components/quick-editor-outline.test.tsx src/renderer/src/features/editor/components/quick-editor-actions-menu.tsx src/renderer/src/features/editor/components/quick-editor-actions-menu.test.tsx src/renderer/src/features/editor/components/quick-editor-window.tsx src/renderer/src/features/editor/components/quick-editor-window.test.ts src/renderer/src/features/editor/components/quick-editor-window.css
```

Expected: focused tests PASS and formatting completes without errors.

- [ ] **Step 8: Run repository verification**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Expected: every command exits with code 0.

- [ ] **Step 9: Commit the integration**

```bash
git add src/renderer/src/features/editor/components/quick-editor-window.tsx src/renderer/src/features/editor/components/quick-editor-window.css src/renderer/src/features/editor/components/quick-editor-window.test.ts
git commit -m "feat: add floating editor outline menu"
```
