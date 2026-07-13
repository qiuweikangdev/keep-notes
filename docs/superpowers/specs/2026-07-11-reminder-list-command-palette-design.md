# Reminder List Command Palette Design

## Goal

Restyle the reminder list dialog as a compact command-palette surface that matches the existing global search modal. The result must feel simpler, denser, and consistent with Keep Notes while preserving all reminder behaviors.

## Scope

This change covers only the reminder list dialog in `src/renderer/src/features/reminders/components/reminder-list-dialog.tsx` and its focused component tests. Reminder persistence, filtering semantics, editor behavior, notification behavior, and context-menu actions remain unchanged.

## Visual Structure

The dialog uses the global search modal as its visual reference:

1. A compact, top-centered surface approximately 520 px wide.
2. No visible title row, bell icon, large header, or decorative divider. The accessible dialog title and description remain available to assistive technology.
3. A 36 px search row at the top with a leading search icon, a borderless input, and a compact trailing plus button labeled "新建提醒事项".
4. A compact three-tab row directly below the search row. The tabs remain "今天", "完成", and "全部" in that order.
5. A dense scrollable result list below the tabs. Each reminder remains a single interactive row with title as primary information and file name, scheduled time, and repeat rule as secondary information.
6. A short inline empty state replaces the existing large empty panel.

The surface continues to use the existing theme tokens: `--bg-primary`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border-color`, `--hover-bg`, and `--active-bg`.

## Interaction

- Opening the dialog resets the query and selects the "今天" tab, as it does today.
- Typing filters reminders by title or file name using the current filtering logic.
- Clicking the plus button opens the standalone reminder editor without closing the list.
- Selecting a tab changes the visible reminder set without changing persistence.
- Right-click actions for edit, complete, and delete remain available.
- Escape, outside click, nested editor handling, and nested context-menu handling preserve their current behavior.
- The default close button is removed visually because the command-palette pattern relies on Escape and outside click. Accessible dismissal behavior remains intact.

## Component Boundaries

The existing `ReminderListDialog` and `ReminderListItem` boundaries remain. No shared command-palette abstraction is introduced because the global search modal has different selection and keyboard-navigation behavior; extracting a common component would expand the change beyond the requested visual alignment.

## Accessibility

- Keep the Radix dialog semantics, accessible title, and description.
- Keep an explicit accessible label and tooltip on the plus button.
- Maintain visible focus styles for the search input, tabs, result rows, and plus button.
- Preserve readable contrast by relying on the established theme tokens.

## Testing and Verification

Update focused tests to verify:

- the compact command-palette shell and search row are rendered;
- the plus button still opens the reminder editor;
- the tab order remains today, completed, all;
- the list uses a compact bounded scroll region instead of the fixed 250 px panel;
- the empty state is compact;
- existing context-menu and dismissal behavior remains intact.

Run the focused reminder list test, followed by `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

## Out of Scope

- Changing reminder filtering, sorting, repeat rules, storage, or IPC.
- Adding new keyboard selection behavior to the reminder list.
- Restyling the reminder editor, notification toast, or custom repeat dialog.
- Refactoring the global search modal or introducing a shared modal framework.
