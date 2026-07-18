# Settings Dialog Visual Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the Settings dialog with the established Git operations dialog visual language without changing settings behavior or information architecture.

**Architecture:** Keep the work local to `SettingsModal`: replace its one-off dialog chrome with the existing Git dialog frame hierarchy, then expose the active navigation state semantically. Preserve the current Radix dialog, stores, Electron API calls, resizing hook, Portal protections, and content components.

**Tech Stack:** Electron, Vite, React 19, TypeScript, Radix Dialog, Tailwind CSS, Lucide React, Zustand, Vitest, Testing Library

## Global Constraints

- Use the existing local `node_modules`; do not install, delete, move, prune, or recreate dependencies.
- Do not modify `package.json` or `pnpm-lock.yaml`.
- Keep every Settings category, label, order, control, state transition, IPC call, and save behavior unchanged.
- Keep the preferred `780 × 640` responsive geometry, drag handle, eight resize handles, viewport margins, geometry reset, and nested Portal protections unchanged.
- Use only existing CSS custom properties for colors; support Light, Dark, Nord, Dracula, and Solarized themes.
- Limit production changes to `src/renderer/src/features/settings/components/settings-modal.tsx` and focused test changes to its colocated test file.
- Write Chinese comments only when core method logic needs a comment; this presentational change should not add explanatory comments.
- Use Oxfmt/Oxlint and English Conventional Commit messages.

---

## File Map

- `src/renderer/src/features/settings/components/settings-modal.tsx`: Owns the Settings dialog frame, title bar, navigation, content surface, and all existing Settings behavior. Modify only its presentation and accessibility attributes.
- `src/renderer/src/features/settings/components/settings-modal.test.tsx`: Owns focused regression coverage for dialog geometry, chrome, surface hierarchy, navigation semantics, and existing Settings behavior.

No new runtime file or shared abstraction is needed.

### Task 1: Align the Settings dialog chrome and navigation

**Files:**

- Modify: `src/renderer/src/features/settings/components/settings-modal.tsx:1-852`
- Test: `src/renderer/src/features/settings/components/settings-modal.test.tsx:1-285`

**Interfaces:**

- Consumes: `DialogContent.showCloseButton`, `Dialog.Root`, `Dialog.Title`, `Dialog.Description`, `Dialog.Close`, `useResizableDialog`, `DialogResizeHandles`, existing theme CSS variables, and `SettingsTab` state.
- Produces: an explicit `关闭设置` dialog control, `data-testid="settings-dialog-icon"`, `aria-current="page"` and `data-selected="true"` on the active navigation button, and `--bg-primary` on the content surface.
- Preserves: all existing store selectors, effects, Electron preload calls, control event handlers, dropdown Portal behavior, resize behavior, and content-rendering branches.

- [ ] **Step 1: Add failing tests for the unified dialog frame and active navigation**

Insert these tests after `keeps the dialog inside small application windows` in `settings-modal.test.tsx`:

```tsx
it("uses the Git dialog visual language for its frame and title bar", () => {
  render(<SettingsModal />);

  const dialog = screen.getByRole("dialog");
  const dragHandle = dialog.querySelector<HTMLElement>(
    "[data-dialog-drag-handle]",
  );

  expect(dialog).toHaveClass("rounded-xl", "shadow-2xl");
  expect(dialog).toHaveStyle({
    backgroundColor: "var(--bg-secondary)",
    border: "none",
  });
  expect(dragHandle).toHaveStyle({
    borderBottom: "1px solid var(--border-color)",
  });
  expect(screen.getByTestId("settings-dialog-icon")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "关闭设置" }),
  ).toBeInTheDocument();
});

it("uses semantic selected navigation and a primary content surface", () => {
  render(<SettingsModal />);

  const appearanceButton = screen.getByRole("button", { name: /外观/ });
  const aboutButton = screen.getByRole("button", { name: /关于/ });

  expect(appearanceButton).toHaveAttribute("aria-current", "page");
  expect(appearanceButton).toHaveAttribute("data-selected", "true");
  expect(appearanceButton).toHaveStyle({
    backgroundColor: "var(--active-bg)",
    color: "var(--accent-color)",
  });
  expect(screen.getByTestId("settings-content")).toHaveStyle({
    backgroundColor: "var(--bg-primary)",
  });

  fireEvent.click(aboutButton);

  expect(appearanceButton).not.toHaveAttribute("aria-current");
  expect(appearanceButton).not.toHaveAttribute("data-selected");
  expect(aboutButton).toHaveAttribute("aria-current", "page");
  expect(aboutButton).toHaveAttribute("data-selected", "true");
});
```

- [ ] **Step 2: Run the focused test and verify the new assertions fail**

Run:

```bash
pnpm test src/renderer/src/features/settings/components/settings-modal.test.tsx
```

Expected: FAIL because the dialog does not yet have `rounded-xl`, `shadow-2xl`, the secondary surface, explicit Settings icon/close button, or semantic navigation state.

- [ ] **Step 3: Add the title-bar icons**

Extend the existing `lucide-react` import in `settings-modal.tsx` with aliases that cannot conflict with the component name:

```tsx
import {
  Palette,
  ChevronRight,
  ChevronDown,
  Keyboard,
  Bell,
  Mail,
  FileOutput,
  Info,
  RefreshCw,
  ExternalLink,
  XCircle,
  Download,
  Loader2,
  Settings as SettingsIcon,
  X,
} from "lucide-react";
```

- [ ] **Step 4: Replace the Settings dialog frame and title bar presentation**

Keep all existing `DialogContent` interaction handlers and children, but update its presentation props and replace the current `DialogHeader` block with this structure:

```tsx
<DialogContent
  ref={contentRef}
  showCloseButton={false}
  overlayStyle={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
  className="flex h-[min(640px,calc(100vh-32px))] max-h-none w-[min(780px,calc(100vw-32px))] max-w-none flex-col gap-0 overflow-visible rounded-xl p-0 shadow-2xl"
  style={{
    backgroundColor: "var(--bg-secondary)",
    border: "none",
    color: "var(--text-primary)",
  }}
  onInteractOutside={(event) => {
    if (isExportSettingsDropdownEvent(event)) {
      event.preventDefault();
    }
  }}
  onFocusOutside={(event) => {
    if (isExportSettingsDropdownEvent(event)) {
      event.preventDefault();
    }
  }}
>
  <DialogHeader
    data-dialog-drag-handle
    {...dragHandleProps}
    className="flex-shrink-0 select-none space-y-0"
    style={{ borderBottom: "1px solid var(--border-color)" }}
  >
    <div className="flex items-center justify-between p-4">
      <div className="flex items-center gap-2">
        <SettingsIcon
          data-testid="settings-dialog-icon"
          className="h-5 w-5"
          style={{ color: "var(--text-muted)" }}
          aria-hidden="true"
        />
        <Dialog.Title
          className="text-sm font-medium leading-5"
          style={{ color: "var(--text-primary)" }}
        >
          设置
        </Dialog.Title>
      </div>
      <Dialog.Close asChild>
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          data-theme-control="true"
          className="rounded-lg p-1"
          style={{ color: "var(--text-muted)" }}
          aria-label="关闭设置"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </Dialog.Close>
    </div>
    <Dialog.Description className="sr-only">
      配置应用外观、快捷键、应用通知、导出选项和关于信息。
    </Dialog.Description>
  </DialogHeader>
```

Do not change the existing Portal-event comments or logic when moving these props.

- [ ] **Step 5: Align navigation density, selected state, and content surface**

Replace the navigation wrapper, navigation button, and content wrapper with the following presentation while preserving `settingsMenuItems.map`, `setActiveTab`, icon rendering, and `renderContent()`:

```tsx
<div
  data-testid="settings-navigation"
  className="w-[180px] flex-shrink-0 overflow-y-auto p-2 sm:w-[220px]"
  style={{ borderRight: "1px solid var(--border-color)" }}
>
  {settingsMenuItems.map((item) => {
    const isActive = activeTab === item.id;
    const Icon = item.icon;
    return (
      <button
        type="button"
        key={item.id}
        onClick={() => setActiveTab(item.id)}
        aria-current={isActive ? "page" : undefined}
        data-selected={isActive ? "true" : undefined}
        className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left"
        style={{
          backgroundColor: isActive ? "var(--active-bg)" : "transparent",
          color: isActive ? "var(--accent-color)" : "var(--text-primary)",
        }}
      >
        <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium">{item.label}</span>
        {isActive ? (
          <ChevronRight className="ml-auto h-3 w-3 flex-shrink-0" />
        ) : null}
      </button>
    );
  })}
</div>

<div
  data-testid="settings-content"
  className="min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
  style={{ backgroundColor: "var(--bg-primary)" }}
>
  {renderContent()}
</div>
```

Delete the obsolete manual `onMouseEnter` and `onMouseLeave` mutations; the global button vocabulary already provides inactive hover feedback, and `data-selected` protects the active row from that override.

- [ ] **Step 6: Format only the changed runtime and test files**

Run:

```bash
pnpm exec oxfmt --write src/renderer/src/features/settings/components/settings-modal.tsx src/renderer/src/features/settings/components/settings-modal.test.tsx
```

Expected: both files are formatted with the repository Oxc configuration; unrelated files remain unchanged.

- [ ] **Step 7: Run the focused Settings test suite**

Run:

```bash
pnpm test src/renderer/src/features/settings/components/settings-modal.test.tsx
```

Expected: PASS for the new chrome/navigation tests and every pre-existing Settings regression test.

- [ ] **Step 8: Run repository verification**

Run each command independently:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all commands exit with code 0 and do not modify `pnpm-lock.yaml`.

- [ ] **Step 9: Verify the real Electron interaction path**

Run:

```bash
pnpm dev
```

In the application:

1. Open Git operations and Settings sequentially and compare overlay opacity, secondary frame surface, rounded silhouette, shadow, 16 px title-bar padding, icon/title alignment, divider, and close control.
2. In Settings, visit every navigation destination and confirm only the active row uses the active background and accent color.
3. Switch through Light, Dark, Nord, Dracula, and Solarized and confirm the frame/content hierarchy remains readable without hard-coded light-theme artifacts.
4. Resize and drag Settings, shrink the Electron window, reopen the dialog, and confirm viewport safety and default-geometry reset.
5. Open the Export destination, use its dropdown, and confirm the nested Portal does not close the Settings dialog.
6. Close Settings with the explicit close button and confirm it does not initiate dragging.

Expected: Settings and Git look related, all existing Settings controls remain usable, and there are no renderer console errors.

- [ ] **Step 10: Review the final diff and commit the implementation**

Run:

```bash
git diff --check
git diff -- src/renderer/src/features/settings/components/settings-modal.tsx src/renderer/src/features/settings/components/settings-modal.test.tsx
git status --short
```

Expected: only the two planned implementation files are changed; the diff contains no whitespace errors or unrelated formatting.

Commit:

```bash
git add src/renderer/src/features/settings/components/settings-modal.tsx src/renderer/src/features/settings/components/settings-modal.test.tsx
git commit -m "style: align settings dialog with git operations"
```

Expected: one focused English Conventional Commit containing the tested Settings dialog visual alignment.
