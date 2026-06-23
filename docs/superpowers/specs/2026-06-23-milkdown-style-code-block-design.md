# Milkdown-Style Code Block Design

## Goal

Rebuild the editor code block as a custom CodeMirror 6 editing surface that matches Milkdown's code block behavior: syntax highlighting, folding, language search, good long-code performance, and predictable Backspace deletion of empty code blocks.

## Background

The current implementation has been partially migrated from Shiki-rendered BlockNote code blocks to CodeMirror 6. It still has weak boundaries between three surfaces:

- BlockNote's hidden content host
- the visible CodeMirror editor
- the outer rich editor keyboard and selection handlers

That split causes real interaction bugs: folding can fail when a language does not provide a CodeMirror parser, code block select-all can be intercepted by the outer editor, and long code blocks still pay costs from extra DOM/synchronization work.

Milkdown's reference implementation uses a CodeMirror-backed NodeView:

- CodeMirror owns editing, selection, syntax highlighting, folding, and keymaps.
- CodeMirror changes are mapped back to the ProseMirror document.
- Language selection updates the code block language attribute.
- Empty-code Backspace replaces/removes the code block and returns focus to the outer editor.
- IntersectionObserver can defer CodeMirror initialization for off-screen blocks.

This project will keep BlockNote as the document editor, but the code block editing body should follow the same architecture.

## Non-Goals

- Do not migrate the whole editor from BlockNote to Milkdown.
- Do not add preview panels or search/replace UI unless CodeMirror already provides it through basic extensions.
- Do not redesign the entire editor theme.
- Do not introduce unrelated markdown or file-tree refactors.

## Architecture

### Code Block Ownership

`EditorCodeBlock` remains the custom React renderer for BlockNote code blocks, but CodeMirror becomes the only visible editing surface.

BlockNote keeps ownership of:

- block identity
- markdown serialization
- language attribute persistence
- outer document focus before/after the code block

CodeMirror owns:

- editable code text
- selection and `Mod-A`
- folding
- syntax highlighting
- local cursor movement
- Backspace inside the code block

The hidden BlockNote content host should be reduced to the smallest compatibility layer needed for BlockNote content references and serialization. It must not render highlighted DOM or drive visible editing.

### Synchronization

CodeMirror-to-BlockNote updates should be incremental where possible:

- Use CodeMirror update changes to derive the next code text.
- Update the hidden host only when its text differs.
- Call `editor.updateBlock(block.id, { content: nextCodeText })` after CodeMirror doc changes.
- Avoid triggering a full document or full code DOM rewrite on every fold or selection change.

BlockNote-to-CodeMirror updates should:

- Read the hidden host text only when BlockNote mutates it.
- Apply a minimal text diff to CodeMirror instead of replacing the whole document when external content changes.
- Ignore mutations caused by CodeMirror's own sync pass.

### Language Loading

Language support should be modeled after Milkdown's `LanguageLoader`:

- Keep the existing app language option list as the UI source of truth.
- Add a CodeMirror language loader that maps `id`, `shortLabel`, `label`, and aliases to CodeMirror language extensions.
- Use native CodeMirror language packages where already available.
- For unsupported languages, fall back to plain text plus the custom fallback folding service.

Recommended language support for this pass:

- JavaScript, TypeScript, JSX, TSX
- JSON
- HTML, XML, Vue
- CSS, SCSS
- Markdown
- Python if dependency is available or can be added
- Plain text fallback

### Folding

Folding should work in two layers:

1. Native CodeMirror folding from parser-backed languages.
2. A fallback fold service for common structures when no parser exists.

The fallback service should support:

- braces and brackets
- HTML/XML-like tags
- indentation blocks
- import regions where the existing helper already handles them safely

Clicking the gutter fold marker should only fold the current foldable region. It must not collapse unrelated lines or reformat indentation.

### Select-All

When focus is inside CodeMirror:

- `Mod-A` / `Ctrl-A` selects only the CodeMirror document.
- The event must not bubble to the outer rich editor select-all handler.
- The visible CodeMirror selection should match the CodeMirror state selection.

When focus is outside CodeMirror but inside the code block shell, existing code-block-specific selection behavior may still select the code block text.

### Backspace Deletion

Backspace inside CodeMirror should follow Milkdown's behavior:

- If there is a selection, use normal CodeMirror deletion.
- If the cursor is not at position `0`, use normal CodeMirror deletion.
- If the document has two or more lines, use normal CodeMirror deletion.
- If the document is empty or a single empty line and the cursor is at position `0`, the next Backspace deletes the code block from the outer document.

For this app, deleting the code block should:

- Prefer replacing it with an empty paragraph when needed to keep the document editable.
- Move focus to the outer editor near the deleted block.
- Avoid deleting adjacent user content.

### Performance

Long code blocks must avoid extra parsing/rendering work:

- No Shiki highlighter in the BlockNote code block path.
- CodeMirror should be initialized only when needed.
- For off-screen code blocks, use a lightweight placeholder and delayed teardown when not focused.
- Do not recreate CodeMirror on every React render.
- Do not replace the entire CodeMirror document for small edits.
- Do not observe a large highlighted subtree; the hidden host should be plain text.

The first implementation can use a conservative IntersectionObserver gate:

- initialize immediately when IntersectionObserver is unavailable
- initialize when the block enters a `200px` root margin
- keep initialized while focused
- destroy after a short delay when off-screen and unfocused

## UI Behavior

The visible UI should remain consistent with the current app:

- toolbar with language trigger and copy button
- searchable language popover
- CodeMirror line numbers
- CodeMirror fold gutter
- color palette aligned with the existing editor code block colors

The language popover should be updated to match Milkdown behavior:

- search by language id, label, short label, and aliases
- selected language appears first when filtering
- Escape clears search
- Enter selects the focused option
- outside click closes the popover

## Testing Strategy

Use focused unit/component tests before implementation changes:

- CodeMirror `Mod-A` selects the full CodeMirror document and does not select the outer editor.
- Folding works for JSON/parser-backed code.
- Folding works for Vue/HTML-like code.
- Folding works for Python/indentation-based code without a dedicated parser.
- Folding does not mutate code text or indentation.
- Fold click does not bubble to parent BlockNote handlers.
- Language search filters by label, id, short label, and alias.
- Backspace on empty code block deletes/replaces the code block.
- Backspace with non-empty code uses normal CodeMirror behavior.
- Large code block tests assert no Shiki highlighter export/config remains and no highlighted subtree is required.

Run focused tests first, then:

- `pnpm typecheck`
- `pnpm lint`

Do not run `pnpm build` unless explicitly requested, because the user previously asked not to build during this investigation.

## Migration Notes

The project already has CodeMirror dependencies in `package.json`. Additional language packages may be added only when needed for first-class language support. If adding packages requires network access, request escalation and keep the dependency list minimal.

Existing helper files for fallback folding may be retained if they are still used by the fallback fold service. Otherwise, remove unused legacy preview/highlighting helpers during the cleanup phase.

## Acceptance Criteria

- Code block folding works from the gutter for current block regions only.
- Code block `Mod-A` selects the current code block content only.
- Syntax highlighting is CodeMirror-based and visually aligned with the previous code palette.
- Shiki is not used in the editor code block rendering path.
- Long code blocks remain responsive because visible editing is handled by CodeMirror and off-screen blocks are lightweight.
- Backspace deletes an empty code block only when the cursor is at the beginning and normal deletion no longer applies.
- Existing editor save/serialization behavior still persists code text and language.
