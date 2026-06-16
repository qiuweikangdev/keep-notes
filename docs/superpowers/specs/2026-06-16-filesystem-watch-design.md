# Filesystem Watch Design

## Goal

Add filesystem watching so Keep Notes reacts smoothly when files or folders are changed outside the app, while ignoring noisy temporary, dependency, and system-generated paths.

## Scope

This work focuses on the existing local workspace flow:

- Opened editor tabs should receive external content updates for their file.
- The file tree should refresh when relevant files or folders are created, deleted, or renamed outside the app.
- Temporary files, dependency folders, Git internals, OS metadata, editor swap files, and cloud placeholder artifacts should not trigger editor updates or tree refreshes.

This design does not add conflict dialogs, multi-device sync, or a new persistence backend.

## Architecture

The main process owns filesystem access and watcher lifecycle. Renderer code only subscribes through narrow preload APIs and updates the existing Zustand stores.

The implementation keeps the current single-file watch path for opened tabs, then adds a workspace watch path for the current folder tree. Both paths share a focused ignore helper so filtering is consistent between directory traversal and watcher events.

## Ignore Strategy

Create a reusable helper in the main process for path filtering. The initial ignored names and patterns are:

- `.git`
- `node_modules`
- `.DS_Store`
- `.tolaria-rename-txn`
- names that start with `.#`
- names that end with `~`
- names that end with `.tmp`
- names that end with `.swp` or `.swx`
- names that end with `.icloud`

The helper should evaluate every path segment, not just the final basename, so paths under ignored folders are also filtered. It should be easy to extend with more patterns later.

## File Content Updates

Opened editor tabs continue to use `FileWatchRegistry` and `subscribeToEditorFile`. When the main process receives a relevant file change event, it reads the latest file content and emits the existing `file:on-changed` event.

The renderer keeps the existing user-experience policy:

- If the event came from the app's own save, skip it.
- If incoming content equals the current tab content, skip it.
- Otherwise update editor cache and tab content from disk.

This gives smooth external updates without flicker from duplicate events.

## Workspace Tree Updates

Add workspace-level watch IPC:

- `watchWorkspace(rootPath)`
- `unwatchWorkspace(rootPath)`
- `onWorkspaceChanged(callback)`

When a relevant filesystem event happens under the watched workspace, the main process emits one workspace change notification after a short debounce window. The renderer then calls the existing `generateTree(rootPath)` and updates `treeData` / `treeRoot`.

The debounce is important for performance and user experience because many editors save through rename/write sequences that can emit several events in quick succession.

## Performance Rules

- Ignore filtered paths before reading files or refreshing the tree.
- Coalesce workspace events with a debounce window instead of refreshing for every raw event.
- Keep one watcher per opened file path and one watcher per workspace root.
- Close watchers when their last renderer consumer unsubscribes or the window closes.
- Avoid reading file contents for workspace tree events. Only file-tab watchers read file contents.

## Error Handling

File watch read failures should be quiet for transient delete/rename races. The watcher should log unexpected failures but must not break the renderer.

Workspace watch failures should fail gracefully. If a platform cannot recursively watch a folder, the app should still keep the current explicit file watching behavior.

## Testing

Add focused unit tests for:

- Ignore helper filters Git internals, dependencies, temporary files, swap files, and cloud placeholders.
- Directory tree traversal skips ignored folders and files.
- Workspace watch event coalescing emits one notification for multiple fast relevant events.
- Workspace watch event filtering ignores noisy paths.

Existing editor external-change and file watch registry tests continue to cover opened-tab update behavior.
