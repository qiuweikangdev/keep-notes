# Confirm Dialog Icon Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every confirmation dialog title a semantic icon and align move and shortcut deletion confirmations with the established delete dialog style.

**Architecture:** Keep visual semantics inside the shared `ConfirmDialog` component. It maps each existing variant to a default Lucide icon and accepts an optional caller-supplied icon for actions, such as moving a file, that have a more specific semantic meaning. Existing callers remain source-compatible.

**Tech Stack:** React 19, TypeScript, Radix UI Dialog, lucide-react, Vitest, Testing Library.

## Global Constraints

- Preserve the existing dialog dimensions, theme variables, focus behavior, backdrop, button variants, and confirm-handler flow.
- Use existing Lucide icons and project theme variables. Do not add dependencies.
- Keep core implementation comments in Chinese.
- Use test-driven development and run `pnpm typecheck`, `pnpm lint`, and `pnpm build` before handoff.

---

## File Structure

- `src/renderer/src/components/ui/confirm-dialog.tsx`: owns default icon resolution and the optional semantic icon API.
- `src/renderer/src/components/ui/confirm-dialog.test.tsx`: verifies warning, danger, default, and caller-provided title icons.
- `src/renderer/src/features/file-tree/components/file-tree.tsx`: gives the virtualized-tree move confirmation a folder-move icon.
- `src/renderer/src/features/file-tree/components/tree-node.tsx`: gives the recursive-tree move confirmation the same folder-move icon.
- `src/renderer/src/features/settings/components/shortcuts-settings.tsx`: declares shortcut binding deletion as a dangerous action.

### Task 1: Standardize the shared confirmation dialog

**Files:**

- Modify: `src/renderer/src/components/ui/confirm-dialog.tsx`
- Modify: `src/renderer/src/components/ui/confirm-dialog.test.tsx`

**Interfaces:**

- Consumes: existing `ConfirmDialogVariant` values: `"default" | "warning" | "danger"`.
- Produces: `ConfirmDialog` accepts `icon?: LucideIcon`; omitting it renders `CircleAlert`, `TriangleAlert`, or `Trash2` according to `variant`.

- [ ] **Step 1: Write failing component tests**

Replace the single warning-only assertion with tests that demand a title icon for all variants and an override icon:

```tsx
import { CircleAlert, FolderInput, Trash2, TriangleAlert } from "lucide-react";

it("renders a default alert icon when no semantic icon is supplied", () => {
  render(<ConfirmDialog open onOpenChange={vi.fn()} title="确认操作" onConfirm={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "确认操作" }).querySelector("svg.lucide-circle-alert")).toBeInTheDocument();
});

it("uses a trash icon for danger confirmations", () => {
  render(<ConfirmDialog open onOpenChange={vi.fn()} title="确认删除" variant="danger" onConfirm={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "确认删除" }).querySelector("svg.lucide-trash-2")).toBeInTheDocument();
});

it("uses a warning icon for irreversible discard confirmations", () => {
  render(<ConfirmDialog open onOpenChange={vi.fn()} title="确认放弃更改" variant="warning" onConfirm={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "确认放弃更改" }).querySelector("svg.lucide-triangle-alert")).toBeInTheDocument();
});

it("uses a caller-supplied semantic icon", () => {
  render(<ConfirmDialog open onOpenChange={vi.fn()} title="确认移动" icon={FolderInput} onConfirm={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "确认移动" }).querySelector("svg.lucide-folder-input")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm vitest run src/renderer/src/components/ui/confirm-dialog.test.tsx`

Expected: FAIL because the default variant does not render `CircleAlert` and `ConfirmDialogProps` has no `icon` property.

- [ ] **Step 3: Write minimal implementation**

In `confirm-dialog.tsx`, import `CircleAlert` and `type LucideIcon`, add `icon?: LucideIcon` to `ConfirmDialogProps`, and resolve the component before rendering the title:

```tsx
const defaultIcon = isDanger
  ? Trash2
  : isWarning
    ? TriangleAlert
    : CircleAlert;
const TitleIcon = icon ?? defaultIcon;
const titleIconColor = isDanger || isWarning
  ? "var(--danger-color)"
  : "var(--text-muted)";
```

Render `<TitleIcon aria-hidden="true" className="h-4 w-4 shrink-0" style={{ color: titleIconColor }} />` before `{title}`. Preserve the existing danger and warning colors, and do not change dialog or button markup outside the title icon.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm vitest run src/renderer/src/components/ui/confirm-dialog.test.tsx`

Expected: PASS, with four passing tests.

- [ ] **Step 5: Commit the task**

```bash
git add src/renderer/src/components/ui/confirm-dialog.tsx src/renderer/src/components/ui/confirm-dialog.test.tsx
git commit -m "feat: standardize confirmation dialog icons"
```

### Task 2: Apply semantic icons at the affected call sites

**Files:**

- Modify: `src/renderer/src/features/file-tree/components/file-tree.tsx`
- Modify: `src/renderer/src/features/file-tree/components/tree-node.tsx`
- Modify: `src/renderer/src/features/settings/components/shortcuts-settings.tsx`

**Interfaces:**

- Consumes: `ConfirmDialog` `icon?: LucideIcon` property from Task 1.
- Produces: both move confirmations pass `FolderInput`; shortcut binding deletion passes `variant="danger"`.

- [ ] **Step 1: Retain the shared API contract test**

Keep the caller-supplied `FolderInput` test from Task 1 as the executable contract for both move dialogs. Add a destructive button assertion to the danger test:

```tsx
expect(screen.getByRole("button", { name: "确认" })).toHaveAttribute(
  "data-variant",
  "destructive",
);
```

- [ ] **Step 2: Verify the shared contract is green**

Run: `pnpm vitest run src/renderer/src/components/ui/confirm-dialog.test.tsx`

Expected: PASS after Task 1 completes.

- [ ] **Step 3: Update the three callers**

Add `FolderInput` to each existing Lucide import in the two file-tree components. Add `icon={FolderInput}` to the virtualized-tree move confirmation. In `tree-node.tsx`, pass `icon={confirmState.type === "move" ? FolderInput : undefined}`. In `shortcuts-settings.tsx`, change the variant expression to:

```tsx
variant={
  confirmState.type === "delete" || confirmState.type === "resetAll"
    ? "danger"
    : "default"
}
```

- [ ] **Step 4: Run focused verification**

Run: `pnpm vitest run src/renderer/src/components/ui/confirm-dialog.test.tsx`

Expected: PASS, demonstrating the shared icon and destructive-button contract used by all updated callers.

- [ ] **Step 5: Commit the task**

```bash
git add src/renderer/src/features/file-tree/components/file-tree.tsx src/renderer/src/features/file-tree/components/tree-node.tsx src/renderer/src/features/settings/components/shortcuts-settings.tsx
git commit -m "fix: align move and shortcut confirmation dialogs"
```

### Task 3: Run repository verification

**Files:**

- Verify only: modified files from Tasks 1 and 2.

**Interfaces:**

- Consumes: completed shared component and caller updates.
- Produces: verified, formatted, type-safe renderer changes.

- [ ] **Step 1: Format only the changed TypeScript files**

Run: `pnpm exec oxfmt --write src/renderer/src/components/ui/confirm-dialog.tsx src/renderer/src/components/ui/confirm-dialog.test.tsx src/renderer/src/features/file-tree/components/file-tree.tsx src/renderer/src/features/file-tree/components/tree-node.tsx src/renderer/src/features/settings/components/shortcuts-settings.tsx`

Expected: formatter exits successfully without changing unrelated files.

- [ ] **Step 2: Run the complete required checks**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all commands exit with status 0.

- [ ] **Step 3: Review the final diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only the planned source, test, and documentation files are present.

