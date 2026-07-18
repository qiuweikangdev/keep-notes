# Quick Editor Collapse Design

## Goal

Add a compact, Mac Stickies-inspired collapse control to the floating quick editor. The control must shrink the native window upward into its title bar, restore the editor to its previous height, and keep the window usable down to an `80px` by `80px` manually resized footprint.

## Confirmed Direction

- Use a single Lucide chevron icon in the title bar: `ChevronUp` while expanded and `ChevronDown` while collapsed.
- Render the icon at `15px` inside the existing compact title-bar button vocabulary.
- Place the collapse control independently at the top left and keep the close action at the top right.
- Animate the native window height for approximately `160ms` with an ease-out curve.
- Collapse to a `38px` native-window height while preserving the current top edge, horizontal position, and width.
- Expand to the same window's last pre-collapse height.
- Keep the implementation state and native resize lifecycle in the main process, exposed through a narrow preload API.

## Window Sizing Contract

The normal manual-resize minimum changes from `440px` by `300px` to `80px` by `80px`. This allows the expanded editor to be resized into a small square without changing its normal default size of `640px` by `420px`.

Collapsing is a deliberate title-bar action and is the only state allowed below the normal `80px` minimum height. Before the collapse animation starts, the main process temporarily changes that window's minimum size to `80px` by `38px`. It records the current expanded height and animates only the height toward `38px`. The current `x`, `y`, and width remain stable, so the bottom edge moves upward while the top edge stays anchored.

Expanding animates the height back to the recorded pre-collapse value. Once expansion completes, the main process restores the normal `80px` by `80px` minimum. If no recorded height is available, the current/default expanded height is used as a safe fallback. State is tracked per `BrowserWindow`, so multiple quick-editor windows collapse and restore independently.

## Title-Bar Layout

The expanded title bar has two action groups:

- A left group containing the collapse/expand button.
- A right group containing the existing new-editor, return-to-application, and close buttons.

The remaining title-bar space stays draggable, while every interactive control remains explicitly non-draggable. The collapse button uses:

- `ChevronUp` with the accessible name and tooltip `折叠编辑器` while expanded.
- `ChevronDown` with the accessible name and tooltip `展开编辑器` while collapsed.

At narrow widths where all actions no longer fit, the new-editor and return-to-application actions are hidden. The collapse action remains visible at the left and close remains visible at the right, including at the `80px` minimum width. Widening the window reveals the secondary actions again. Hiding these secondary actions is responsive presentation only; it does not change their existing behavior.

## Collapse State and Data Flow

The main process owns a small state record for each quick-editor window:

- Whether the window is currently collapsed.
- Its most recent expanded height.
- Whether a height transition is active.
- Any scheduled animation work that must be cancelled during cleanup.

The quick-editor IPC surface gains focused operations to read the current collapsed state and request a collapsed-state change. IPC handlers resolve the sender's `BrowserWindow` and reject or safely ignore requests from missing, destroyed, or non-quick-editor windows. Inputs are validated before changing native-window state. The preload exposes only typed wrappers for these operations and does not expose raw Electron primitives to the renderer.

On mount, the renderer reads the window's current collapsed state. When the button is pressed, it requests the opposite state and updates its presentation from the main-process result. The button is disabled during an active transition to prevent double-clicks from corrupting the stored height or starting competing animations.

## Animation and Editor Continuity

The main process drives the native height animation because CSS cannot resize the outer `BrowserWindow`. The animation lasts approximately `160ms` and uses an ease-out progression. Each frame changes only the current height; it does not move the top edge or overwrite the current horizontal bounds.

If `prefers-reduced-motion: reduce` is active in the renderer, the request asks the main process to apply the final bounds immediately. The state transition and minimum-size rules remain identical.

The editor component stays mounted while collapsed so its document state, selection, history, and unsaved content are preserved. Collapsed presentation hides the editor surface and prevents it from receiving pointer interaction inside the title-bar-only window. After expansion completes, collapsed presentation is removed and focus returns to the editor.

If a quick-editor window closes during a transition, pending animation work is cancelled and its collapse state is removed. Repeated requests during an active transition resolve to the in-flight result rather than creating a second transition.

## Accessibility

- The icon-only button always has a state-specific Chinese accessible name and tooltip.
- The icon is decorative to assistive technology; the button supplies the accessible name.
- The button remains keyboard reachable and retains the existing title-bar focus style.
- The disabled transition state is exposed through the native button semantics.
- Reduced-motion preferences remove the animated resize without removing the feature.
- At the smallest width, collapse/expand and close remain available without overlap.

## Testing Strategy

Follow test-driven development with focused regression coverage.

Main-process tests verify:

- New quick-editor windows use `80px` by `80px` normal minimum dimensions.
- Collapse records the expanded height, temporarily permits `38px`, and reaches the collapsed height.
- Expansion restores the recorded height and the `80px` minimum height.
- The top edge, horizontal position, and width remain stable across both transitions.
- Multiple quick-editor windows retain independent collapse state and restore heights.
- Reduced-motion requests apply final bounds without intermediate animation.
- Closing or destroying a window cancels animation work and clears per-window state.
- Invalid senders and duplicate transition requests do not mutate unrelated windows.

Renderer and CSS tests verify:

- The expanded and collapsed states render `ChevronUp` and `ChevronDown` with the correct accessible names.
- Activating the control uses the typed preload API and disables the button until the transition completes.
- Expanding returns focus to the editor without resetting its content.
- Collapsed presentation hides interaction with the editor while keeping it mounted.
- At the `80px` minimum width, only collapse/expand and close remain visible and do not overlap.
- At wider widths, the existing new-editor and return-to-application actions remain available.

After focused tests, run:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`

Perform a final Electron visual check when the local UI is available, covering expanded, collapsed, `80px` minimum-width, restored, and reduced-motion behavior. Existing unrelated test failures must be reported separately rather than changed as part of this work.

## Out of Scope

- Changing the quick editor's default dimensions or always-on-top behavior.
- Persisting collapsed state across application restarts.
- Changing quick-editor content synchronization, save, close, or return-to-application behavior.
- Adding new dependencies or custom icon assets.
- Redesigning the existing right-side actions or shared application title bars.
- Fixing unrelated dirty files or existing test failures.
