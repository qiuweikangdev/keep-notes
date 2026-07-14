# Diff Viewer Surface Background Design

## Goal

Remove the black unused area at the bottom of the comparison dialog while preserving the existing diff layout, scrolling behavior, and addition/deletion colors.

## Scope

- Update the `DiffViewer` integration with `@pierre/diffs`.
- Add a focused regression assertion for the third-party shadow-DOM background overrides.
- Do not alter dialog dimensions, diff computation, or Git operations.

## Design

`@pierre/diffs` renders inside a shadow DOM. The application background on the dialog and outer viewer does not reliably control the library's own root and buffer surfaces, which default to black in dark themes.

The existing `unsafeCSS` style string will explicitly set the library host, code, gutter, content, and buffer surfaces to the application's `--bg-primary` color. This confines the fix to diff views and lets every application theme supply its own color through the existing CSS variable.

The current line-level addition and deletion overrides remain unchanged.

## Verification

- Add a unit test that asserts the generated shadow-DOM CSS includes the required root and empty-surface selectors and `--bg-primary` background value.
- Run the focused test, then the repository typecheck, lint, and build commands.
