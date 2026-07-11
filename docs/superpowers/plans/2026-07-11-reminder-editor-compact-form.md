# Reminder Editor Compact Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized reminder editor layout with a compact 440 px form that matches Keep Notes' current dialog and settings vocabulary.

**Architecture:** Keep `ReminderEditorDialog` as the single create/edit surface and preserve all picker and submission logic. Restructure only its shell and setting rows, remove the unsupported date/time switch state, and verify the new contract with focused component tests.

**Tech Stack:** React 19, TypeScript, Radix Dialog, Tailwind CSS, Lucide React, Vitest, Testing Library

## Global Constraints

- Apply the redesign to both create and edit modes.
- Preserve reminder storage, IPC, scheduling, repeat semantics, picker data, and custom-repeat behavior.
- Use only existing theme tokens and dependencies.
- Keep title, date, and time required for saving.
- Do not redesign the reminder list, notification toast, or custom repeat dialog.
- Do not introduce optional date-only or time-only reminders.

---

### Task 1: Define the compact editor contract

**Files:**
- Modify: `src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx`
- Test: `src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx`

**Interfaces:**
- Consumes: `ReminderEditorDialog()` and the existing `useReminderStore` create/edit state.
- Produces: Assertions for the 440 px shell, visible contextual heading, standard title field, continuous settings group, removed switches, and associated file secondary text.

- [ ] **Step 1: Add a failing compact-layout test**

Add this test after the `beforeEach` block:

```tsx
it("renders a compact editor aligned with the project dialog style", () => {
  render(<ReminderEditorDialog />);

  const dialog = screen.getByRole("dialog", { name: "新建提醒事项" });
  const titleInput = screen.getByPlaceholderText("标题");
  const settingsGroup = screen.getByTestId("reminder-settings-group");

  expect(dialog).toHaveClass("max-w-[440px]");
  expect(screen.getByRole("heading", { name: "新建提醒事项" })).toBeVisible();
  expect(titleInput).toHaveClass("h-9", "text-sm");
  expect(settingsGroup).toContainElement(screen.getByText("日期"));
  expect(settingsGroup).toContainElement(screen.getByText("时间"));
  expect(settingsGroup).toContainElement(screen.getByText("重复"));
  expect(screen.queryAllByRole("switch")).toHaveLength(0);
});
```

- [ ] **Step 2: Add associated-file and edit-heading assertions**

Add these tests:

```tsx
it("renders the associated file as muted secondary text", () => {
  render(<ReminderEditorDialog />);

  expect(screen.getByText("today.md")).toHaveClass(
    "text-[11px]",
    "text-[var(--text-muted)]",
  );
});

it("shows the edit heading when editing an existing reminder", () => {
  useReminderStore.setState({
    reminders: [
      {
        id: "reminder-1",
        title: "Review notes",
        filePath: "/workspace/notes/today.md",
        fileName: "today.md",
        scheduledAt: "2026-06-21T09:00:00.000Z",
        repeat: "never",
        completed: false,
        createdAt: "2026-06-21T08:00:00.000Z",
        updatedAt: "2026-06-21T08:00:00.000Z",
      },
    ],
    editingReminderId: "reminder-1",
  });

  render(<ReminderEditorDialog />);

  expect(screen.getByRole("heading", { name: "修改提醒事项" })).toBeVisible();
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx
```

Expected: FAIL because the dialog is 480 px wide, the title is screen-reader-only, the settings group test id does not exist, switches are present, and file text uses 13 px typography.

---

### Task 2: Implement the compact editor shell and rows

**Files:**
- Modify: `src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx:1-470`
- Test: `src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx`

**Interfaces:**
- Consumes: Existing title/date/time/repeat state, picker controls, `handleSave`, `closeEditor`, and custom repeat state.
- Produces: The same exported `ReminderEditorDialog()` with a compact visual hierarchy and unchanged persistence behavior.

- [ ] **Step 1: Remove unsupported switch state and dependencies**

Remove the `Switch` import, `isDateEnabled`, and `isTimeEnabled` state. Change `canSave` to:

```tsx
const canSave =
  title.trim().length > 0 && date.length > 0 && time.length > 0;
```

Remove the two enabled-state resets from the editor-open effect. Date and time picker triggers always receive `disabled={false}`.

- [ ] **Step 2: Replace the shell with a compact header and title region**

Use this dialog shell and top content:

```tsx
<DialogContent
  className="z-[60] max-w-[440px] gap-0 overflow-visible rounded-xl p-0 shadow-lg"
  data-reminder-editor-dialog="true"
  style={{
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border-color)",
    color: "var(--text-primary)",
  }}
>
  <div className="flex h-11 items-center border-b px-4 border-[var(--border-color)]">
    <Dialog.Title className="text-sm font-medium">
      {editingReminder ? "修改提醒事项" : "新建提醒事项"}
    </Dialog.Title>
  </div>
  <Dialog.Description className="sr-only">
    设置提醒标题、日期时间和重复频率
  </Dialog.Description>

  <div className="p-4">
    <Input
      autoFocus
      value={title}
      onChange={(event) => setTitle(event.target.value)}
      placeholder="标题"
      className="h-9 px-3 text-sm"
    />
    {fileName ? (
      <p className="mt-1 truncate px-1 text-[11px] text-[var(--text-muted)]">
        {fileName}
      </p>
    ) : null}
  </div>
```

Keep the existing accessible description and default `DialogContent` close button.

- [ ] **Step 3: Replace section cards with one continuous settings group**

Render the three rows inside:

```tsx
<div
  data-testid="reminder-settings-group"
  className="mx-4 overflow-visible rounded-lg border border-[var(--border-color)]"
>
  <ReminderSettingRow icon={<CalendarDays className="h-4 w-4" />} label="日期">
    <DatePickerControl
      value={date}
      disabled={false}
      open={openPicker === "date"}
      displayMonth={displayMonth}
      onDisplayMonthChange={setDisplayMonth}
      onOpenChange={(open) => setOpenPicker(open ? "date" : null)}
      onChange={(value) => {
        setDate(value);
        setDisplayMonth(parseDateValue(value));
        setOpenPicker(null);
      }}
    />
  </ReminderSettingRow>
  <div className="mx-3 h-px bg-[var(--border-color)]" />
  <ReminderSettingRow icon={<Clock3 className="h-4 w-4" />} label="时间">
    <TimePickerControl
      value={time}
      disabled={false}
      open={openPicker === "time"}
      onOpenChange={(open) => setOpenPicker(open ? "time" : null)}
      onChange={setTime}
    />
  </ReminderSettingRow>
  <div className="mx-3 h-px bg-[var(--border-color)]" />
  <ReminderSettingRow icon={<Repeat2 className="h-4 w-4" />} label="重复">
    <RepeatPickerControl
      value={repeat}
      open={openPicker === "repeat"}
      onOpenChange={(open) => setOpenPicker(open ? "repeat" : null)}
      onChange={(value) => {
        handleRepeatChange(value);
        setOpenPicker(null);
      }}
    />
  </ReminderSettingRow>
</div>
```

Keep the custom repeat edit action immediately below the repeat row inside the same group.

- [ ] **Step 4: Replace `ReminderRow` with the compact row component**

Use this interface and component:

```tsx
interface ReminderSettingRowProps {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}

function ReminderSettingRow({
  icon,
  label,
  children,
}: ReminderSettingRowProps) {
  return (
    <div
      data-reminder-setting-row="true"
      className="grid min-h-12 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2"
    >
      <span className="flex h-5 w-5 items-center justify-center text-[var(--text-muted)]">
        {icon}
      </span>
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}
```

Reduce date and repeat trigger widths to `w-[140px]` and the time trigger width to `w-[120px]` while preserving popup behavior.

- [ ] **Step 5: Add the compact footer**

Use:

```tsx
<div className="mt-4 flex justify-end gap-2 border-t border-[var(--border-color)] px-4 py-3">
  <Button type="button" variant="secondary" onClick={closeEditor}>
    取消
  </Button>
  <Button type="button" disabled={!canSave} onClick={handleSave}>
    保存
  </Button>
</div>
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx
```

Expected: all reminder editor tests PASS.

---

### Task 3: Verify quality and visual alignment

**Files:**
- Verify: `src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx`
- Verify: `src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx`

**Interfaces:**
- Consumes: Completed compact editor and focused tests.
- Produces: Formatting, type, lint, build, and Electron visual evidence.

- [ ] **Step 1: Format the modified files**

Run:

```bash
pnpm exec oxfmt --write src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx
```

Expected: exit code 0.

- [ ] **Step 2: Run automated quality gates**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all commands exit with code 0; existing repository warnings may remain, but no warning may originate from the two modified files.

- [ ] **Step 3: Inspect the development app**

Open the reminder list and create editor in the running Electron development app. Verify the 440 px dialog, visible header, standard title field, three compact rows, associated-file secondary text, picker placement, disabled save state, and light/dark theme token use.

- [ ] **Step 4: Review the final diff**

Run:

```bash
git diff --check
git diff -- src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx
```

Expected: no whitespace errors and no changes outside the agreed reminder editor scope.
