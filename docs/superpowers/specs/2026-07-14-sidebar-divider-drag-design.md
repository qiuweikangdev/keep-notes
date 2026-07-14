# Sidebar Divider Drag Feedback Design

## Goal

Remove the visible idle border between the sidebar and editor. Show a 3px
theme-colored divider only while the user is dragging the sidebar horizontally.

## Scope

- Change only the sidebar/editor `PanelResizeHandle` in `home-page.tsx`.
- Keep the existing resize hit area and panel layout persistence unchanged.
- Do not change editor split handles or the diff panel handle.

## Behavior

1. The resize handle is transparent by default.
2. Starting a resize drag shows a 3px line using
   `var(--border-color)`.
3. Releasing the pointer or cancelling the interaction removes the line.

## Implementation

Maintain a local dragging boolean in the home page and bind the resize
handle's `onDragging` callback to it. Render the visual divider conditionally
from that boolean. The hit target remains wider than the 3px feedback line.

## Validation

- Add a component test that verifies the divider is hidden initially, shown on
  pointer down, and hidden on pointer up.
- Run the focused test, then the project typecheck, lint, and build commands.
