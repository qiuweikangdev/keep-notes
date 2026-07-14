# File Tree Hover Scrollbar Design

## Goal

Keep the file tree scrollbar hidden by default and reveal it only while the
pointer hovers over the file tree scroll container.

## Scope

- Change only the virtualized file tree scroll container and its dedicated
  scrollbar styles.
- Preserve scrolling behavior, virtualization, and the existing global
  scrollbar appearance for every other panel.
- Do not show the scrollbar solely because the file tree receives keyboard
  focus.

## Behavior

1. When the pointer is outside the file tree, its scrollbar takes no visual
   width and is not visible.
2. Hovering the file tree restores the existing 8px scrollbar track and thumb
   appearance.
3. Moving the pointer away hides the scrollbar again without changing scroll
   position or tree content.

## Implementation

Add a semantic class to the existing virtualized file tree scroll container.
Use scoped WebKit scrollbar pseudo-element rules for that class: the base
state sets the scrollbar dimensions to zero, and the hover state restores the
existing dimensions. The global theme-aware thumb color rules remain the
single source of thumb colors.

## Validation

- Add a focused component assertion that the scroll container has the scoped
  class used by the CSS behavior.
- Run the focused test, then project typecheck, lint, and build commands.
