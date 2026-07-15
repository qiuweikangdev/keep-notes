# Reminder Editor Layered Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the reminder editor as a focused layered surface that remains visually connected to the visible reminder search list.

**Architecture:** Keep the existing Zustand state and Radix dialog boundaries. The reminder list derives its de-emphasized, inert presentation from `isEditorOpen`; the reminder editor changes only layout, classes, copy, and its compact entrance treatment while preserving all picker and persistence logic.

**Tech Stack:** React 19, TypeScript, Zustand, Radix UI, Tailwind CSS 3, Lucide React, Vitest, Testing Library.

## Global Constraints

- Keep the reminder search list visible while the editor is open.
- Use an approximately 460 px editor inside the 520 px reminder list footprint.
- Preserve reminder persistence, IPC, scheduling, filtering, repeat semantics, notification behavior, and custom repeat behavior.
- Reuse existing theme tokens and dependencies; do not add packages.
- Keep all supported themes and keyboard interactions working.
- Use Chinese comments for any new core logic.
- Use Conventional Commit messages in English.

## File Map

- Modify `src/renderer/src/features/reminders/components/reminder-list-dialog.tsx`: derive and render the background-list focus state.
- Modify `src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx`: verify visible, de-emphasized, inert background behavior.
- Modify `src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx`: implement layered positioning, flatter form hierarchy, explicit save copy, and reduced-motion-safe entrance treatment.
- Modify `src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx`: verify the visual contract while preserving functional coverage.

---

### Task 1: De-emphasize the Visible Reminder List

**Files:**
- Modify: `src/renderer/src/features/reminders/components/reminder-list-dialog.tsx:35-115`
- Test: `src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx:30-58`

**Interfaces:**
- Consumes: `useReminderStore((state) => state.isEditorOpen): boolean`.
- Produces: `data-reminder-list-dialog="true"`, `data-editor-open="true"` while editing, and an inert non-interactive reminder list surface.

- [ ] **Step 1: Write the failing background-layer test**

Add this test after `opens a standalone reminder editor from the search row`:

```tsx
it("keeps the list visible but inert while the editor is open", () => {
  useReminderStore.setState({ isEditorOpen: true });
  render(<ReminderListDialog />);

  const dialog = screen.getByRole("dialog", { name: "提醒事项" });

  expect(dialog).toBeVisible();
  expect(dialog).toHaveAttribute("data-editor-open", "true");
  expect(dialog).toHaveAttribute("inert");
  expect(dialog).toHaveClass("pointer-events-none", "opacity-60");
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
pnpm test -- src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx
```

Expected: FAIL because the dialog does not expose the editor-open state, `inert`, or de-emphasis classes.

- [ ] **Step 3: Derive the editor state and apply the visual contract**

Add the store selector with the other selectors:

```tsx
const isEditorOpen = useReminderStore((state) => state.isEditorOpen);
```

Update `DialogContent` so its existing command-palette classes remain intact and its background state is explicit:

```tsx
<DialogContent
  showCloseButton={false}
  className={`top-[12vh] max-w-[520px] translate-y-0 gap-0 overflow-hidden rounded-xl p-0 shadow-lg transition-[opacity,filter] duration-150 sm:rounded-xl ${
    isEditorOpen ? "pointer-events-none opacity-60 saturate-50" : ""
  }`}
  data-editor-open={isEditorOpen ? "true" : undefined}
  data-reminder-list-dialog="true"
  inert={isEditorOpen}
  // Keep the existing event handlers and style object unchanged.
>
```

The list remains mounted and visible. `inert` removes its controls from keyboard and pointer interaction while the foreground editor owns focus.

- [ ] **Step 4: Run the reminder list tests**

Run:

```bash
pnpm test -- src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx
```

Expected: all reminder list tests PASS.

- [ ] **Step 5: Commit the background-layer change**

```bash
git add src/renderer/src/features/reminders/components/reminder-list-dialog.tsx src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx
git commit -m "style: clarify reminder dialog layering"
```

---

### Task 2: Restyle the Reminder Editor Surface

**Files:**
- Modify: `src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx:235-390`
- Test: `src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx:42-82`

**Interfaces:**
- Consumes: existing `Dialog`, `DialogContent`, `Input`, `Button`, picker components, and reminder store actions.
- Produces: a 460 px layered editor with `data-reminder-editor-dialog="true"`, a flat schedule region, and primary action label `保存提醒`.

- [ ] **Step 1: Replace the compact-style assertions with the layered visual contract**

Update the first editor test and add an action-state assertion:

```tsx
it("renders a layered editor with a flat schedule hierarchy", () => {
  render(<ReminderEditorDialog />);

  const dialog = screen.getByRole("dialog", { name: "新建提醒事项" });
  const titleInput = screen.getByPlaceholderText("标题");
  const settingsGroup = screen.getByTestId("reminder-settings-group");

  expect(dialog).toHaveClass(
    "top-[calc(12vh+88px)]",
    "max-w-[460px]",
    "translate-y-0",
  );
  expect(screen.getByRole("heading", { name: "新建提醒事项" })).toHaveClass(
    "text-[15px]",
    "font-semibold",
  );
  expect(titleInput).toHaveClass("h-9", "text-sm");
  expect(settingsGroup).toHaveClass("border-y");
  expect(settingsGroup).not.toHaveClass("rounded-lg");
  expect(settingsGroup).toContainElement(screen.getByText("日期"));
  expect(settingsGroup).toContainElement(screen.getByText("时间"));
  expect(settingsGroup).toContainElement(screen.getByText("重复"));
  expect(screen.queryAllByRole("switch")).toHaveLength(0);
});

it("uses an explicit primary action with the existing disabled rule", () => {
  render(<ReminderEditorDialog />);

  expect(screen.getByRole("button", { name: "保存提醒" })).toBeDisabled();
});
```

Update existing button lookups that currently use the exact name `保存` to use `保存提醒`.

- [ ] **Step 2: Run the focused editor test and verify failure**

Run:

```bash
pnpm test -- src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx
```

Expected: FAIL on the old 440 px width, viewport-centered position, rounded settings group, title typography, and `保存` label.

- [ ] **Step 3: Implement the layered shell and compact entrance wrapper**

Update the dialog shell and wrap its visible content:

```tsx
<DialogContent
  className="top-[calc(12vh+88px)] z-[60] w-[calc(100%-32px)] max-w-[460px] translate-y-0 gap-0 overflow-visible rounded-xl p-0 shadow-lg"
  data-reminder-editor-dialog="true"
  style={{
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border-color)",
    color: "var(--text-primary)",
  }}
>
  <div className="animate-fade-in motion-reduce:animate-none">
    <div className="flex h-12 items-center border-b border-[var(--border-color)] px-4 pr-12">
      <Dialog.Title className="text-[15px] font-semibold">
        {editingReminder ? "修改提醒事项" : "新建提醒事项"}
      </Dialog.Title>
    </div>
    {/* Keep the form and footer inside this wrapper. */}
  </div>
  {/* Keep CustomRepeatDialog outside the animated wrapper. */}
</DialogContent>
```

Keep the existing accessible description, title input, picker components, submit handler, and custom repeat state unchanged.

- [ ] **Step 4: Flatten the schedule region and refine responsive rows**

Replace the bordered rounded group with a continuous divided region:

```tsx
<div
  className="mt-4 overflow-visible border-y border-[var(--border-color)]"
  data-testid="reminder-settings-group"
>
```

Keep the existing inset separators and update `ReminderSettingRow`:

```tsx
<div className="grid min-h-12 grid-cols-[20px_minmax(0,1fr)_minmax(120px,140px)] items-center gap-3 px-3 py-2 transition-colors hover:bg-[var(--hover-bg)]">
```

Remove the unused `panelStyle` constant after the settings group no longer consumes it.

- [ ] **Step 5: Refine the input and footer actions**

Keep the input neutral by default while preserving the existing focus border:

```tsx
<Input
  value={title}
  onChange={(event) => setTitle(event.target.value)}
  placeholder="标题"
  className="h-9 px-3 py-1 text-sm"
  style={{
    backgroundColor: "color-mix(in srgb, var(--bg-secondary) 72%, var(--bg-primary))",
    border: "1px solid var(--border-color)",
    color: "var(--text-primary)",
  }}
  autoFocus
/>
```

Update the footer and primary label:

```tsx
<div
  className="flex justify-end gap-2 border-t border-[var(--border-color)] px-4 py-3"
  style={{
    backgroundColor:
      "color-mix(in srgb, var(--bg-secondary) 48%, var(--bg-primary))",
  }}
>
  <Button type="button" variant="secondary" onClick={closeEditor}>
    取消
  </Button>
  <Button type="button" disabled={!canSave} onClick={handleSave}>
    保存提醒
  </Button>
</div>
```

- [ ] **Step 6: Run the focused reminder tests**

Run:

```bash
pnpm test -- src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx
```

Expected: both reminder component suites PASS.

- [ ] **Step 7: Commit the editor restyle**

```bash
git add src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx
git commit -m "style: refine reminder editor hierarchy"
```

---

### Task 3: Verify the Integrated Result

**Files:**
- Verify: `src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx`
- Verify: `src/renderer/src/features/reminders/components/reminder-list-dialog.tsx`
- Verify: their focused tests

**Interfaces:**
- Consumes: the layered list state from Task 1 and editor surface from Task 2.
- Produces: a verified renderer build with no new dependencies or reminder behavior changes.

- [ ] **Step 1: Format only the four implementation files**

Run:

```bash
pnpm exec oxfmt --write src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx src/renderer/src/features/reminders/components/reminder-list-dialog.tsx src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx
```

Expected: command exits with code 0 and touches no unrelated file.

- [ ] **Step 2: Re-run focused tests after formatting**

Run:

```bash
pnpm test -- src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx
```

Expected: both suites PASS.

- [ ] **Step 3: Run project verification**

Run each command independently:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all commands exit with code 0.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git diff --check HEAD~2..HEAD
git status --short
```

Expected: no whitespace errors; only the user-owned untracked design draft may remain outside the reminder changes.

- [ ] **Step 5: Perform visual inspection when the Electron app is available**

Open the reminder search list, then select `新建提醒事项`. Verify that the list remains visible and subdued, the editor is the obvious focus, controls do not clip, picker layers remain above the editor, and save/cancel returns to the list correctly.

