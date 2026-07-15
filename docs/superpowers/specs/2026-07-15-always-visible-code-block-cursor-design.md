# Always-Visible Code Block Cursor Design

## Problem

The active BlockNote code block NodeView uses CodeMirror's `drawSelection()` extension with its default 1,200 ms cursor blink rate. The custom cursor layer becomes transparent for half of each blink cycle. When an empty code block is clicked without changing the selection position, CodeMirror does not always restart that cycle, so the editor remains focused and accepts input while the cursor appears missing.

## Design

Configure the active CodeMirror NodeView with `drawSelection({ cursorBlinkRate: 0 })`. This uses CodeMirror's public API to disable cursor blinking and keeps the code block cursor continuously visible while the editor is focused.

The change is intentionally limited to `editor-code-block-node-view.ts`, which is the renderer registered by the BlockNote schema. No focus behavior, selection synchronization, CSS animation, or inactive legacy React renderer behavior will change.

## Testing

Add a regression test that mounts a real BlockNote code block, obtains its CodeMirror view, and verifies the effective `drawSelection` configuration reports a zero cursor blink rate. Run the focused test first to confirm it fails before the implementation, then verify the focused test and the repository's required typecheck, lint, and build commands.
