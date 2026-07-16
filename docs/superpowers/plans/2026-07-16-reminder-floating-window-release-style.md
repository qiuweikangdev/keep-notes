# Reminder Floating Window Release Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the published Keep Notes reminder colors, borders, dividers, spacing, and picker containment inside the standalone reminder windows while preserving all existing floating-window behavior and fixing macOS return-to-application activation.

**Architecture:** Keep the current renderer components, Zustand state, preload bridge, IPC channels, prewarmed editor window, and native parent/child window lifecycle. Apply the release visual contract directly to the existing list, editor, and custom-repeat surfaces; retain the deterministic list-height calculation with explicit border accounting; restore the repeat menu's upward placement; and add macOS application activation inside the existing `focusMainWindow()` boundary.

**Tech Stack:** Electron 42, React 19, TypeScript 5.9, Zustand, Radix UI, Tailwind CSS 3, Lucide React, Vitest, Testing Library, pnpm.

## Global Constraints

- The standalone reminder windows remain in place.
- Reuse the published release's theme-derived colors, visible borders, section dividers, control styling, and action styling.
- Preserve reminder persistence, scheduling, filtering, repeat calculations, notifications, IPC channel names, global shortcut registration, editor-window prewarming, and native window ownership.
- Keep existing search, create, edit, save, cancel, picker, dragging, dismissal, and custom-repeat behavior unchanged.
- Correct macOS return-to-application activation without changing other platforms' restore/show/focus behavior.
- Do not add dependencies, theme tokens, platform-specific layout offsets, unrelated refactors, or fixes for unrelated existing test failures.
- Write Chinese comments for new core logic.
- Use Conventional Commit messages in English.

## File Map

- Modify `src/renderer/src/features/reminders/components/reminder-list-dialog.tsx`: restore the release list surface and account for restored borders in deterministic native-window sizing.
- Modify `src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx`: verify the release surface and corrected content-sized height.
- Modify `src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx`: restore release editor, control, picker, footer, and repeat-menu styling without changing handlers.
- Modify `src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx`: verify release styling and repeat-menu containment.
- Modify `src/renderer/src/features/reminders/components/custom-repeat-dialog.tsx`: restore release dividers, control widths, borders, footer, and unit-menu styling.
- Modify `src/renderer/src/features/reminders/components/custom-repeat-dialog.test.tsx`: verify the custom-repeat release contract and preserved interaction.
- Modify `src/main/window.ts`: activate the application and raise the existing main window on macOS.
- Modify `src/main/window.test.ts`: verify the macOS-only activation sequence and unchanged cross-platform behavior.

---

### Task 1: Restore the Reminder List Release Surface

**Files:**
- Modify: `src/renderer/src/features/reminders/components/reminder-list-dialog.tsx:20-70,145-215`
- Test: `src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx:310-390`

**Interfaces:**
- Consumes: `visibleReminders: Reminder[]`, existing `presentation="floating-window"`, existing `resizeReminderWindow(height)` preload API.
- Produces: the existing `data-reminder-list-dialog`, `data-reminder-list-header`, and `data-reminder-scroll-region` contracts with published theme styling and a native height that includes three restored border pixels.

- [ ] **Step 1: Add a failing release-surface test and update the expected bounded-list height**

Add this test after `marks the floating reminder surface as draggable`:

```tsx
it("restores the published floating reminder surface", () => {
  render(<ReminderListDialog presentation="floating-window" />);

  const dialog = screen.getByRole("dialog", { name: "提醒事项" });
  const header = dialog.querySelector<HTMLElement>(
    '[data-reminder-list-header="true"]',
  );

  expect(dialog).toHaveStyle({
    backgroundColor: "var(--bg-primary)",
    border: "1px solid var(--border-color)",
  });
  expect(dialog).toHaveClass(
    "shadow-[0_4px_8px_rgba(0,0,0,0.16)]",
  );
  expect(header).toHaveClass("border-b", "border-[var(--border-color)]");
  expect(header).toHaveStyle({
    backgroundColor:
      "color-mix(in srgb, var(--bg-secondary) 24%, var(--bg-primary))",
  });
});
```

In `sizes a floating window from the full scrollable list height`, change the expected height from `416` to `419`:

```tsx
expect(resizeReminderWindow).toHaveBeenCalledWith(419);
```

- [ ] **Step 2: Run the focused list test and verify the expected failures**

Run:

```bash
pnpm exec vitest run src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx
```

Expected: FAIL because the current surface has no border, uses the newer background/shadow/header tint, lacks the header divider, and still requests height `416`.

- [ ] **Step 3: Account for the restored surface and header borders in native sizing**

Add these constants beside the existing floating-window geometry constants:

```tsx
const FLOATING_SURFACE_BORDER_HEIGHT = 2;
const FLOATING_HEADER_DIVIDER_HEIGHT = 1;
```

Replace both returns in `getFloatingWindowHeight()` with a shared frame height:

```tsx
function getFloatingWindowHeight(reminders: readonly Reminder[]): number {
  const frameHeight =
    FLOATING_HEADER_HEIGHT +
    FLOATING_WINDOW_VERTICAL_MARGIN +
    FLOATING_SURFACE_BORDER_HEIGHT +
    FLOATING_HEADER_DIVIDER_HEIGHT;

  if (reminders.length === 0) {
    return frameHeight + FLOATING_EMPTY_RESULT_HEIGHT;
  }

  const rowsHeight = reminders.reduce(
    (height, reminder) =>
      height +
      (reminder.fileName
        ? FLOATING_RESULT_ROW_WITH_FILE_HEIGHT
        : FLOATING_RESULT_ROW_HEIGHT),
    0,
  );
  const gapsHeight = (reminders.length - 1) * FLOATING_RESULT_GAP;
  const resultHeight = Math.min(
    FLOATING_RESULT_PADDING + rowsHeight + gapsHeight,
    FLOATING_RESULT_MAX_HEIGHT,
  );

  return frameHeight + resultHeight;
}
```

- [ ] **Step 4: Restore the published list surface classes and theme styles**

Use the published shadow while retaining all floating-window layout, drag, max-height, inert, and event-handler classes:

```tsx
className={`${
  isFloatingWindow ? "top-2" : "top-[12vh]"
} z-50 max-w-[520px] translate-y-0 gap-0 overflow-hidden rounded-xl p-0 shadow-[0_4px_8px_rgba(0,0,0,0.16)] sm:rounded-xl ${
  isFloatingWindow ? "max-h-[calc(100vh-16px)]" : ""
} ${isEditorOpen ? "pointer-events-none" : ""}`}
```

Restore the surface style:

```tsx
style={{
  backgroundColor: "var(--bg-primary)",
  border: "1px solid var(--border-color)",
  color: "var(--text-primary)",
}}
```

Restore the header divider and release tint:

```tsx
<div
  className="shrink-0 border-b border-[var(--border-color)]"
  data-reminder-list-header="true"
  style={{
    backgroundColor:
      "color-mix(in srgb, var(--bg-secondary) 24%, var(--bg-primary))",
  }}
>
```

- [ ] **Step 5: Run the list test and verify green**

Run:

```bash
pnpm exec vitest run src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx
```

Expected: all reminder-list tests PASS, including height `419`, scrolling, dragging, create-editor, and return-application behavior.

- [ ] **Step 6: Commit the list surface restoration**

```bash
git add src/renderer/src/features/reminders/components/reminder-list-dialog.tsx src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx
git commit -m "style: restore reminder list release surface"
```

---

### Task 2: Restore the Reminder Editor and Picker Styling

**Files:**
- Modify: `src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx:45-55,280-455,500-820`
- Test: `src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx:35-250`

**Interfaces:**
- Consumes: existing editor state, `presentation`, picker state, `resizeReminderEditorWindow(height)`, and release theme tokens.
- Produces: release-colored editor regions and bordered controls, plus `data-reminder-repeat-menu="true"` for the bounded upward repeat-menu contract.

- [ ] **Step 1: Add failing editor release-style assertions**

Extend `renders a compact layered editor with a clear form hierarchy` after the existing structural assertions:

```tsx
const heading = screen.getByRole("heading", { name: "新建提醒事项" });
const header = heading.parentElement;
const scheduleControls = settingsGroup.querySelectorAll<HTMLElement>(
  'button[data-reminder-setting-control="true"]',
);

expect(dialog).toHaveStyle({
  backgroundColor:
    "color-mix(in srgb, var(--bg-tertiary) 36%, var(--bg-primary))",
});
expect(header).toHaveClass(
  "h-11",
  "border-b",
  "border-[var(--border-color)]",
);
expect(titleInput).toHaveStyle({
  border: "1px solid var(--border-color)",
});
scheduleControls.forEach((control) => {
  expect(control).toHaveClass("border");
  expect(control).toHaveStyle({ borderColor: "var(--border-color)" });
});
```

Extend `uses an explicit primary action with the existing disabled rule`:

```tsx
const cancelButton = screen.getByRole("button", { name: "取消" });
const footer = saveButton.parentElement;

expect(cancelButton).toHaveAttribute("data-variant", "secondary");
expect(saveButton).toHaveAttribute("data-variant", "default");
expect(footer).toHaveClass(
  "border-t",
  "border-[var(--border-color)]",
  "py-3",
);
expect(footer).toHaveStyle({
  backgroundColor:
    "color-mix(in srgb, var(--bg-secondary) 38%, var(--bg-primary))",
});
```

Add a picker containment test after `uses normal weight for repeat menu options`:

```tsx
it("keeps the bordered repeat menu above its trigger", async () => {
  const user = userEvent.setup();
  render(<ReminderEditorDialog presentation="floating-window" />);

  await user.click(screen.getByRole("button", { name: /永不/ }));

  const menu = screen.getByTestId("reminder-repeat-menu");
  const options = menu.firstElementChild;

  expect(menu).toHaveClass(
    "bottom-[calc(100%+8px)]",
    "border",
    "shadow-lg",
  );
  expect(menu).toHaveStyle({
    backgroundColor: "var(--bg-primary)",
    borderColor: "var(--border-color)",
  });
  expect(options).toHaveClass("max-h-[240px]", "overflow-y-auto");
});
```

- [ ] **Step 2: Run the focused editor test and verify the expected failures**

Run:

```bash
pnpm exec vitest run src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx
```

Expected: FAIL on the current borderless header, input, controls, footer, ghost cancel action, missing repeat-menu test id, and downward repeat-menu placement.

- [ ] **Step 3: Restore the published editor shell, content spacing, and footer**

Keep the existing floating/non-floating `top` selection, `ref`, overlay handling, drag attributes, and nested dialog. Change the editor shadow to:

```tsx
className={`${
  isFloatingWindow ? "top-2" : "top-[calc(12vh+56px)]"
} z-[60] w-[calc(100%-32px)] max-w-[408px] translate-y-0 gap-0 overflow-visible rounded-xl p-0 shadow-[0_12px_28px_rgba(0,0,0,0.24)]`}
```

Restore the header and content spacing:

```tsx
<div
  className="flex h-11 items-center justify-between border-b border-[var(--border-color)] px-4"
  data-reminder-editor-drag-region={
    isFloatingWindow ? "true" : undefined
  }
>
```

```tsx
<div
  className="px-4 pb-4 pt-4"
  data-reminder-editor-interactive-region="true"
>
```

Restore the title input border while preserving the existing value, handlers, file label, and autofocus:

```tsx
className="h-9 px-3 py-1 text-sm focus:border-[var(--text-muted)] focus:ring-0"
style={{
  backgroundColor:
    "color-mix(in srgb, var(--bg-secondary) 72%, var(--bg-primary))",
  border: "1px solid var(--border-color)",
  color: "var(--text-primary)",
}}
```

Restore the footer:

```tsx
<div
  className="flex justify-end gap-2 rounded-b-xl border-t border-[var(--border-color)] px-4 py-3"
  data-reminder-editor-interactive-region="true"
  style={{
    backgroundColor:
      "color-mix(in srgb, var(--bg-secondary) 38%, var(--bg-primary))",
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

- [ ] **Step 4: Restore the release control and picker border vocabulary**

Replace `controlClassName` with:

```tsx
const controlClassName =
  "h-9 rounded-md border px-2.5 text-[13px] outline-none transition-colors focus:border-[var(--text-muted)] focus:ring-0";
```

For date, time, and repeat trigger styles, use:

```tsx
style={{
  backgroundColor: "var(--bg-secondary)",
  borderColor: "var(--border-color)",
  color: "var(--text-primary)",
}}
```

For date and time picker surfaces, restore `border` and `shadow-lg` and include `borderColor`:

```tsx
className="absolute right-0 top-[calc(100%+8px)] z-[80] rounded-lg border p-3 shadow-lg"
style={{
  backgroundColor: "var(--bg-primary)",
  borderColor: "var(--border-color)",
  color: "var(--text-primary)",
}}
```

Keep each picker's existing width and internal content; the time picker keeps `p-2` instead of the date picker's `p-3`.

- [ ] **Step 5: Restore the bounded upward repeat menu**

Replace the repeat-menu surface with:

```tsx
<div
  className="absolute bottom-[calc(100%+8px)] right-0 z-[80] w-[184px] rounded-xl border p-2 shadow-lg"
  data-testid="reminder-repeat-menu"
  style={{
    backgroundColor: "var(--bg-primary)",
    borderColor: "var(--border-color)",
    color: "var(--text-primary)",
  }}
>
  <div className="max-h-[240px] space-y-1 overflow-y-auto pr-1">
    {repeatOptions.map((option) => {
      const isSelected = option.value === value;
      return (
        <div key={option.value}>
          {option.separated ? (
            <div
              className="my-1 h-px"
              style={{ backgroundColor: "var(--border-color)" }}
            />
          ) : null}
          <button
            type="button"
            data-theme-control="true"
            data-selected={isSelected ? "true" : undefined}
            className="flex h-10 w-full items-center justify-between rounded-lg px-3 text-left text-[14px] font-normal"
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span>
            {isSelected ? (
              <span aria-hidden="true" className="text-[15px]">
                ✓
              </span>
            ) : null}
          </button>
        </div>
      );
    })}
  </div>
</div>
```

Do not change `openPicker`, `useCloseOnOutsideInteraction`, picker value handlers, or the floating editor's existing expanded-height requests.

- [ ] **Step 6: Run the editor test and verify green**

Run:

```bash
pnpm exec vitest run src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx
```

Expected: all editor tests PASS, including create/edit behavior, custom repeat, loss-of-focus dismissal, drag regions, native resize requests, and the restored repeat-menu placement.

- [ ] **Step 7: Commit the editor restoration**

```bash
git add src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx
git commit -m "style: restore reminder editor release styling"
```

---

### Task 3: Restore the Custom Repeat Release Surface

**Files:**
- Modify: `src/renderer/src/features/reminders/components/custom-repeat-dialog.tsx:15-25,75-230`
- Test: `src/renderer/src/features/reminders/components/custom-repeat-dialog.test.tsx:10-100`

**Interfaces:**
- Consumes: existing `open`, `value`, `onOpenChange`, and `onConfirm` props.
- Produces: release-styled custom repeat controls plus `data-testid="custom-repeat-unit-menu"`; all current close-hit-area and window-blur behavior remains intact.

- [ ] **Step 1: Add failing custom-repeat release-style assertions**

In `edits a custom repeat as one compact natural-language rule`, move the existing `unitPicker` declaration directly below `intervalInput`, then add the release-style assertions before user interaction:

```tsx
const heading = screen.getByRole("heading", { name: "自定义重复" });
const header = heading.parentElement;
const unitPicker = screen.getByRole("button", { name: "重复单位" });
const cancelButton = screen.getByRole("button", { name: "取消" });
const footer = cancelButton.parentElement;

expect(header).toHaveClass(
  "h-11",
  "border-b",
  "border-[var(--border-color)]",
);
expect(intervalInput).toHaveClass("w-20", "border");
expect(intervalInput).toHaveStyle({ borderColor: "var(--border-color)" });
expect(unitPicker).toHaveClass("border");
expect(unitPicker).toHaveStyle({ borderColor: "var(--border-color)" });
expect(unitPicker.parentElement?.parentElement).toHaveClass(
  "w-24",
  "shrink-0",
);
expect(cancelButton).toHaveAttribute("data-variant", "secondary");
expect(footer).toHaveClass(
  "border-t",
  "border-[var(--border-color)]",
  "py-3",
);
expect(footer).toHaveStyle({
  backgroundColor:
    "color-mix(in srgb, var(--bg-secondary) 38%, var(--bg-primary))",
});
```

Add this test after the close-button test:

```tsx
it("uses the published bordered repeat-unit menu", async () => {
  const user = userEvent.setup();

  render(
    <CustomRepeatDialog
      open
      onConfirm={vi.fn()}
      onOpenChange={vi.fn()}
    />,
  );

  await user.click(screen.getByRole("button", { name: "重复单位" }));

  const menu = screen.getByTestId("custom-repeat-unit-menu");
  expect(menu).toHaveClass("border", "shadow-[0_6px_12px_rgba(0,0,0,0.16)]");
  expect(menu).toHaveStyle({
    backgroundColor: "var(--bg-primary)",
    borderColor: "var(--border-color)",
  });
});
```

- [ ] **Step 2: Run the custom-repeat test and verify the expected failures**

Run:

```bash
pnpm exec vitest run src/renderer/src/features/reminders/components/custom-repeat-dialog.test.tsx
```

Expected: FAIL on the current borderless header, compact widths, borderless controls/footer, ghost cancel action, and missing unit-menu test id.

- [ ] **Step 3: Restore the custom-repeat shell, controls, and footer**

Replace `repeatControlClassName` with:

```tsx
const repeatControlClassName =
  "h-9 rounded-md border px-3 text-[13px] outline-none transition-colors focus:border-[var(--text-muted)] focus:ring-0";
```

Keep the enlarged current close button and current outside/blur behavior. Restore only the surrounding release styles:

```tsx
className="z-[71] w-[calc(100%-32px)] max-w-[336px] gap-0 overflow-visible rounded-xl p-0 shadow-[0_12px_28px_rgba(0,0,0,0.24)]"
```

```tsx
<div className="flex h-11 items-center justify-between border-b border-[var(--border-color)] px-4">
```

```tsx
<div className="px-4 py-4">
```

Restore the interval input width and border:

```tsx
className={`${repeatControlClassName} w-20 shrink-0 px-2 text-center font-semibold`}
style={{
  backgroundColor: "var(--bg-secondary)",
  borderColor: isValid ? "var(--border-color)" : "var(--danger-color)",
  color: "var(--text-primary)",
}}
```

Restore the unit wrapper and footer:

```tsx
<div className="w-24 shrink-0">
```

```tsx
<div
  className="flex justify-end gap-2 rounded-b-xl border-t border-[var(--border-color)] px-4 py-3"
  style={{
    backgroundColor:
      "color-mix(in srgb, var(--bg-secondary) 38%, var(--bg-primary))",
  }}
>
  <Dialog.Close asChild>
    <Button type="button" variant="secondary">
      取消
    </Button>
  </Dialog.Close>
  <Button type="button" disabled={!isValid} onClick={handleConfirm}>
    确定
  </Button>
</div>
```

- [ ] **Step 4: Restore the repeat-unit trigger and menu borders**

Use the release trigger classes and style:

```tsx
className={`${repeatControlClassName} flex w-full items-center justify-between gap-2 font-medium`}
style={{
  backgroundColor: "var(--bg-secondary)",
  borderColor: "var(--border-color)",
  color: "var(--text-primary)",
}}
```

Restore the release unit-menu surface and add the test id:

```tsx
<div
  className="absolute left-0 top-[calc(100%+6px)] z-[82] w-full rounded-lg border p-1.5 shadow-[0_6px_12px_rgba(0,0,0,0.16)]"
  data-testid="custom-repeat-unit-menu"
  style={{
    backgroundColor: "var(--bg-primary)",
    borderColor: "var(--border-color)",
    color: "var(--text-primary)",
  }}
>
```

- [ ] **Step 5: Run the custom-repeat and integrated editor tests**

Run:

```bash
pnpm exec vitest run src/renderer/src/features/reminders/components/custom-repeat-dialog.test.tsx src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx
```

Expected: both suites PASS; confirming or cancelling custom repeat still leaves the parent editor behavior unchanged.

- [ ] **Step 6: Commit the custom-repeat restoration**

```bash
git add src/renderer/src/features/reminders/components/custom-repeat-dialog.tsx src/renderer/src/features/reminders/components/custom-repeat-dialog.test.tsx
git commit -m "style: restore custom repeat release surface"
```

---

### Task 4: Activate the Main Application on macOS

**Files:**
- Modify: `src/main/window.ts:100-120`
- Test: `src/main/window.test.ts:10-80,145-170`

**Interfaces:**
- Consumes: Electron `app.focus({ steal: true })`, `BrowserWindow.restore()`, `show()`, `moveTop()`, and `focus()`.
- Produces: the existing `focusMainWindow(): void` API with explicit macOS activation and unchanged non-macOS behavior.

- [ ] **Step 1: Extend the Electron mocks and write the failing activation test**

Add `focusApp` to `electronMocks`:

```tsx
const electronMocks = vi.hoisted(() => ({
  showMessageBox: vi.fn(),
  showSaveDialog: vi.fn(),
  focusApp: vi.fn(),
}));
```

Add `moveTop` to `BrowserWindowMock`:

```tsx
moveTop: vi.fn(),
```

Expose the app focus mock:

```tsx
vi.mock("electron", () => ({
  BrowserWindow: BrowserWindowMock,
  app: { isPackaged: true, focus: electronMocks.focusApp },
  shell: { openExternal: vi.fn() },
  dialog: electronMocks,
}));
```

Replace `restores and focuses the latest main application window` with:

```tsx
it("activates and raises the latest main application window", () => {
  const win = createWindow();
  vi.mocked(win.isMinimized).mockReturnValue(true);

  focusMainWindow();

  expect(win.restore).toHaveBeenCalledOnce();
  expect(win.show).toHaveBeenCalledOnce();
  expect(win.focus).toHaveBeenCalledOnce();

  if (process.platform === "darwin") {
    expect(electronMocks.focusApp).toHaveBeenCalledOnce();
    expect(electronMocks.focusApp).toHaveBeenCalledWith({ steal: true });
    expect(win.moveTop).toHaveBeenCalledOnce();
    expect(electronMocks.focusApp.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(win.show).mock.invocationCallOrder[0],
    );
  } else {
    expect(electronMocks.focusApp).not.toHaveBeenCalled();
    expect(win.moveTop).not.toHaveBeenCalled();
  }
});
```

- [ ] **Step 2: Run the main-window test and verify failure**

Run:

```bash
pnpm exec vitest run src/main/window.test.ts
```

Expected on macOS: FAIL because `focusMainWindow()` does not call `app.focus({ steal: true })` or `win.moveTop()`.

- [ ] **Step 3: Add macOS activation without changing the public API**

Update `focusMainWindow()`:

```tsx
export function focusMainWindow(): void {
  const windows = [...mainWindows];
  const win = windows
    .toReversed()
    .find((candidate) => !candidate.isDestroyed());

  if (!win) return;

  // macOS 需要先激活应用进程，再恢复并提升主窗口，否则浮窗隐藏后焦点可能留在其他应用。
  if (isMac) app.focus({ steal: true });
  if (win.isMinimized()) win.restore();
  win.show();
  if (isMac) win.moveTop();
  win.focus();
}
```

Do not modify the reminder IPC handler, hide flow, application lifecycle, or main-window creation behavior.

- [ ] **Step 4: Run main-window and reminder-window tests**

Run:

```bash
pnpm exec vitest run src/main/window.test.ts src/main/reminder-window.test.ts
```

Expected: both suites PASS; macOS activation is covered and reminder-window blur, reuse, resize, prewarm, and layering behavior remains green.

- [ ] **Step 5: Commit the activation fix**

```bash
git add src/main/window.ts src/main/window.test.ts
git commit -m "fix: activate main window from reminder popup"
```

---

### Task 5: Verify the Integrated Result

**Files:**
- Verify all eight implementation and test files listed in the file map.
- Do not modify unrelated files to address pre-existing failures.

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: a formatted, type-safe, lint-clean, buildable reminder floating-window restoration with recorded macOS visual verification.

- [ ] **Step 1: Format only the scoped files**

Run:

```bash
pnpm exec oxfmt --write src/renderer/src/features/reminders/components/reminder-list-dialog.tsx src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx src/renderer/src/features/reminders/components/custom-repeat-dialog.tsx src/renderer/src/features/reminders/components/custom-repeat-dialog.test.tsx src/main/window.ts src/main/window.test.ts
```

Expected: exit code 0; no unrelated files are changed.

- [ ] **Step 2: Run all focused regression tests**

Run:

```bash
pnpm exec vitest run src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx src/renderer/src/features/reminders/components/custom-repeat-dialog.test.tsx src/renderer/src/styles/globals.test.ts src/main/window.test.ts src/main/reminder-window.test.ts
```

Expected: all reminder and window tests PASS. If `src/renderer/src/styles/globals.test.ts` still reports its known unrelated file-tree scrollbar assertion, report it as pre-existing and do not alter file-tree styles.

- [ ] **Step 3: Run repository-required verification**

Run each command independently:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Expected: each command exits with code 0. If a command exposes a pre-existing unrelated failure, record the exact file and assertion without changing it.

- [ ] **Step 4: Inspect scope and whitespace**

Run:

```bash
git diff --check HEAD~4..HEAD
git status --short
git diff --stat HEAD~4..HEAD
```

Expected: no whitespace errors; implementation changes are limited to the eight scoped files plus this approved plan/spec history.

- [ ] **Step 5: Perform macOS visual and interaction verification**

Run:

```bash
pnpm dev
```

Verify against the supplied release screenshots:

1. Open the reminder popup with the global shortcut.
2. Confirm the list uses the release background, outline, header divider, and stable transparent margin.
3. Confirm empty and populated result lists are fully visible and scroll after reaching the maximum height.
4. Open `新建提醒事项`; confirm the title input, date, time, repeat controls, footer divider, cancel button, and disabled save button retain visible release borders.
5. Open the repeat menu; confirm it opens above the trigger, remains inside the native window, and scrolls internally.
6. Open `自定义重复`; confirm release colors, dividers, bordered controls, and bordered footer actions while the editor remains open behind it.
7. Close nested layers and confirm the reminder list remains available.
8. Click `返回应用`; confirm Keep Notes becomes the active macOS application and its latest main window comes to the foreground.

Stop the development process after verification.

- [ ] **Step 6: Commit any formatting-only changes if required**

If Step 1 changed scoped files after the task commits:

```bash
git add src/renderer/src/features/reminders/components/reminder-list-dialog.tsx src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx src/renderer/src/features/reminders/components/custom-repeat-dialog.tsx src/renderer/src/features/reminders/components/custom-repeat-dialog.test.tsx src/main/window.ts src/main/window.test.ts
git commit -m "style: format reminder floating window restoration"
```

If formatting produced no diff, skip this commit.
