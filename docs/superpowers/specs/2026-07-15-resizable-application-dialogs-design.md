# Resizable Application Dialogs Design

## Summary

Improve the Settings and Git dialogs so they match the existing diff dialog interaction model: users can drag the title bar, resize from all edges and corners, and keep the dialog inside the application viewport. Every dialog opening restores its default centered size and position. The Settings dialog also becomes responsive enough to remain fully accessible when the Electron window is small.

## Goals

- Support title-bar dragging for the Settings and main Git operation dialogs.
- Support eight-direction resizing for the Settings and main Git operation dialogs.
- Preserve the existing drag and resize behavior of the diff dialog.
- Keep dialogs inside the renderer viewport with a 16 px safety margin.
- Restore default size and centered position every time a dialog opens.
- Keep the Settings dialog fully visible and usable in small application windows.
- Keep dialog content independently scrollable when the available height is limited.

## Non-goals

- Persist dialog geometry between openings or application sessions.
- Change Settings, Git, or diff business behavior.
- Change Git IPC APIs or renderer data stores.
- Add drag and resize behavior to every small confirmation or reminder dialog.
- Redesign Settings navigation or Git content beyond the layout changes required for responsive sizing.

## Current State

The diff dialog already uses `useResizableDialog` for eight resize handles and contains local pointer-event logic for dragging its header. The resize hook currently has fixed minimum dimensions and depends on `DragResizeProvider`, which is mounted inside `HomePage`.

The Settings dialog is rendered next to `HomePage`, outside that provider. It uses a maximum width and height, but its body has a fixed 540 px height. The header plus body can therefore exceed a small Electron window.

The Git panel is rendered through a body portal from the title bar. Its main operation surface has a fixed 680 px width and an 82 vh height, but it does not support dragging or resizing. Its loading and non-repository messages use compact 400 px surfaces.

## Selected Approach

Extend the existing shared dialog geometry behavior instead of duplicating the diff dialog pointer logic or relying on native CSS `resize`.

The shared behavior will own:

- Pointer sessions for title-bar dragging.
- Pointer sessions for eight-direction resizing.
- Drag activation distance, pointer capture, and cancellation.
- Viewport clamping and minimum-size calculation.
- Inline geometry application after interaction starts.
- Geometry reset when a dialog opens.
- Re-clamping when the application viewport becomes smaller while a dialog is open.

This keeps all three large dialogs behaviorally consistent and gives future fixes one implementation point.

## Architecture

### Shared dialog geometry hook

Evolve `useResizableDialog` into the shared geometry controller. It will continue to expose the content ref and resize-handle props, and will additionally expose drag-handle props and a geometry reset operation.

The hook accepts dialog-specific minimum dimensions. Effective minimum dimensions are capped by the available viewport, so a nominal 480 px minimum width never forces a dialog wider than a small application window. Geometry calculations preserve the 16 px viewport margin whenever the viewport is large enough to provide it.

Transient interaction values stay in refs so pointer movement does not cause React renders. Stable event handlers are reused to avoid unnecessary downstream rendering work.

### Shared resize handles

Extract the repeated eight-handle markup into a small renderer UI component. The component is presentational: it receives the hook props and renders the existing edge and corner hit areas. It does not own geometry or business state.

### Provider placement

Move `DragResizeProvider` from inside `HomePage` to the application surface that contains `HomePage` and application dialogs. This makes the same interaction state available to Settings, Git, and diff without creating nested providers. Existing editor and panel behavior continues to receive the same context.

## Dialog Behavior

### Shared rules

- The title bar begins dragging only after the existing activation distance is exceeded.
- Buttons and interactive controls in a title bar stop pointer propagation and do not initiate dragging.
- Resize handles support north, south, east, west, and all four corners.
- Dragging and resizing never intentionally place the dialog outside the viewport.
- Opening a dialog clears previous inline width, height, left, top, transform, and transition values before paint.
- Resizing the Electron window re-clamps active inline geometry so close buttons and content remain reachable.
- Closing and reopening always restores the dialog's default centered geometry.

### Settings dialog

The preferred default surface remains approximately 780 px wide and 640 px tall. Its actual default width and height are capped by the viewport minus the safety margins, but user resizing may grow the surface beyond those preferred dimensions up to the viewport bounds.

Replace the fixed 540 px content-body height with a flex column layout:

- Header: fixed intrinsic height and draggable.
- Main Settings area: `min-height: 0`, fills the remaining height.
- Navigation: independently scrollable and slightly narrower at constrained widths.
- Content panel: independently scrollable and allowed to shrink.

The surface uses responsive width and height constraints even before a user resizes it. This fixes the current case where the Settings content extends beyond a small application window.

### Git dialog

The main Git operation surface keeps its current visual default of approximately 680 px wide and 82 vh tall, capped by the viewport margins. Its header becomes the drag handle, and the surface receives the shared resize handles. The 680 px width and 82 vh height are preferred defaults rather than resize maxima.

The existing compact loading and non-repository messages remain compact. They receive responsive maximum width and height constraints so they cannot overflow, but they do not need large resizable work areas because they contain no dense content.

Git operation overlays, branch menus, confirmation dialogs, history navigation, and file actions remain unchanged.

### Diff dialog

The diff dialog keeps its current default dimensions and behavior. Its local drag implementation and repeated handle markup migrate to the shared behavior without changing its user-facing result.

## Viewport and Size Rules

- Preferred viewport margin: 16 px on every side.
- Maximum width: viewport width minus both horizontal margins.
- Maximum height: viewport height minus both vertical margins.
- Effective minimum width: the smaller of the dialog's configured minimum and the available maximum width.
- Effective minimum height: the smaller of the dialog's configured minimum and the available maximum height.
- If the viewport is extremely small, geometry degrades to the available viewport instead of preserving an impossible minimum size.

Settings and Git content containers use `min-height: 0` and internal overflow scrolling so shrinking the outer surface does not hide footer actions or expand the dialog beyond its assigned geometry.

## Error and Edge Handling

- Ignore non-primary mouse buttons.
- Ignore move, up, or cancel events that do not match the active pointer ID.
- Release pointer capture when an interaction ends normally.
- Clear interaction state on cancellation and component cleanup.
- Avoid layout jumps by disabling transitions before converting a centered dialog to explicit left and top coordinates.
- Every draggable surface uses viewport-fixed positioning. Its default centered classes provide `left: 50%`, `top: 50%`, and the centering transform so the shared hook can replace them with viewport `left` and `top` coordinates without compounding a flex-layout offset.
- Preserve current outside-click and nested-portal protections for Settings export menus and Git confirmation dialogs.
- Do not close a dialog as a side effect of initiating a drag or resize.

## Testing Strategy

Follow test-driven development for each behavior change.

### Shared geometry tests

- Dragging begins only after the activation threshold.
- Dragging updates explicit left and top values and clamps them to viewport margins.
- Each resize direction updates the expected geometry.
- Effective minimum dimensions shrink when the viewport is smaller than the configured minimum.
- Reset removes interaction geometry.
- A viewport resize re-clamps an active dialog.

### Component tests

- Settings renders with responsive viewport-based constraints rather than a fixed 540 px body.
- Settings exposes a draggable title bar and all resize handles.
- Git main operations expose a draggable title bar and all resize handles.
- Git keeps its existing default visual dimensions and compact transient states.
- Diff continues to expose the same drag and resize behavior through the shared implementation.
- Closing and reopening Settings and Git resets their geometry.

### Repository verification

- Run focused Vitest suites for the shared behavior, Settings, Git, and Home/diff components.
- Run `pnpm typecheck`.
- Run `pnpm lint`.
- Run `pnpm build`.

## Files Expected to Change

- `src/renderer/src/app/App.tsx`
- `src/renderer/src/pages/home/home-page.tsx`
- `src/renderer/src/hooks/use-resizable-dialog.ts`
- `src/renderer/src/components/ui/dialog-resize-handles.tsx` (new)
- `src/renderer/src/features/settings/components/settings-modal.tsx`
- `src/renderer/src/features/settings/components/settings-modal.test.tsx`
- `src/renderer/src/features/git/components/git-panel.tsx`
- `src/renderer/src/features/git/components/git-panel.test.tsx`
- Focused shared geometry tests added beside the shared implementation

The implementation should avoid unrelated files and preserve the current uncommitted editor changes in the working tree.

## Acceptance Criteria

1. Settings and the main Git operation dialog can be dragged by their headers.
2. Settings and the main Git operation dialog can be resized from every edge and corner.
3. Diff drag and resize behavior remains available and consistent.
4. No large dialog can open beyond the usable application viewport.
5. Settings remains usable when the application window is smaller than its preferred 780 × 640 size.
6. Dialog content scrolls inside the resized surface instead of expanding it.
7. Reopening any of the three large dialogs restores its default centered size and position.
8. Existing Settings, Git, and diff workflows continue to pass their tests.
