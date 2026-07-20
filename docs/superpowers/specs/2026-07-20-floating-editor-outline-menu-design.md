# Floating Editor Outline Menu Design

## Goal

Add an on-demand document outline to the floating editor without increasing permanent title-bar density or reducing the editor's default content width.

## Confirmed Interaction

- Keep the existing collapse control on the left side of the title bar.
- Replace the right-side new-window and return-to-main-window buttons with one `More` menu trigger.
- Keep the close button directly accessible beside the `More` trigger.
- Order the menu items as follows:
  1. `Show outline` or `Hide outline`, depending on the current drawer state.
  2. Separator.
  3. `New floating window`.
  4. `Return to main window`.
- Do not display or register an outline keyboard shortcut.
- Disable the outline menu item while the floating editor is collapsed.

## Outline Drawer

- The outline is hidden whenever a floating editor window opens.
- Opening the outline displays a right-side overlay drawer below the title bar. It does not resize or reflow the editor content.
- The drawer uses the existing theme tokens and outline indentation conventions.
- The drawer lists heading blocks in document order, using heading level for indentation.
- An empty document or a document without headings shows `No headings`.
- Clicking a heading scrolls the matching editor block into view and keeps the drawer open for consecutive navigation.
- Clicking back into the editor closes the drawer and restores the full editing surface.
- Pressing `Escape`, selecting `Hide outline`, or collapsing the floating editor closes the drawer.

## Outline State

- Heading data is local to each floating editor window and is derived from its BlockNote document.
- Heading data refreshes after initial content load, live source updates, replacements, and local editor changes.
- The active heading follows the editor scroll position and is visually highlighted in the drawer.
- Drawer visibility is local UI state and is not persisted between window sessions.

## Component Boundaries

- `QuickEditorWindow` owns menu state, drawer visibility, heading extraction, active-heading tracking, and navigation.
- A focused floating-editor outline component renders the drawer list and empty state.
- Existing generic UI and outline conventions should be reused where they fit, without coupling the floating editor to the main window's pane/store navigation.
- The existing Electron bridge remains unchanged because the feature is renderer-local.

## Accessibility

- The `More` trigger exposes an accessible label and standard menu semantics.
- The outline menu item reflects its current action in its label.
- The drawer has a navigation landmark and an accessible outline label.
- Heading entries are keyboard-focusable buttons with visible focus treatment.
- `Escape` closes the drawer and returns focus to the editor when appropriate.

## Responsive Behavior

- The title bar always retains collapse, `More`, and close controls.
- The overlay drawer width is capped for normal windows and constrained to leave a visible portion of the editor in narrow windows.
- The drawer has independent vertical scrolling for long outlines.

## Verification

- Component tests cover the consolidated menu, absence of an outline shortcut label, drawer toggling, empty state, heading extraction, heading navigation, and closing behavior.
- Run `pnpm typecheck`.
- Run `pnpm lint`.
- Run `pnpm build`.

