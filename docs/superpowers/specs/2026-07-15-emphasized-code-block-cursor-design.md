# Emphasized Code Block Cursor Design

## Context

The embedded CodeMirror editor already keeps its text cursor continuously visible by disabling cursor blinking. The cursor uses the application's accent color, but CodeMirror's default one-pixel border is still easy to miss against syntax-highlighted code.

## Goal

Make the text cursor inside editor code blocks clearer without making it visually heavy or changing cursor behavior elsewhere in the application.

## Design

Update the existing CodeMirror-scoped theme in `editor-code-block-node-view.ts` so `.cm-cursor` uses a two-pixel left border while retaining `var(--accent-color)` as its color.

The existing `drawSelection({ cursorBlinkRate: 0 })` configuration remains unchanged, so the cursor stays continuously visible. The style remains local to the embedded CodeMirror instance and does not affect BlockNote body text or other inputs.

## Alternatives Considered

1. A two-pixel accent-colored cursor with a glow. This is more prominent but can look distracting and inconsistent across light and dark themes.
2. A three-pixel accent-colored cursor. This is highly visible but visually heavy at the current code font size.
3. A global caret-width override. This would have a broader effect than requested and would be harder to isolate and test.

The two-pixel solid accent-colored cursor provides the best balance of visibility and restraint.

## Testing

Extend the existing code-block NodeView regression test to inspect the generated CodeMirror cursor theme and verify both requirements:

- the cursor color remains `var(--accent-color)`;
- the cursor left-border width is `2px`.

The existing assertion that cursor blinking is disabled remains in place.

## Non-Goals

- Adding a user-configurable cursor-width setting.
- Changing the cursor shape or adding animation.
- Modifying cursor styling outside code blocks.
- Changing selection colors.

