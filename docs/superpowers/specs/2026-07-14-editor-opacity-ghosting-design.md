# Editor Opacity Ghosting Fix Design

## Scope

Fix ghosted rich-text content that appears while scrolling after the user lowers the appearance opacity. Preserve the existing window-level transparency control and all rich-editor session and preview behavior.

## Root Cause

The app root, live BlockNote editor surface, and virtual rich preview each apply the same appearance opacity. The live editor and preview are stacked together while the active pane remains visible. At opacity values below 100%, the live editor's background becomes translucent, allowing the separately-scrolled preview behind it to show through as offset text.

## Design

Keep `appearance.opacity` on the application root only. Remove it from the live editor and virtual preview inline styles. The root is composited after its children, so the complete app stays transparent to the desktop while each internal editor layer remains opaque and cannot reveal a differently-scrolled layer below it.

## Verification

Add regression assertions that the live editor and virtual preview do not receive a local opacity style. Run the focused tests, followed by type checking, linting, and a production build.
