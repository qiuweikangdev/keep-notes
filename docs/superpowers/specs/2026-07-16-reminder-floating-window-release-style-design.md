# Reminder Floating Window Release Style Design

## Goal

Restore the published Keep Notes reminder styling inside the new standalone reminder list and editor windows without changing their window architecture, preload behavior, reminder data flow, or interaction model. Correct the existing macOS return-to-application activation failure as the only behavioral fix.

## Confirmed Direction

The standalone reminder windows remain in place. The implementation must reuse the published release's theme-derived colors, visible borders, section dividers, control styling, and action styling rather than introducing a new visual direction. The supplied release screenshots and the source immediately before commit `c0de14d` are the visual references.

## Scope

The change may update these focused areas:

- `src/renderer/src/features/reminders/components/reminder-list-dialog.tsx`
- `src/renderer/src/features/reminders/components/reminder-list-dialog.test.tsx`
- `src/renderer/src/features/reminders/components/reminder-editor-dialog.tsx`
- `src/renderer/src/features/reminders/components/reminder-editor-dialog.test.tsx`
- `src/renderer/src/features/reminders/components/custom-repeat-dialog.tsx`
- `src/renderer/src/features/reminders/components/custom-repeat-dialog.test.tsx`
- `src/main/window.ts`
- `src/main/window.test.ts`

Shared reminder persistence, scheduling, filtering, repeat calculations, notifications, IPC channel names, global shortcut registration, editor-window prewarming, and native window ownership remain unchanged.

## Visual Contract

### Reminder List Window

- Keep the compact command-palette structure, search behavior, tabs, result rows, return button, drag regions, and content-sized native window behavior.
- Restore the published list surface color to `var(--bg-primary)`.
- Restore the full `1px solid var(--border-color)` outline and the divider below the search and tab header.
- Restore the published header tint: `color-mix(in srgb, var(--bg-secondary) 24%, var(--bg-primary))`.
- Keep a stable transparent margin between the rounded surface and the native transparent window on every side.
- Keep the result area independently scrollable after it reaches its maximum height. Empty and populated states must not be clipped by the native window bounds.
- Preserve existing theme tokens across light, dark, Nord, Dracula, and Solarized themes; do not add fixed dark-only colors.

### Reminder Editor Window

- Preserve the separate prewarmed native editor window and its relationship to the reminder list window.
- Restore the published editor surface color: `color-mix(in srgb, var(--bg-tertiary) 36%, var(--bg-primary))`.
- Restore the header divider and the footer divider.
- Restore the published title input background and visible `1px` border.
- Restore visible borders on date, time, and repeat controls using `var(--border-color)`.
- Restore the footer tint: `color-mix(in srgb, var(--bg-secondary) 38%, var(--bg-primary))`.
- Render both `取消` and `保存提醒` with the shared bordered button vocabulary. The disabled save action must retain a readable border while remaining visibly disabled.
- Retain the existing drag-only header and non-draggable interactive regions.
- Size the native window from the rendered editor content plus its transparent outer margin. Avoid replacing this with new platform-specific hardcoded layout offsets.

### Picker and Custom Repeat Layers

- Restore visible borders and published theme colors on date, time, repeat, and repeat-unit menus.
- Keep picker interaction, selected values, keyboard behavior, and outside-dismiss behavior unchanged.
- Ensure every picker stays inside the editor native window. A picker may open above or below its trigger based on available room, and a long option list may scroll internally, but it must not be cut off by the transparent native-window viewport.
- Restore the custom repeat dialog's published surface color, header divider, footer divider, bordered interval and unit controls, and bordered `取消` and `确定` actions.
- Keep the custom repeat dialog centered over the reminder editor with its existing restrained overlay. Opening or closing it must not close the editor or reminder list.

## Window Activation Correction

The `返回应用` control must keep its current renderer and IPC contract. On macOS, returning to the application must explicitly activate Keep Notes before restoring, showing, raising, and focusing the latest non-destroyed main window. Other platforms keep their current restore/show/focus behavior. The reminder floating window is then hidden through the existing flow.

This correction must not create a new main window, change application lifecycle rules, or alter reminder-window blur handling.

## Accessibility

- Preserve Radix dialog titles, descriptions, and accessible names.
- Keep search, create, return, close, picker, cancel, confirm, and save controls keyboard reachable.
- Keep visible focus feedback based on `--accent-color`.
- Preserve readable disabled states and theme contrast.
- Keep background layers inert whenever an existing nested-dialog flow already requires it.

## Testing Strategy

Follow test-driven development with focused regression coverage:

- Reminder list tests verify the release surface color, visible outline, header divider, and intact scroll-region contract.
- Reminder editor tests verify the release surface color, header/footer dividers, bordered title and schedule controls, and bordered footer actions.
- Picker tests verify that repeat options use a bounded scroll area and a placement that remains inside the editor viewport.
- Custom repeat tests verify the release surface, dividers, bordered controls, and that closing the nested dialog keeps the editor open.
- Main-window tests verify that macOS activation occurs before the existing restore/show/focus sequence while non-macOS behavior remains unchanged.
- Existing reminder tests continue to prove create, edit, save, cancel, filtering, repeat selection, custom repeat, prewarming, resizing, dragging, and dismissal behavior.

After focused tests, run:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`

Perform a final macOS visual check against the supplied release screenshots when the Electron UI is available. Existing unrelated test failures must be reported separately rather than changed as part of this work.

## Out of Scope

- Reverting the standalone native reminder windows.
- Changing reminder fields, validation, persistence, scheduling, or notification semantics.
- Changing the global reminder shortcut or its registration lifecycle.
- Redesigning the published visual language.
- Introducing new dependencies, new theme tokens, or unrelated shared-component refactors.
- Fixing unrelated existing test failures.
