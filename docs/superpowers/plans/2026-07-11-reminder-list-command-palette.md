# Reminder List Command Palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the reminder list as a compact command-palette dialog matching the existing global search modal while preserving all reminder behavior.

**Architecture:** Keep the existing `ReminderListDialog`, store selectors, filtering, and `ReminderListItem` behavior. Replace only the dialog shell, search controls, tabs, scroll region, and empty-state styling; update focused component tests before implementation.

**Tech Stack:** React 19, TypeScript, Radix Dialog/Tabs, Tailwind CSS, Lucide React, Vitest, Testing Library

## Global Constraints

- Preserve reminder persistence, filtering semantics, editor behavior, notification behavior, and context-menu actions.
- Keep the tabs in this exact order: `今天`, `完成`, `全部`.
- Keep the plus button accessible name and tooltip as `新建提醒事项`.
- Use only existing theme tokens and existing dependencies.
- Do not introduce a shared command-palette abstraction.
- Do not restyle the reminder editor, notification toast, or custom repeat dialog.

---

### Task 1: Specify the compact command-palette contract

**Files:**
- Modify: `src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx`
- Test: `src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx`

**Interfaces:**
- Consumes: `ReminderListDialog(): JSX.Element` and the existing `useReminderStore` state contract.
- Produces: Focused assertions for the compact shell, borderless search row, hidden close button, three tabs, bounded list, and compact empty state.

- [ ] **Step 1: Replace the obsolete fixed-height assertion with compact-shell assertions**

Replace the `keeps the reminder list scroll area at 250px` test with:

```tsx
it("renders a compact command-palette shell", () => {
  render(<ReminderListDialog />);

  const dialog = screen.getByRole("dialog", { name: "提醒事项" });
  const search = screen.getByRole("searchbox", {
    name: "搜索提醒事项",
  });

  expect(dialog).toHaveClass("max-w-[520px]", "top-[12vh]", "translate-y-0");
  expect(search).toHaveClass("border-0", "bg-transparent");
  expect(screen.queryByRole("button", { name: "关闭" })).toBeNull();
  expect(screen.getByRole("button", { name: "新建提醒事项" })).toBeVisible();
});
```

- [ ] **Step 2: Add explicit compact list and empty-state assertions**

Add these tests after the shell test:

```tsx
it("uses a bounded compact result list", () => {
  useReminderStore.setState({
    reminders: [{ ...reminder, scheduledAt: new Date().toISOString() }],
  });
  render(<ReminderListDialog />);

  expect(screen.getByRole("tabpanel")).toHaveClass(
    "max-h-[320px]",
    "overflow-y-auto",
  );
});

it("renders an inline empty state", () => {
  render(<ReminderListDialog />);

  expect(screen.getByText("没有提醒事项")).toHaveClass("px-3", "py-4");
});
```

- [ ] **Step 3: Update the obsolete visible close-button test**

Replace `closes from the close button after dismissing a row context menu` with:

```tsx
it("closes with Escape after dismissing a row context menu", async () => {
  const user = userEvent.setup();
  useReminderStore.setState({
    reminders: [{ ...reminder, scheduledAt: new Date().toISOString() }],
  });
  render(<ReminderListDialog />);

  fireEvent.contextMenu(screen.getByRole("button", { name: /Read notes/ }));
  expect(await screen.findByText("修改")).toBeInTheDocument();

  await user.keyboard("{Escape}");
  await user.keyboard("{Escape}");

  expect(useReminderStore.getState().isListOpen).toBe(false);
});
```

- [ ] **Step 4: Run the focused tests and verify the new visual contract fails**

Run:

```bash
pnpm test -- src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx
```

Expected: FAIL because the dialog is still 680 px wide and vertically centered, the visible close button still exists, the input is still the bordered `Input` component, and the tab panel still has `h-[250px]`.

---

### Task 2: Implement the compact reminder command palette

**Files:**
- Modify: `src/renderer/src/features/reminders/components/reminder-list-dialog.tsx:1-202`
- Test: `src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx`

**Interfaces:**
- Consumes: Existing `query`, `tab`, `visibleReminders`, `handleCreate`, and nested-dialog dismissal handlers.
- Produces: The same exported `ReminderListDialog()` component with a compact visual shell and unchanged reminder actions.

- [ ] **Step 1: Remove obsolete component imports**

Change the imports to remove `Bell`, `Button`, and `Input`:

```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ContextMenu } from "@/components/ui/context-menu";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
```

- [ ] **Step 2: Replace the dialog header with the compact search row**

Set `showCloseButton={false}` and replace the visible header/search block with:

```tsx
<DialogContent
  showCloseButton={false}
  className="top-[12vh] max-w-[520px] translate-y-0 gap-0 overflow-hidden rounded-xl p-0 shadow-2xl"
  style={{
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border-color)",
    color: "var(--text-primary)",
  }}
>
  <Dialog.Title className="sr-only">提醒事项</Dialog.Title>
  <Dialog.Description className="sr-only">
    查看、搜索、编辑和完成笔记提醒事项
  </Dialog.Description>
  <div className="flex h-9 items-center gap-2 px-3">
    <Search
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
    />
    <input
      aria-label="搜索提醒事项"
      className="h-full min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm text-[var(--text-primary)] shadow-none outline-none ring-0 placeholder:text-[var(--text-muted)] focus:border-0 focus:border-transparent focus:outline-none focus:ring-0"
      placeholder="搜索标题或文件名"
      role="searchbox"
      type="text"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
    />
    <button
      aria-label="新建提醒事项"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] outline-none hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)]"
      title="新建提醒事项"
      type="button"
      onClick={handleCreate}
    >
      <Plus aria-hidden="true" className="h-4 w-4" />
    </button>
  </div>
```

Keep the existing Escape and outside-interaction handlers on `DialogContent`; they are omitted from the snippet only to keep the visual replacement readable.

- [ ] **Step 3: Restyle the three tabs and result area**

Use this tab list and panel styling:

```tsx
<Tabs.List className="grid grid-cols-3 gap-1 px-1.5 pb-1">
  {tabs.map((item) => (
    <Tabs.Trigger
      key={item.value}
      value={item.value}
      className="h-7 rounded-md text-xs text-[var(--text-secondary)] outline-none hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)] data-[state=active]:bg-[var(--active-bg)] data-[state=active]:text-[var(--text-primary)]"
    >
      {item.label}
    </Tabs.Trigger>
  ))}
</Tabs.List>
```

Change each active tab panel to:

```tsx
className="max-h-[320px] overflow-y-auto px-1.5 pb-2 outline-none"
```

Replace the large empty panel with:

```tsx
<div className="px-3 py-4 text-[13px] text-[var(--text-muted)]">
  没有提醒事项
</div>
```

- [ ] **Step 4: Tighten reminder rows without changing content or actions**

Change the reminder item button class to:

```tsx
className="grid w-full grid-cols-[minmax(0,1fr)_52px] items-center gap-3 rounded-md px-2 py-1.5 text-left outline-none hover:bg-[var(--hover-bg)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)]"
```

Keep the title, file name, scheduled time, repeat label, and context-menu implementation unchanged.

- [ ] **Step 5: Run the focused tests and verify they pass**

Run:

```bash
pnpm test -- src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx
```

Expected: all tests in `reminder-list-dialog.test.tsx` PASS.

---

### Task 3: Verify repository quality gates

**Files:**
- Verify: `src/renderer/src/features/reminders/components/reminder-list-dialog.tsx`
- Verify: `src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx`

**Interfaces:**
- Consumes: Completed compact dialog implementation and focused tests.
- Produces: Evidence that the renderer types, lint rules, full build, and diff are clean.

- [ ] **Step 1: Format only the modified source and test files**

Run:

```bash
pnpm exec oxfmt --write src/renderer/src/features/reminders/components/reminder-list-dialog.tsx src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx
```

Expected: command exits with code 0 and changes only formatting in the two target files.

- [ ] **Step 2: Run TypeScript verification**

Run:

```bash
pnpm typecheck
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Run lint verification**

Run:

```bash
pnpm lint
```

Expected: exit code 0 with no new lint errors.

- [ ] **Step 4: Run the production build**

Run:

```bash
pnpm build
```

Expected: exit code 0 and Electron Vite completes the main, preload, and renderer builds.

- [ ] **Step 5: Review the final diff**

Run:

```bash
git diff --check
git diff -- src/renderer/src/features/reminders/components/reminder-list-dialog.tsx src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx
```

Expected: `git diff --check` prints nothing; the code diff contains only the agreed reminder dialog visual update and focused test changes.
