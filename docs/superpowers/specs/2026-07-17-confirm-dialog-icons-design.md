# Confirm Dialog Icon Standardization Design

## Goal

Standardize the visual language of confirmation dialogs so that every dialog title includes a semantic icon while preserving the existing layout, theme tokens, button behavior, focus handling, and dismissal behavior.

## Scope

The shared `ConfirmDialog` component is the source of truth for confirmation dialogs. It will resolve a default title icon from its semantic variant:

- `danger`: red trash icon and destructive confirmation button.
- `warning`: red warning icon and default confirmation button.
- `default`: neutral alert icon and default confirmation button.

Call sites may supply a semantic icon when the action has a clearer meaning than the generic default. File move confirmations will supply a folder-move icon. Shortcut binding deletion will use the `danger` variant so it receives the same destructive visual treatment as all other delete confirmations.

## Behavior

No confirmation flow changes. The dialog continues to focus Cancel by default, closes after a successful confirm handler, and uses the existing backdrop, dimensions, spacing, borders, and theme variables. Existing callers without an explicit icon remain compatible and receive a default icon.

## Verification

Component tests will prove that warning, danger, default, and caller-supplied icons render in the dialog title. Existing type checking, linting, tests, and build validation will run after the implementation.
