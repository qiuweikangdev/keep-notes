# Virtualized Rich Editor Sessions Design

**Status:** Approved for implementation planning

**Date:** 2026-07-10

## Summary

Keep Notes currently creates one complete BlockNote/ProseMirror editor for every visible rich-text panel. A document above 10,000 characters becomes noticeably slow after only one split: typing, tab activation, scrolling, and panel resizing all make multiple large editor DOM trees and synchronization pipelines do work on the renderer main thread.

This design replaces per-panel rich editor ownership with per-document rich editor sessions. A file has one persistent, fully initialized BlockNote editor regardless of how many panels display it. The focused panel hosts that live editor. Other panels display independently scrollable, virtualized rich-text views that render only blocks near their viewport. Activating a passive panel moves the persistent editor surface before the next paint and restores that panel's view state, so the first click enters editing without parsing Markdown, replacing the document, or showing source text.

Panel count remains unrestricted. The primary acceptance case is two panels, the normal upper bound is three panels, and six panels are used as a stress case.

## Problem Statement

The existing persistent-panel and hot-standby work removed editor remounts from the first split click path, but it does not make the steady state scalable.

The current implementation has five compounding costs:

1. Every visible split owns a complete BlockNote instance, ProseMirror view, extension set, and full document DOM.
2. Each user transaction is serialized into steps and broadcast to every peer editor. Each peer dispatch updates another ProseMirror view.
3. A synchronization-pending callback runs for every peer. After a standby is claimed, the callback still attempts a Zustand warmup update even though the group is visible, producing redundant global store notifications.
4. Scrolling and panel resizing force layout and paint work for every attached full-document DOM tree.
5. The current large-document workaround prevents a third panel. This reduces resource usage but violates the product requirement and does not solve the two-panel regression.

The issue is architectural rather than a single slow callback. Optimizing the existing fan-out can reduce input overhead, but it cannot remove duplicated DOM layout, scroll, and resize costs.

## Goals

- Keep split actions enabled for any panel count.
- Make a document above 10,000 characters responsive with two or three visible panels.
- Keep six same-document panels usable as a stress case.
- Create one BlockNote/ProseMirror editor per unique visible document, not per panel.
- Preserve complete rich-text presentation in every panel; never show raw Markdown as a transition.
- Allow passive panels to scroll independently.
- Make the first pointer interaction with a passive panel enter the complete editor without a second click.
- Preserve panel-specific scroll position, selection, active block, and focus intent.
- Keep Markdown serialization, saving, outline extraction, and preview-cache generation outside urgent input and layout paths.
- Avoid dependency and lockfile changes. `@tanstack/react-virtual` is already installed.

## Non-Goals

- Replacing BlockNote, ProseMirror, or the Markdown conversion pipeline.
- Supporting simultaneous keyboard focus in more than one panel.
- Making every background tab retain a permanently mounted editor.
- Providing collaborative multi-user editing.
- Enforcing wall-clock performance thresholds in CI, where machine variance would make tests unreliable.

## Constraints

- A panel may display source mode; source editors remain panel-owned and are outside the rich-session pool.
- Core implementation comments must be written in Chinese per repository guidelines.
- Existing renderer-safe Electron boundaries remain unchanged.
- The persisted editor store must remain backward compatible during migration.
- External file changes and save coordination must still be applied once per file path.
- The implementation must use test-driven development and focused conventional commits.

## Approaches Considered

### 1. Per-document session with virtualized passive panels — selected

One live BlockNote editor is shared by all panels that display the same file. Passive panels use a bounded rich preview. This removes duplicate ProseMirror transaction dispatch, plugin work, DOM layout, and paint while preserving unlimited panels.

This is the only approach that directly addresses all reported interactions without replacing the editor engine. Its main complexity is reliable surface transfer, passive rich rendering, and pointer-to-caret restoration.

### 2. Continue optimizing multiple live BlockNote editors

This approach would batch peer synchronization, remove redundant Zustand writes, serialize steps once, and add stronger CSS containment. It is lower risk and should improve typing, but every panel would still hold a full document DOM and would still participate in scroll and resize layout. Its cost remains proportional to panel count, so it cannot meet the VS Code-like scalability target.

### 3. Replace the editor with a natively virtualized rich-text engine

This offers the highest theoretical ceiling but requires rebuilding BlockNote schema extensions, Markdown conversion, images, code blocks, tables, formatting controls, drag and drop, find, and keyboard behavior. The migration risk is disproportionate to the two-to-three-panel use case.

## Architecture

### RichDocumentSessionManager

`RichDocumentSessionManager` is a renderer-local runtime service keyed by normalized file path. It does not live in Zustand because editor objects, DOM surfaces, subscriptions, and high-frequency view state are non-serializable and must not trigger global React updates.

The manager is responsible for:

- creating or returning one `RichDocumentSession` per path;
- tracking visible panel and background-tab references;
- binding a session to the currently active panel for that path;
- moving the session's persistent surface between panel hosts;
- maintaining an LRU of sessions that have no visible references;
- disposing only sessions that are neither visible nor dirty nor saving.

All unique documents currently visible in a panel retain a warm session. The LRU retains the four most recently active background-only sessions; visible, dirty, saving, and reloading sessions do not count toward that capacity and cannot be evicted. There is no panel-count limit.

### RichDocumentSession

A session owns:

- one BlockNote editor and its ProseMirror view;
- one stable editor surface element;
- the canonical live document revision;
- the current parsed block order and block snapshot cache;
- generated rich-preview HTML by block ID and block revision;
- one save/serialization pipeline;
- one outline-extraction pipeline;
- panel bindings and panel-specific view states;
- external-file-change and reload coordination;
- preview and lifecycle subscriptions.

BlockNote callbacks read the current active panel binding from the session instead of capturing a fixed `groupId` and `tabId`. Moving the surface therefore does not recreate the editor or re-register its transaction listeners.

### RichPaneHost

Every rich panel renders a stable `RichPaneHost` with two mutually exclusive layers:

- the live-editor host, used when the panel owns its document session;
- `VirtualRichPreview`, used when the same document session is attached elsewhere.

The tab bar always remains a normal interactive React component. Switching tabs changes metadata and host binding; it does not make the tab bar wait for document parsing.

### VirtualRichPreview

`VirtualRichPreview` uses `@tanstack/react-virtual` and renders only the visible top-level blocks plus an overscan of eight blocks above and below the viewport. Nested children remain part of their top-level block fragment.

Each virtual item:

- is keyed by BlockNote block ID;
- has a measured height cached per panel width bucket;
- renders trusted HTML generated by `BlockNoteEditor.blocksToFullHTML([block])`;
- carries `data-block-id` and text-offset metadata for activation;
- resolves local images through the same path resolver as the live editor;
- uses the existing BlockNote and application theme styles.

The preview cache is warmed for the active viewport during idle time. Entering blocks may be exported synchronously one block at a time if they were not cached. A complete-document export is never performed in a scroll handler or split action.

### PanelViewState

Each `(groupId, tabId)` binding has transient view state:

- `scrollTop`;
- top visible block ID and offset;
- ProseMirror selection bookmark when the panel was live;
- passive-preview text anchor from the last pointer interaction;
- last measured panel width;
- focus intent.

Scroll events update refs and the session manager, not Zustand. The persisted tab scroll value is written on scroll idle, blur, tab switch, close, and application shutdown.

## Interaction Data Flows

### Initial document open

1. The file loader obtains Markdown once.
2. The session manager creates a session and persistent surface.
3. The session parses and applies the document once.
4. The active panel attaches the surface.
5. Preview fragments for the active viewport are generated after the first paint and then expanded in idle chunks.

The initial open may retain the existing loading state. This design changes repeated split and activation behavior, not the first-ever parse cost.

### Split panel

1. The store creates only visible panel and tab metadata.
2. The new panel references the existing document session.
3. The source panel remains live; the new panel renders a virtual rich preview using the source panel's view state as its initial position.
4. No BlockNote instance, Markdown parse, baseline serialization, `replaceBlocks`, or warmup group is created.

Split controls never depend on a standby-ready state and never enforce a maximum panel count.

### Activate a passive panel

1. Pointer-down capture reads the preview block ID and text offset using the preview DOM before it is replaced.
2. The manager saves the outgoing live panel's selection and scroll state.
3. The outgoing panel switches to a preview at the same visual position.
4. The persistent surface is appended synchronously to the target live host.
5. The target panel's scroll and selection are restored before paint.
6. The editor receives focus. A successful text anchor places the caret at the clicked offset; an unsupported block falls back to the nearest editable block start.

Tab activation follows the same attach path from a layout effect. There is no loading or source-text intermediate state.

### Edit

1. User input creates one ProseMirror transaction in the session editor.
2. The session increments its document revision and identifies affected top-level block IDs from the transaction's old and new ranges.
3. The live editor updates immediately.
4. Preview invalidations are combined into one animation-frame publication.
5. Only visible virtual items whose block IDs changed regenerate their fragment.
6. Structural transactions rebuild block order once outside the input dispatch before publishing the next preview frame.
7. Markdown serialization and save scheduling remain debounced and idle-priority, once per document session.

There is no peer transaction registry for duplicate panels and no synchronization-pending Zustand action.

### Scroll

- The live panel uses the native editor scroller.
- Passive panels use independent virtual scrollers.
- Scroll position is held in refs during movement.
- Preview measurement and persistence are animation-frame or idle batched.
- Scrolling never serializes Markdown, traverses the complete document, or maps all panel groups.

### Resize panels

- The resizable layout updates dimensions directly.
- The live editor is the only full document DOM participating in reflow for its document.
- Passive previews remeasure only mounted virtual items.
- Width changes invalidate height caches by width bucket after the resize frame, not on every pointer event.
- Outline extraction, preview prewarming, and persistence pause during an active resize and resume afterward.

### Switch tabs

1. The tab bar updates the active tab metadata.
2. The outgoing binding persists its view state.
3. The target document session attaches if already warm; otherwise the panel shows its existing rich preview/loading state while first-open parsing completes.
4. A session that was previously visible attaches without reparse or editor construction.

### External file change

1. File subscription dispatches the change to the path session once.
2. The session resolves dirty/conflict policy once.
3. The canonical editor applies one reload.
4. Preview caches invalidate by session revision.
5. Compatible tab snapshots update without incrementing synchronized reload keys.

### Close and eviction

- Closing a duplicate panel removes only its binding and preview.
- Closing the active binding moves the live surface to another visible binding for the same path before disposal.
- A session with no visible references becomes an LRU candidate.
- Dirty, saving, or externally reloading sessions cannot be evicted.
- Eviction serializes pending user intent, persists view states, destroys the editor, and removes preview caches.

## Store Ownership

Zustand continues to own serializable application metadata:

- panel layout and group identity;
- tabs and active tab IDs;
- path, mode, load/save/error status, and dirty indicators;
- backward-compatible Markdown content snapshots;
- persisted scroll fallback.

The runtime session owns high-frequency and non-serializable state. Markdown snapshots propagate to matching tabs only after the one document serialization completes. Selectors for layout, tab bars, and toolbars do not include rich document content or session revision.

Store actions must return the previous state when no logical value changes. In particular, no visible panel may call warmup-state actions after this migration.

## Rich Preview Fidelity and Accessibility

- The preview uses BlockNote's full HTML exporter, not Markdown or a plain-text approximation.
- Existing theme variables, typography, list, code block, table, and image styles apply to preview fragments.
- Preview containers expose `aria-readonly="true"` and do not pretend to be contenteditable.
- Keyboard focus on a passive preview activates the live editor and restores the last known editable position.
- Unsupported custom block pointer mapping falls back to the block start while preserving first-interaction editing.
- Find highlighting runs only against mounted preview blocks and the active live editor. A find operation may intentionally ask the virtualizer to reveal a target block before highlighting it.

## Failure Handling

### Preview export failure

Keep the last successful block fragment. If no fragment exists, render a styled block-sized placeholder and schedule a retry outside the current interaction. Never expose Markdown source as a fallback.

### Pointer anchor failure

Attach the live editor and focus the nearest editable block start. Activation succeeds even when exact character mapping is unavailable for a table, custom code node view, or image.

### Session reload failure

Keep the last rendered document and surface. Report the existing load/error state without clearing the panel. A background reconstruction can replace the session surface only after it is ready.

### Stale external update

Use the existing dirty/conflict policy at the session boundary. Do not independently reload panel copies because duplicate copies no longer exist.

## Performance Budgets

The budgets are measured in a production renderer build on the primary Windows development machine using a representative 10,000–50,000 character Markdown document.

- Two same-document panels: no interaction long task above 50 ms during steady-state typing, tab activation, scrolling, or divider resize.
- Three same-document panels: same 50 ms long-task ceiling for normal interaction.
- Six same-document panels: functional stress case with one BlockNote instance and bounded passive DOM.
- Split-to-preview paint: p95 at or below 50 ms.
- Passive-to-live activation: p95 at or below 50 ms.
- Scroll and divider resize: target at least 55 rendered frames per second during a sustained interaction.
- Same-document editor count: exactly one BlockNote/ProseMirror instance.
- User transaction dispatch: exactly one live ProseMirror dispatch; zero peer dispatches.
- Virtual preview mounted count: visible virtual items plus at most sixteen overscan items per panel.
- Synchronization-related Zustand writes: zero.

Wall-clock budgets are diagnostic/manual release gates. Automated tests assert structural proxies such as instance count, dispatch count, subscription count, and mounted virtual item bounds.

## Diagnostics

Development builds add scoped performance marks for:

- `editor:split-to-paint`;
- `editor:pane-activate`;
- `editor:transaction`;
- `editor:preview-frame`;
- `editor:resize-frame`.

A development-only observer records tasks above 50 ms with the active path length, visible binding count, mounted preview-block count, and operation name. It must not log document content or file paths.

Production builds do not retain verbose measurements or user data.

## Testing Strategy

### Unit tests

- A session manager returns one session for repeated references to the same normalized path.
- Session reference counting distinguishes visible bindings from background tabs.
- LRU eviction excludes visible, dirty, saving, and reloading sessions.
- Surface activation moves one stable element and preserves outgoing and incoming view states.
- Pointer anchors resolve text offsets and fall back to a block start for unsupported content.
- Preview cache invalidation updates only affected IDs for text transactions and rebuilds order for structural transactions.
- Store no-op actions preserve state identity.

### Component tests

- Splitting the same document into two, three, and six panels creates one mocked BlockNote session.
- Split controls remain enabled without a warmup group or panel-count limit.
- Passive panels render rich virtual blocks and never render Markdown source.
- Mounted preview items remain bounded by the virtual range and overscan.
- First pointer-down activates the live surface and applies the requested caret anchor.
- Tab switching reuses a warm document session without remounting the editor.
- Closing the active duplicate transfers the surface to a surviving panel.
- Independent panel scroll states survive repeated activation.
- External file changes reload the document session once.

### Integration and regression tests

- One edit schedules one serialization and one save regardless of duplicate panel count.
- Rich editor selectors remain stable when preview revisions and Markdown snapshots change.
- Source mode remains panel-owned and transitions back to the appropriate rich session.
- Find, outline navigation, images, code blocks, tables, drag and drop, and keyboard shortcuts continue to operate after surface transfer.
- Persistent panel layout tests continue to prove surviving panel identity across nested split and close.

### Manual performance scenario

1. Open a representative 10,000–50,000 character rich document.
2. Split right, then split down to produce three panels of the same file.
3. Type continuously in each panel after activation.
4. Switch tabs repeatedly.
5. Sustain scroll in live and passive panels.
6. Drag horizontal and vertical dividers continuously.
7. Repeat with six panels as a stress case.
8. Inspect the performance marks and long-task observer against the budgets above.

## Migration Strategy

The migration is delivered in focused, independently testable commits:

1. Remove the panel-count limit and eliminate redundant synchronization-related store notifications while retaining current behavior.
2. Introduce the session manager, reference accounting, and persistent per-document surface behind tests.
3. Move editor ownership from panel components to sessions while preserving existing visible behavior.
4. Add the rich preview cache and virtualized passive panel.
5. Add synchronous activation, selection mapping, and independent view-state restoration.
6. Route serialization, saving, outline, external changes, and diagnostics through the session.
7. Remove the obsolete split warmup and peer editor registry.
8. Run focused tests, full repository verification, build, and manual performance acceptance.

Each commit must leave the editor functional and must not modify dependencies or the lockfile.

## Acceptance Criteria

- No code path limits the number of split panels.
- Two panels displaying the same document no longer create two BlockNote instances.
- A passive panel remains independently scrollable and visually rich.
- The first click in a passive panel activates a complete editor without a second click, source flash, blank frame, parse, or `replaceBlocks`.
- Typing does not broadcast transactions to peer editor views.
- Tab switching, scrolling, and divider resize satisfy the performance budgets for two and three panels.
- Existing rich-text features and source-mode transitions remain correct.
- Focused editor tests, typecheck, lint, build, and the documented manual performance scenario complete successfully.
