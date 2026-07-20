# Find Widget Opacity Isolation Design

## Goal

Keep the editor find-and-replace widget fully opaque when the main window appearance opacity is below 100%, while preserving its current placement and behavior in both tabbed editor panels and quick-editor windows.

## Root Cause

The main application applies `appearance.opacity` to its root container. The tabbed editor's `FindWidget` is rendered beneath that container, so browser compositing reduces the opacity of the entire widget. A descendant cannot cancel an ancestor's CSS `opacity` by setting its own opacity back to `1`.

The quick-editor window does not use the main application's opaque root hierarchy, so its current inline widget placement is already correct.

## Design

Add an optional positioning anchor to `FindWidget`:

- Without an anchor, render inline with the existing absolute positioning. The quick-editor window will keep using this path unchanged.
- With an anchor, render the widget through a React portal into `document.body`. Use the anchor's viewport bounds to position the portal with `position: fixed`, keeping the existing eight-pixel top and right inset.
- Observe the anchor size and the browser window size while the widget is open, so split-panel resizing and window resizing update its position.
- Keep the widget's visual tokens, keyboard handling, pointer-event isolation, focus behavior, and search/replace callbacks unchanged.

`EditorWorkspace` will pass its existing root element as the anchor. This moves only the main tab-panel widget outside the translucent application root; editor content and every other application surface continue to follow the configured appearance opacity.

## Alternatives Considered

1. Apply `opacity: 1` directly to the widget. This cannot override ancestor opacity and therefore does not solve the problem.
2. Refactor application-wide opacity into separate visual layers. This would affect settings, dialogs, sidebars, and editor surfaces, creating unnecessary regression risk.
3. Create a separate Electron window for the widget. This would add window lifecycle, focus, and positioning complexity that is disproportionate to the requirement.

## Testing

- Add a `FindWidget` regression test that renders the component under a translucent ancestor with a positioning anchor, then verifies the search surface is portaled outside that ancestor and positioned from the anchor bounds.
- Preserve the existing inline rendering test to cover quick-editor compatibility.
- Verify resize-driven positioning if the component introduces an observable anchor update path.
- Run the focused Vitest file, then `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

## Scope Boundaries

- Do not change the appearance opacity setting or the main application root opacity behavior.
- Do not change search matching, replacement, undo, keyboard shortcuts, or highlight behavior.
- Do not change quick-editor window layout or opacity behavior.
- Do not install dependencies or modify the lockfile.
