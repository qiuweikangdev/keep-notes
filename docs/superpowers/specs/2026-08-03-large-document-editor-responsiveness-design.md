# Large Document Editor Responsiveness Design

## Problem

Rich-text documents around 18,726 characters can make the renderer unresponsive. A content change schedules a whole-document BlockNote-to-Markdown serialization on the renderer thread. File-tree navigation then waits for the pending serialization and disk flush before beginning the target file transition. The Markdown snapshot and auto-save request are only updated after serialization completes, so the same bottleneck appears as typing lag, blocked file switching, and stale disk content.

## Goals

- Keep rich-text input and file navigation responsive for documents at or above the existing 10,000-character large-document threshold.
- Preserve the latest edit and the existing automatic-save result.
- Preserve Markdown formatting, source-preservation behavior, tab reuse, undo history, file watching, and small-document behavior.
- Make the change local to scheduling and transition ordering.

## Non-Goals

- Do not replace BlockNote or introduce a new editor mode.
- Do not redesign tabs or automatically open extra tabs.
- Do not implement incremental Markdown serialization.
- Do not change the on-disk Markdown format or parser rules.
- Do not add dependencies.

## Selected Approach

Use the existing large-document threshold to apply two targeted changes.

First, large-document background serialization will use a real quiet-period debounce before requesting browser idle time. The current `requestIdleCallback` timeout remains an execution deadline rather than being treated as a debounce delay. Small documents keep the existing immediate idle scheduling behavior. Explicit save and close operations continue to bypass the quiet-period delay.

Second, file-tree navigation will start and complete the target file transition before awaiting the previous large rich-text document's serialization. The previous rich-document session will be retained with `RichDocumentSessionManager.retainBackground` until serialization and the save coordinator finish. This retains the exact live BlockNote tree while the reused tab moves to the target file. The background flush starts only after the target snapshot has been committed, allowing React to paint the switch first.

Small documents and source-mode documents will keep the current synchronous flush-before-reuse path.

## Components

### Large-document scheduler

`editor-large-document.ts` will own the large-document scheduling constants and a cancelable scheduling helper. The helper will support:

- an optional minimum quiet period;
- browser idle execution after the quiet period;
- an idle timeout so work cannot starve indefinitely;
- cancellation before either the delay or idle callback executes.

The helper will accept injected timer and idle APIs in tests so behavior can be verified without relying on real browser timing.

### Rich editor integration

`blocknote-editor.tsx` will use the helper for automatic serialization. Large documents will pass the configured quiet period; small documents will pass zero and retain current behavior. Explicit runtime `serializePendingChange` will continue to cancel scheduled work and serialize immediately.

### File transition coordination

`use-electron.ts` will distinguish the existing synchronous path from a large rich-text background path.

For the background path it will:

1. Retain the old document session by path and tab ID.
2. Mark and load the target file using the existing transition controller.
3. After the target content has been committed, start the old runtime flush without awaiting it from the navigation action.
4. Flush the old path through `EditorSaveCoordinator`.
5. Release the background retention only after the flush finishes.

The old session controller already writes its serialized Markdown to the editor cache and schedules the original I/O path, so no Markdown or file API behavior changes are required.

## Error Handling

- Serialization errors continue to use the rich editor's existing parse/error handling.
- Disk-write failures continue to use `EditorSaveCoordinator` state handling.
- Background retention is released in a `finally` block to avoid permanent session retention.
- A rejected background operation must be caught so it cannot create an unhandled promise rejection.
- Existing successful navigation is not rolled back after a background save failure; the latest serialized snapshot remains in the editor cache and the existing save error path remains authoritative.

## Performance Constraints

- Automatic large-document serialization must not be requested before the quiet period expires.
- Repeated edits must replace the pending delayed task rather than enqueue multiple whole-document serializations.
- Large-document file navigation must commit the target transition without waiting for the old serialization promise.
- The old document runtime must remain registered until its flush settles.
- No new React state subscription or document-wide render pass may be added.

## Test Strategy

Add focused regression tests before production changes:

1. A scheduler test proves that a large-document task is not submitted to `requestIdleCallback` before the quiet period and that rescheduling/cancellation prevents stale execution.
2. A BlockNote editor test proves that large-document automatic serialization waits for the quiet period while explicit flush remains immediate.
3. A file-opening coordination test proves that the target transition completes while the previous large-document flush is unresolved.
4. The same test proves background retention is held until serialization and saving settle.
5. Existing small-document, overlapping-serialization, session, save-coordinator, and file-transition tests remain green.

Repository verification remains `pnpm typecheck`, `pnpm lint`, and `pnpm build` after the targeted tests pass.

## Compatibility

The implementation uses the existing 10,000-character threshold, editor session manager, editor cache, save coordinator, and file transition state. It introduces no persisted state, migration, IPC change, dependency change, or packaging change.
