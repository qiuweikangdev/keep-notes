# Untitled Draft Protection Design

## Problem

An untitled tab is currently reused whenever the user opens another file. If the tab already contains edited content, loading the selected file replaces that content even though the untitled tab is an unsaved draft.

Window-close protection also mirrors only the active tab's dirty flag to the main process. After an untitled draft moves to the background, a clean active file can therefore make the window appear clean and bypass the existing save confirmation.

## Goals

- Preserve an edited untitled tab when another file is opened.
- Continue reusing a truly blank, clean untitled tab when opening a file.
- Trigger the existing native save confirmation when any editor tab has unsaved content, including a background draft.
- When the user chooses Save, activate the unsaved tab and save it before the window closes. Untitled drafts use the existing Save As dialog.
- Keep the existing confirmation copy, native dialog style, file loading pipeline, and normal named-file save behavior.

## Design

### File Opening

The renderer will treat a tab as reusable only when all of the following are true:

- `filePath` is `null`;
- `pendingFilePath` is `null`;
- the tab is not dirty; and
- the stored content is blank.

When the active tab satisfies those conditions, opening a file keeps the existing reuse behavior. When the active tab is an edited untitled draft, `openFile` creates and activates a new tab in the same panel group, then loads the selected file into that new tab. The draft remains in the group with its content and dirty state unchanged.

The reusable-tab decision will be implemented as a small pure selector so its boundary cases can be covered without mounting the full Electron integration hook.

### Window Dirty State

`EditorBridge` will derive the window dirty state from all tabs in all panel groups rather than from only the active tab. The initial IPC synchronization and subsequent store subscription will both use the same aggregate selector. The legacy global dirty flag remains a fallback only when no panel tabs exist.

This makes a background draft sufficient to trigger the existing main-process close confirmation.

### Save During Window Close

The renderer bridge will expose a close-save snapshot for the next dirty tab. It will prefer the active tab when that tab is dirty; otherwise it will select the first dirty tab in panel order and activate its group and tab before returning its identifiers, content, and file path.

The main process will save that exact snapshot instead of reading whichever tab happens to be active. A named file is written directly. An untitled draft opens the existing Save As dialog. After a successful save, the renderer marks the matching tab clean and assigns the selected path when applicable.

Before destroying the window, the close flow will request another dirty snapshot. If additional dirty tabs exist, it will save them in the same way. Canceling any Save As dialog leaves the window open and preserves all remaining dirty tabs. Choosing Don't Save continues to destroy the window immediately, and choosing Cancel in the confirmation leaves the window unchanged.

## Error Handling

- A canceled Save As operation aborts the close sequence without changing the draft.
- If the window is destroyed while a dialog or renderer request is pending, the close sequence stops.
- A save or renderer-bridge error is logged and leaves the window open so unsaved content is not discarded.
- File-open errors remain handled by the existing file-open controller and do not mutate the preserved draft.

## Testing

Follow red-green-refactor for each behavior:

- Add a renderer test proving an edited untitled tab is not reusable, while an empty clean untitled tab remains reusable.
- Add an `EditorBridge` test proving a background dirty draft reports the window as dirty and is selected as the close-save target.
- Extend the main-process window tests to prove Save uses the returned dirty draft snapshot, opens Save As for an untitled draft, marks the matching tab saved, and does not close when Save As is canceled.
- Run the focused Vitest files during development, then run `pnpm typecheck`, `pnpm lint`, and `pnpm build` as required by the repository.

## Scope

No tab-title changes, draft autosave, crash recovery, custom confirmation UI, IPC protocol redesign, or unrelated editor refactoring are included.
