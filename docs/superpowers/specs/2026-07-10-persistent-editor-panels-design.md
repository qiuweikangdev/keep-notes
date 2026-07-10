# Persistent Editor Panels Design

## Context

Large Markdown documents become unresponsive when a tab is split right or down. The current recursive panel layout replaces a leaf with a nested split node and performs the inverse replacement when a split closes. React therefore unmounts and recreates the affected `EditorPanelGroup`, including its BlockNote instance. Recreating multiple rich-text editors forces expensive document initialization, block replacement, outline work, and serialization setup. It also discards transient editor state and can make a surviving pane appear to change after another pane closes.

The current uncommitted mitigation delays large split-pane initialization and displays the Markdown source in a `<pre>` element. That improves the first layout paint but deliberately exposes raw Markdown and produces the source-to-rich-text flash reported by the user. Existing focused tests cover layout direction and the temporary source snapshot, but they do not assert editor-instance continuity.

## Goals

- Keep each existing BlockNote editor instance mounted while panel layout nodes are split, nested, resized, or collapsed.
- Create exactly one new editor instance for a newly split pane and destroy only the editor instance belonging to a closed pane.
- Preserve simultaneous editing and real-time content synchronization for the same file in multiple panes.
- Keep each pane's independent selection, focus, undo state, and scroll position.
- Remove raw Markdown and blank-content transition frames during split and close operations.
- Make the split command provide immediate visual feedback even for large documents.
- Preserve all current right/down split placement and resize behavior.

## Non-Goals

- Replacing `react-resizable-panels` or redesigning the split-layout model.
- Sharing one BlockNote instance between panes; panes require independent selection and editing state.
- Changing file persistence, autosave timing, Markdown syntax, or external file-watch behavior.
- Refactoring unrelated editor, toolbar, diff, reminder, or file-tree code already modified in the working tree.

## Considered Approaches

### 1. Persistent editor surfaces with stable portals — selected

Render every `EditorPanelGroup` into a stable DOM surface keyed by `groupId`. Layout leaves become lightweight hosts. When the recursive panel structure changes, the existing surface element is moved to the new host before paint while the React portal target and editor subtree remain unchanged.

This directly removes the remount at the root cause, retains the existing layout library, and limits changes to editor layout ownership and focused regression tests.

### 2. Flat CSS Grid or absolute-positioned panels

Keep editors as stable direct children and compute every pane rectangle from the split tree. This can preserve component identity but requires replacing nested resize behavior and maintaining custom geometry. The scope and regression risk are disproportionate to this bug.

### 3. Faster remounts with richer snapshots

Continue recreating editors while caching parsed blocks and displaying a styled snapshot during initialization. This can hide some latency but cannot preserve focus, undo state, or editor identity, and it leaves close operations coupled to surviving panes. It treats symptoms rather than the lifecycle defect.

## Architecture

### Stable surface registry

A renderer-local registry owns two references per panel group:

- A stable surface `HTMLElement` that is the permanent portal target for `EditorPanelGroup`.
- The current layout host `HTMLElement` produced by the matching leaf in the split tree.

Registration and cleanup must be idempotent so React Strict Mode effect replay cannot detach a live surface. Whenever both references exist, the registry appends the surface to the host. Moving the same DOM element changes only its physical parent; it does not change the React portal target or recreate the editor subtree.

If a layout host is temporarily unavailable during one commit, the surface remains owned by the registry and is attached as soon as the replacement host registers. A surface is removed permanently only when its `groupId` no longer exists in `panelGroups`.

### Rendering ownership

`Editor` continues to derive the recursive `PanelLayoutNode` tree for sizing and placement. It additionally renders one persistent portal owner per panel group, keyed by `groupId`. The portal owner creates its surface once and renders `EditorPanelGroup` into it.

`PanelLeaf` no longer renders `EditorPanelGroup` directly. It renders an empty, full-size host and registers that host for its `groupId`. Nested layout reconciliation may freely replace leaf hosts because the expensive editor subtree is no longer their React child.

### Focus and scroll preservation

Before moving a surface, the registry checks whether the active element is inside it. After attachment, it restores focus to the same element with `preventScroll` if the browser changed focus during reparenting. Because the editor DOM nodes are not recreated, the browser selection, BlockNote/ProseMirror state, undo history, and internal scroll container remain intact.

The move occurs in a ref callback or layout effect before paint. No source snapshot is displayed. Existing panes remain continuously visible; only the new pane performs BlockNote initialization.

### New split-pane initialization

The existing parsed-block and serialized-baseline cache remains responsible for avoiding duplicate Markdown parsing and baseline serialization when a split duplicates the active file. The temporary `SplitRichEditorMountGate` and `RichEditorSplitSnapshot` source rendering are removed.

The newly created pane may initialize independently, but it must not delay or remount the source pane. Expensive non-interactive work remains scheduled after the initial paint where the current editor implementation already supports that behavior. No additional dependency is introduced.

### Same-file synchronization

Each pane keeps its unique tab and editor instance. Existing `syncFileContent` behavior continues to update other tabs for the same file and increment their reload keys only when actual serialized content changes. The persistent-surface change does not merge editor state or bypass save coordination.

Closing a pane still flushes its pending editor change and file save before removing the tab. Removing its portal then destroys only that pane. The remaining pane stays mounted and consumes synchronized content only if the flush produced a real content change.

## Interaction Requirements

- Split-right and split-down commands must update panel geometry on the next committed paint without waiting for large-document parsing.
- The source pane must remain readable and interactive while the new pane initializes.
- No raw Markdown `<pre>` snapshot, source editor, or stale content may appear as a rich pane transition.
- Opening or closing a split must not jump the surviving pane to the top, change its selection, clear undo history, or steal focus unexpectedly.
- Resize handles, tab context menus, drag-and-drop targets, find UI, toolbar actions, and keyboard shortcuts must continue to operate from the visually correct pane.
- The active group remains unchanged after splitting, matching the current large-document interaction behavior.

## Error Handling and Cleanup

- Missing hosts are treated as transient layout state, not as a reason to destroy a surface.
- Removing a group unregisters its host, unmounts its portal, and removes its surface element without touching any other registry entry.
- Host cleanup checks reference identity before clearing it so stale Strict Mode cleanup cannot unregister a newer host.
- Surface attachment must never use `innerHTML`, clone editor markup, or execute user-authored HTML.

## Testing Strategy

### Automated regression tests

Extend `editor.test.tsx` with an `EditorWorkspace` test double that records mount and unmount counts by `groupId`.

- Start with two panes, split the nested pane, and assert both existing workspaces remain mounted exactly once while only the new workspace mounts.
- Close the newly created pane and assert it unmounts exactly once while both survivors retain their original instances.
- Close a pane whose sibling survives a nested collapse and assert the sibling is not remounted.
- Cover both horizontal and vertical split directions.
- Assert the correct workspace remains inside each visible leaf host after surfaces move.

Replace the source-snapshot test in `editor-workspace.test.tsx` with assertions that a large rich-text split does not render `split-rich-editor-snapshot` or a Markdown source `<pre>` transition.

Keep cache tests for parsed blocks and serialized baselines to verify that new split panes reuse expensive conversion results.

### Verification

- Run focused Vitest files for editor layout, workspace, cache, and store behavior.
- Run the complete test suite and report unrelated pre-existing failures separately if they remain.
- Run `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
- Manually repeat the GIF sequence with a large document: split right, split the nested pane again, split down, edit in two panes, resize, and close panes in different orders.

## Acceptance Criteria

- Automated lifecycle instrumentation observes zero unmounts for every surviving editor during split and close operations.
- A split adds one editor instance; a close removes one editor instance.
- No raw Markdown transition element is rendered for rich-text panes.
- Existing panes retain scroll position, focus/selection when applicable, and editor content throughout layout changes.
- Editing either pane continues to synchronize the same file without remounting unrelated panes.
- Focused tests, type checking, linting, and production build complete successfully, with any unrelated baseline failures documented rather than hidden.

