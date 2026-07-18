# Settings Dialog Visual Alignment Design

## Summary

Polish the Settings dialog so it uses the same visual language as the existing Git operations dialog while preserving every current setting, business behavior, and responsive interaction. The Settings dialog remains wider because it contains persistent navigation, but its frame, title bar, surface hierarchy, close action, spacing density, and selected states will feel like part of the same desktop application.

## Goals

- Align the Settings dialog frame and title bar with the Git operations dialog.
- Preserve the current two-column Settings information architecture.
- Improve navigation density, selected-state clarity, and keyboard semantics.
- Preserve dragging, eight-direction resizing, viewport safety, and geometry reset behavior.
- Preserve all existing settings logic, update flows, export menus, and theme support.
- Keep the change limited to the Settings dialog and its focused tests.

## Non-goals

- Change the Settings categories, labels, order, or individual controls.
- Change how settings are saved or loaded.
- Refactor the Git operations dialog.
- Extract a new shared dialog framework.
- Change shared theme tokens or introduce hard-coded theme colors.
- Add decorative motion or redesign unrelated dialogs.

## Current State

The Settings dialog uses the shared Radix-based `DialogContent`, but it keeps that component's default primary background, border, large title padding, and built-in close button. Its navigation starts below a tall, unseparated header and uses a one-off selected-row treatment.

The Git operations dialog uses a compact bordered title bar with a leading icon, an explicit close button, a secondary outer surface, and primary inner content surfaces. Its controls and section boundaries are denser and better match the application's restrained desktop-product register.

The mismatch is primarily a one-off implementation in Settings rather than a missing design token. The existing theme variables and component vocabulary are sufficient for the redesign.

## Considered Approaches

### Selected: align Settings locally

Update only the Settings dialog markup and focused tests. Reuse the Git dialog's established visual decisions without changing Git code or adding an abstraction.

This is the smallest complete change: it resolves the visible drift while keeping regression risk low.

### Alternative: extract a shared large-dialog frame

Create a shared frame component and migrate both Settings and Git. This could improve future consistency, but it would broaden the task into a structural refactor and risk changing the mature Git interaction surface.

### Alternative: change only the Settings title bar

Make the header compact and add an icon. This has the lowest code impact, but the navigation and content surfaces would still use a different hierarchy, leaving the dialog visibly unfinished.

## Visual Design

### Dialog frame

- Keep the current preferred Settings width and responsive viewport constraints.
- Keep the existing resizable flex-column geometry.
- Use the Git dialog's secondary outer surface, rounded-xl silhouette, and strong modal shadow.
- Remove the shared dialog's default visible border so the frame does not combine a decorative border with a large shadow.
- Keep the existing modal overlay behavior and nested Portal protections.

### Title bar

- Replace the tall Settings heading area with a compact horizontal title bar using 16 px padding.
- Add a 20 px settings icon before the title, using the muted text token.
- Render the title at the same medium-weight, 14 px scale as the Git dialog title.
- Add a bottom divider using `--border-color`.
- Disable the shared built-in close control and render an explicit icon button aligned with the Git dialog.
- Stop pointer propagation on the close control so it never starts a drag session.
- Retain the title bar as the shared dialog drag handle.

### Navigation

- Keep all six existing destinations and their icons.
- Reduce excess vertical padding and use the established 4 px spacing rhythm between rows.
- Keep the responsive 180/220 px width behavior and independent scrolling.
- Use `--active-bg` plus `--accent-color` for the selected destination; inactive destinations use `--text-primary` and hover feedback from the existing global control vocabulary.
- Keep the trailing chevron only on the current destination.
- Add `aria-current="page"` to the selected navigation button.
- Use `data-selected` for selected-state stability under the existing global button hover rules.

### Content surface

- Give the right content panel a `--bg-primary` background, matching the Git dialog's primary work surface inside its secondary frame.
- Keep independent vertical scrolling and `min-width: 0` behavior.
- Preserve current content padding closely enough that individual setting rows do not need to change.
- Keep every current setting control, description, loading state, and section boundary unchanged.

## Component and Data Flow

`SettingsModal` remains the only production component changed. It continues to read open state, editor appearance, theme state, update state, export state, external applications, and zoom values through the existing stores and Electron preload APIs.

The redesign changes only presentational markup and accessibility attributes around those controls. No state shape, effect dependency, IPC call, save timing, or event flow changes.

The existing `DialogContent`, `useResizableDialog`, and `DialogResizeHandles` APIs remain unchanged. The Settings dialog uses `showCloseButton={false}` and renders `Dialog.Close` inside its custom title bar.

## Accessibility and Interaction

- Keep `Dialog.Title` and the existing screen-reader description.
- Give the explicit close button an accessible name.
- Mark the active navigation destination with `aria-current="page"`.
- Preserve visible selected, hover, disabled, and focus behavior through existing tokens and shared browser focus handling.
- Preserve keyboard activation for all navigation buttons and the close control.
- Preserve reduced-motion behavior already applied globally to loading indicators.
- Keep text and icon colors token-based so contrast follows every supported theme.

## Edge Cases

- Small Electron windows continue to cap the dialog at the viewport minus 16 px margins.
- Both navigation and content remain independently scrollable when the dialog is short.
- Export dropdown Portal interactions continue to avoid accidental dialog closure.
- Closing and reopening continues to reset user-modified dialog geometry.
- The close control remains clickable without initiating title-bar dragging.
- Long localized navigation labels remain constrained by the existing responsive navigation width rather than expanding the dialog.

## Testing Strategy

Update the focused Settings modal test suite before changing production markup.

Tests will verify:

- The dialog retains its current responsive width, height, flex layout, and resize handles.
- The dialog uses the secondary frame surface, rounded-xl shape, modal shadow, and no visible frame border.
- The title bar contains the settings icon, title, divider, drag handle, and explicit close button.
- The active navigation destination exposes `aria-current="page"`, selected styling hooks, and the accent token.
- The content panel uses the primary surface token and remains independently scrollable.
- Existing metadata, update, export, and responsive behavior tests continue to pass.

Repository verification will run:

- The focused Settings modal Vitest suite.
- `pnpm typecheck`.
- `pnpm lint`.
- `pnpm build`.

## Files Expected to Change

- `src/renderer/src/features/settings/components/settings-modal.tsx`
- `src/renderer/src/features/settings/components/settings-modal.test.tsx`

No shared component, store, IPC, preload, or theme file should change.

## Acceptance Criteria

1. The Settings and Git operations dialogs clearly share the same frame and title-bar vocabulary.
2. The Settings dialog keeps its wider two-column layout and all existing categories and controls.
3. The selected Settings destination is visually clear and semantically exposed to assistive technology.
4. The content panel reads as a primary work surface inside a secondary dialog frame across all supported themes.
5. Dragging, resizing, viewport constraints, reopening reset, and nested dropdown behavior are unchanged.
6. Focused tests, TypeScript checks, linting, and the production build pass.
