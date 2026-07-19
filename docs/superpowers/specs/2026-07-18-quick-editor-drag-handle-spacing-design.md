# Quick Editor Drag Handle Spacing Design

## Goal

Give the floating quick editor's left-side BlockNote controls 20 pixels of additional breathing room from the window border while preserving their alignment with the editable content.

## Scope

- Change only the floating quick editor surface.
- Keep the main editor and shared BlockNote styles unchanged.
- Preserve the existing spacing between the side-menu controls and block content.
- Do not change editor behavior, window dimensions, or scrolling behavior.

## Design

Increase the left padding of `.quick-editor-window__editor .bn-editor` from its original `52px` to `72px`. This follow-up adds 8 pixels to the current `64px` value. BlockNote positions its add and drag controls relative to the editor content, so increasing this padding shifts both the controls and content together. The existing top, right, and bottom padding values remain unchanged.

This is preferred over translating `.bn-side-menu`, which would reduce the gap between the controls and content, and over padding the scroll container, which would change the available scroll surface.

## Verification

- Update the focused CSS regression assertion for the quick editor's `72px` left padding.
- Run the focused test first to observe the expected failure before changing production CSS.
- Run the focused test again after the CSS change.
- Run `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
