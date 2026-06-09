# Markdown Editor Tolaria Adaptation Design

## Context

Keep Notes is an Electron, Vite, React, TypeScript desktop application. It
already uses BlockNote for rich-text Markdown editing, Zustand for renderer
state, Electron IPC for filesystem access, and a recursive React file tree.

The current implementation works for basic editing, but several responsibilities
are coupled:

- File loading, editor document replacement, file watching, serialization, and
  disk writes live in the editor component.
- File tabs contain content but do not model loading, failure, saving, editor
  mode, or scroll restoration.
- A file switch updates the tab only after the asynchronous read completes,
  which leaves the previous document visible during loading.
- Each editor change can lead quickly to Markdown serialization and disk I/O.
- Tree nodes subscribe to broad Zustand state slices, so selection and editor
  changes can invalidate many nodes.
- Markdown conversion rules are embedded in the editor component instead of a
  reusable adapter.

Tolaria solves the same class of problems with path-scoped content caching,
explicit tab-swap lifecycle management, stale-operation cancellation, deferred
serialization and saving, parsed-block reuse, loading canvases, and narrowly
subscribed list components. Keep Notes will adapt those ideas to its existing
Electron IPC and Zustand architecture rather than copying Tolaria's Tauri and
application orchestration code.

## Product Decision

Use a dual editing experience:

1. BlockNote rich-text editing is the default and acts as the live Markdown
   preview.
2. A raw Markdown source mode is available for exact syntax editing.
3. Both modes share one path-scoped content model and one persistence pipeline.

There is no separate continuously rendered preview pane. Rendering a second
document during every edit would add avoidable parsing and layout work, while
BlockNote already provides the Tolaria-style live rendered editing experience.

## Reference Mapping

The implementation adapts the following Tolaria concepts:

| Tolaria concept | Keep Notes adaptation |
| --- | --- |
| `useEditorTabSwap` | A smaller path-aware editor document controller |
| `noteContentCache` | Bounded renderer-side file content cache |
| parsed block cache | Bounded BlockNote block cache keyed by path and source |
| stale swap tokens | Per-tab load request IDs and document apply tokens |
| `useEditorSave` | Debounced path-scoped save coordinator with explicit flush |
| loading canvas | Editor skeleton that replaces stale content during a switch |
| raw editor mode | Lightweight Markdown source editor using a controlled textarea |
| memoized note list | Fine-grained Zustand selectors and memoized tree nodes |
| `EditorTheme.css` | Scoped BlockNote typography and Markdown element rules |

The following Tolaria capabilities are intentionally excluded:

- Frontmatter-backed note types and properties
- Wikilinks, math, Mermaid, and tldraw custom blocks
- Tauri-specific vault validation and filesystem cache identity checks
- AI panels, backlinks, and note metadata orchestration

These are outside the requested Markdown editor scope and would require product
decisions beyond this adaptation.

## Editor State Model

Each `EditorTab` remains owned by `editor.store.ts`, with these additions:

```ts
type EditorMode = "rich" | "source";
type LoadStatus = "idle" | "loading" | "ready" | "error";
type SaveStatus = "clean" | "dirty" | "saving" | "error";

interface EditorTab {
  id: string;
  filePath: string | null;
  content: string;
  wordCount: number;
  isDirty: boolean;
  reloadKey: number;
  mode: EditorMode;
  loadStatus: LoadStatus;
  saveStatus: SaveStatus;
  errorMessage: string | null;
  loadRequestId: number;
  scrollTop: number;
}
```

`isDirty` is retained for compatibility with the existing menu and window-close
bridge. `saveStatus` provides the richer UI state.

Store mutations operate on one tab at a time and preserve referential equality
for unaffected groups and tabs. Components select only the data they render.

## File Opening and Switching

Opening a file follows this sequence:

1. Resolve the target panel and tab.
2. Flush pending rich-editor serialization and pending disk save for the
   currently active path.
3. Mark the target tab as active immediately.
4. Assign the target path and a new `loadRequestId`, set `loadStatus` to
   `loading`, clear any previous error, and show a loading skeleton.
5. If a fresh content cache entry exists, apply it immediately.
6. Otherwise read through Electron IPC.
7. Apply the result only when the tab still has the same path and request ID.
8. An empty string is a valid ready document and must replace all old blocks.
9. A read failure sets `loadStatus` to `error` without changing another file's
   content.
10. Successful application updates the selected tree key and recent-file list.

This guarantees that a slow read cannot overwrite a newer file selection.

Tabs are reused according to the existing behavior: a tree click loads into the
active tab. Explicit new-tab and split operations continue to create independent
tab instances.

## Editor Document Lifecycle

One BlockNote editor instance is retained per visible panel. Switching tabs does
not remount the whole application.

Before applying another document:

- Flush the current debounced editor change.
- Cache the current path's BlockNote document and scroll position.
- Suppress BlockNote change notifications.
- Clear browser selection associated with the old document.

When applying the target:

- Reuse cached blocks only if their source Markdown exactly matches tab content.
- Otherwise parse Markdown through the shared adapter.
- Use an apply token so a late parse cannot replace a newer document.
- Replace an empty file with one empty paragraph block.
- Restore the cached scroll position after the new document has painted.
- Release change suppression only after the replacement is complete.

If parsing fails, the original Markdown remains untouched, the tab enters source
mode, and the UI displays a non-destructive warning.

## Markdown Adapter

Markdown conversion moves to `features/editor/lib/markdown.ts`.

Responsibilities:

- Parse Markdown to BlockNote blocks.
- Serialize BlockNote blocks to Markdown.
- Normalize unordered list markers to `-`.
- Normalize line endings to LF.
- Remove trailing spaces without changing indentation.
- Preserve an intentional final newline.
- Compare normalized text to avoid format-only writes.
- Return typed success or failure results instead of throwing into UI code.

Supported syntax follows BlockNote's CommonMark and GFM-compatible surface:

- Paragraphs and headings
- Bold, italic, strikethrough, links, and inline code
- Fenced code blocks with language identifiers
- Ordered, unordered, nested, and task lists
- Blockquotes
- Tables
- Horizontal rules
- Images

Raw HTML is treated as text or unsupported Markdown. Keep Notes does not insert
Markdown as arbitrary HTML and never uses `dangerouslySetInnerHTML`, preventing
Markdown-authored scripts from executing in the renderer.

## Source Mode

Source mode uses a controlled, plain-text textarea rather than adding a new
editor dependency. This keeps the implementation small and makes source editing
exact and safe.

Behavior:

- It uses the same tab content as rich mode.
- Input updates the active tab immediately and schedules disk persistence.
- `Tab` inserts two spaces rather than moving focus.
- Switching back to rich mode flushes source input, parses it, and applies the
  result.
- Parse failures keep source mode active and preserve the exact source.
- The source editor restores its own scroll position for each tab.
- The toolbar exposes a clearly labelled rich/source toggle and save state.

Syntax highlighting is not included in this iteration because the project has no
CodeMirror dependency. Exact Markdown editing, safe round-tripping, and stable
switching take priority. The source component boundary permits CodeMirror to be
added later without changing tab or persistence state.

## Persistence

Editing uses two distinct debounce stages:

1. Rich editor to Markdown serialization: about 250 ms after editor changes.
2. Markdown to disk persistence: 800 ms after the latest tab content change.

The save coordinator is keyed by file path, not by mounted component. Only the
latest pending content for a path is persisted. Writes for one path cannot clear
the dirty state of another path.

Pending work is flushed when:

- The active file changes
- A tab closes
- The user invokes Save
- The component unmounts
- The application requests editor content through the bridge

External file changes:

- Self-authored writes are ignored using path and content revision tracking.
- A clean tab accepts external content and reloads its editor document.
- A dirty tab keeps local content and shows an external-change conflict state
  instead of silently overwriting work.

## Loading, Empty, and Error States

- No open tab: a concise instructional empty state.
- File loading: a stable skeleton within the target editor canvas.
- Empty file: a ready, focusable empty paragraph with a writing prompt.
- Read error: file name, concise error message, and Retry action.
- Parse warning: source mode with the original Markdown preserved.
- Save error: persistent status in the editor toolbar with Retry Save.

Loading and errors are scoped to the target tab. Other panels continue working.

## File Tree Performance

The recursive tree structure remains because it matches the current codebase and
does not require a new virtualization dependency.

Optimizations:

- Store expanded paths as a `Set<string>` internally for constant-time checks.
- Each node subscribes only to whether its own path is selected and expanded.
- Editor tab content is not subscribed to by every tree node.
- Diff lookup reads editor state imperatively only when the Diff action runs.
- Memoized child nodes receive stable creation callbacks.
- Search filtering is memoized and uses one lowercase query.
- Collapsed subtrees are not rendered.
- The active file path is reflected immediately through `selectedKey`.

Virtualization is deferred. It becomes necessary only if profiling still shows
slow initial rendering for unusually large fully expanded trees.

## Visual Design

The editor remains visually restrained and uses the existing theme tokens.

- Normal reading width: 760 px maximum.
- Horizontal padding: responsive, with a 16 px minimum in narrow panels.
- Body: configurable 16 px default with 1.75 to 1.8 line height.
- Paragraph spacing: visible but compact for long-form writing.
- H1 has clear separation; H2 to H4 use progressively smaller spacing and type.
- Code blocks use the secondary surface, a compact border, mono font, and
  horizontal overflow.
- Inline code uses a subtle tinted background without excessive contrast.
- Lists maintain stable marker width and nested indentation.
- Task checkboxes align to the first text line.
- Blockquotes use a thin one-pixel logical border and muted text, avoiding a
  decorative heavy side stripe.
- Tables scroll horizontally when needed and use restrained row and header
  contrast.
- Links, images, emphasis, and horizontal rules use existing theme tokens.
- Editor-specific transitions and animations are disabled to protect caret and
  selection stability.
- Loading uses a skeleton, not a central spinner.
- Reduced-motion preferences disable non-essential transitions.

## Component Boundaries

New or revised units:

- `editor.store.ts`: tab state and focused mutations
- `editor-session.ts`: load request and cache coordination
- `editor-save-coordinator.ts`: path-scoped debounced writes and flush
- `markdown.ts`: Markdown parse, serialize, normalization, and comparison
- `blocknote-editor.tsx`: BlockNote lifecycle only
- `markdown-source-editor.tsx`: exact source editing
- `editor-workspace.tsx`: toolbar and state composition
- `editor-state-view.tsx`: loading, error, and empty states
- `tree-node.tsx`: fine-grained subscriptions and memoized row rendering

Electron filesystem operations remain in the main process and continue to be
exposed through the narrow preload API.

## Testing Strategy

The repository has no existing test runner, so behavior-heavy logic will be
written as pure modules suitable for TypeScript-level tests. If adding a test
runner is required, Vitest and React Testing Library are the preferred fit for
the Vite and React stack.

Required regression coverage:

- A slower first file load cannot overwrite a later selection.
- Switching to an empty file clears the previous document.
- Different tabs never share content accidentally.
- Reopening unchanged content reuses parsed blocks.
- A stale Markdown parse result is ignored.
- Pending content flushes before path changes.
- Save completion affects only the matching path and revision.
- Markdown normalization preserves indentation and meaningful newlines.
- Parse failure preserves exact source content.
- Tree selection and expansion selectors change only affected nodes.

Manual verification covers:

- Rapid file switching
- Empty and unreadable files
- Large Markdown documents
- Rich/source mode round trips
- Nested lists, tasks, tables, quotes, code languages, images, and links
- Light, dark, Nord, Dracula, and Solarized themes
- Keyboard focus, selection, caret, and scroll restoration

Final repository gates:

```text
pnpm typecheck
pnpm lint
pnpm build
```

## Acceptance Evidence

The work is complete only when:

- Automated regression checks cover file-switch races, content isolation,
  parsing, normalization, and save coordination.
- TypeScript, ESLint, and production build commands pass.
- Runtime inspection shows no stale-content flash during rapid switching.
- Empty, loading, parse failure, read failure, and save failure states are
  visibly distinct and recoverable.
- Rich and source modes render the same supported Markdown semantics.
- Profiling or render instrumentation confirms unrelated tree nodes and tabs do
  not rerender on editor keystrokes.
- The final visual pass confirms readable long-form typography and consistent
  rendering across all existing themes.
