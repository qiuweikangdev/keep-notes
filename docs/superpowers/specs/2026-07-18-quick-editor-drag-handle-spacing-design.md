# Quick Editor Drag Handle Spacing Design

## Goal

Give the floating quick editor's left-side BlockNote controls 12 pixels of breathing room from the window border while preserving their alignment with the editable content.

## Scope

- Change only the floating quick editor surface.
- Keep the main editor and shared BlockNote styles unchanged.
- Preserve the existing spacing between the side-menu controls and block content.
- Do not change editor behavior, window dimensions, or scrolling behavior.

## Design

Increase the left padding of `.quick-editor-window__editor .bn-editor` from `52px` to `64px`. BlockNote positions its add and drag controls relative to the editor content, so increasing this padding shifts both the controls and content 12 pixels to the right. The existing top, right, and bottom padding values remain unchanged.

This is preferred over translating `.bn-side-menu`, which would reduce the gap between the controls and content, and over padding the scroll container, which would change the available scroll surface.

## Verification

- Add a focused CSS regression assertion for the quick editor's `64px` left padding.
- Run the focused test first to observe the expected failure before changing production CSS.
- Run the focused test again after the CSS change.
- Run `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
