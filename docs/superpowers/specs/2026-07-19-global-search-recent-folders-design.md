# Global Search Recent Folder Shortcuts Design

## Goal

Improve the global search dialog's default state by providing fast access to both recently opened files and recently opened folders while preserving file-only search behavior after the user enters a query.

## Current Behavior

- With an open workspace, the dialog shows up to ten recent searchable files.
- Without an open workspace, the dialog shows recent folders instead of files.
- Entering a query searches files when a workspace is open and filters recent folders when no workspace is open.
- File and folder activation already use the correct existing actions: files are revealed and opened, while folders are loaded as the active workspace.

## Proposed Behavior

### Default State

When the query is empty, the dialog renders two ordered groups:

1. **Files**: up to five recently opened searchable files from the current workspace.
2. **Folders**: up to five recently opened folders.

The file group keeps the existing candidate priority: persisted recent file paths first, then currently open tabs, then the currently selected tree item. Missing files, unsupported file types, and duplicate paths are excluded before the five-item limit is applied.

Each non-empty group has its own label. An empty group is omitted. If both groups are empty, the dialog shows one default-state empty message.

### Search State

When the trimmed query is non-empty:

- Only searchable files in the current workspace are matched by filename or path.
- Folder shortcuts are hidden and recent folders are not searched.
- If no workspace is open, there are no searchable file results and the dialog shows the file-search empty state.

This keeps the input's existing file-search purpose and treats folders strictly as default-state shortcuts.

## Interaction and Accessibility

- Results remain one logical keyboard sequence across both default-state groups.
- Arrow Up and Arrow Down move through all file and folder rows with wraparound.
- Enter activates the selected row using its existing type-specific action.
- Clicking a file reveals it in the file tree, opens it, and closes the dialog.
- Clicking a folder loads it as the active workspace and closes the dialog.
- The selected row continues to be exposed through `aria-activedescendant` and `aria-selected`.
- Group labels are visual structure only; result rows remain part of the same listbox so keyboard selection semantics do not change.
- The result viewport uses a 376-pixel maximum height so both five-item groups fit when space permits, with overflow scrolling retained for smaller windows.

## Component and Data Design

The change remains local to `SearchModal` and its existing tests.

- Replace the shared ten-result default limit with a five-item per-group limit.
- Derive recent file results and recent folder results separately in memoized values.
- Build a flattened result array for selection, activation, and accessibility.
- Render that array through two visual groups in the default state and one file group in the search state.
- Reuse the existing `recentOpenedFilePaths`, `recentFolders`, `loadTree`, and `openFile` APIs; no persistence, preload, IPC, or store schema changes are required.

## Error and Edge-Case Handling

- Stale recent file paths are ignored because only files present in the current tree can become results.
- Unsupported files remain excluded by the existing `.md` and `.txt` rule.
- Fewer than five available items are shown without placeholders.
- Duplicate recent file candidates appear only once.
- A group with no valid items does not leave an empty heading or spacer.
- Closing and reopening the dialog continues to clear the query and reset selection to the first available row.

## Verification

Component tests will cover:

- Default rendering of at most five recent files and five recent folders.
- Correct group order and labels.
- File-history fallback behavior under the new five-item limit.
- Folder activation while a workspace is already open.
- Folder shortcuts disappearing after query input.
- File-only query results and the no-workspace query empty state.
- Keyboard navigation and Enter activation across the file-to-folder group boundary.
- Empty-group and fully empty default states.

Repository verification will run the focused component test, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

## Out of Scope

- Searching inside file contents.
- Searching arbitrary filesystem directories.
- Changing how recent files or folders are persisted or capped in their stores.
- Adding tabs, filters, commands, or a separate directory search mode.
- Refactoring unrelated search, tree, editor, or Electron APIs.
