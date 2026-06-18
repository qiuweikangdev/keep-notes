# Editor Content Blocks Design

## Context

Keep Notes uses BlockNote as the rich Markdown editor inside an Electron, Vite,
React, and TypeScript desktop application. The editor already parses Markdown
through `features/editor/lib/markdown.ts`, renders rich blocks through
`blocknote-editor.tsx`, and applies visual corrections in
`styles/blocknote-overrides.css`.

The requested improvement focuses on Markdown content blocks that users expect
to read and edit comfortably in a notes app:

- Check lists should display as square task checkboxes.
- Bullet lists should support clear nested levels.
- Quotes should render with a simple left rule.
- Code blocks should support common languages, language search, Shiki syntax
  highlighting, line numbers, an active-line visual, and a right-side floating
  copy button.

The implementation should preserve Markdown round trips and avoid unrelated
changes to the editor persistence, file watching, or tab lifecycle.

## Scope

This design includes:

- Rich-editor visual and interaction updates for checklist, bullet list,
  quote, and code block rendering.
- A common programming-language set for fenced code blocks.
- A polished searchable language picker opened from the code block's left
  control area.
- Shiki-powered syntax highlighting for supported code languages.
- A floating copy button on the right side of the code block.
- Regression tests for configuration, rendering helpers, and stylesheet
  expectations where practical.

This design excludes:

- Full Shiki language catalog support.
- CodeMirror-level code editing, diagnostics, folding, minimap, or autocomplete.
- Mermaid, math, frontmatter, backlinks, or custom Markdown extensions.
- Changes to raw source mode beyond preserving compatibility with the same
  Markdown content.

## Product Behavior

The rich editor remains the default writing experience. Users can type or paste
Markdown such as task lists, nested bullet lists, blockquotes, and fenced code
blocks. The rich editor should show the same semantic content in a cleaner,
more Typora-like presentation.

Code blocks behave as editable Markdown code fences:

- The top-left language control shows the current language label, such as
  `js`, `ts`, `tsx`, `vue`, or `text`.
- Clicking the language control opens a compact searchable popover.
- The popover contains a visually integrated search input, grouped matching
  languages, keyboard-friendly hover and selected states, and a clear empty
  result state.
- Choosing a language updates the code block's `language` property and therefore
  the fenced code language when serialized.
- The top-right copy button floats over the code block surface and copies the
  actual code text, not line numbers or UI labels.
- The copy button confirms success with a short state change, then returns to
  its normal label.
- Line numbers are generated from the code content and update as the block
  changes.
- An active-line background is shown when the cursor is inside a code line. If
  reliable active-line tracking is not available in the first implementation,
  the code block may omit the active-line state rather than showing a misleading
  highlight.

## Visual Design

Lists and quotes should match the application's restrained theme:

- Blockquotes use a thin left border with muted text and no heavy card chrome.
- Checkboxes are square, aligned to the first text baseline, and use the accent
  color when checked.
- Checked checklist text is muted and struck through.
- Bullet list markers and nested indentation remain compact, with visible
  hierarchy between first and second levels.

Code blocks follow the provided reference:

- Dark surface with subtle border and no decorative outer card.
- Language control in the top-left corner as a compact pill, visually lighter
  than the code surface but not loud.
- Search popover aligned to the language pill, with a refined dark surface,
  rounded corners, thin border, soft shadow, and enough width for language names
  without feeling bulky.
- Copy button floats in the top-right corner, using an icon plus text when space
  allows and a compact confirmation state after copying.
- Line number gutter is narrow, non-selectable, and lower contrast than code.
- Code text uses a monospace font, stable line height, horizontal scrolling, and
  Shiki tokens that remain readable in dark and light themes.

The left search area needs special polish because it is the first interactive
control users see inside a code block. It should avoid native select styling,
avoid cramped text, and avoid covering code content. Its open state should look
intentional: search input on top, language options below, selected item
indicated by accent color or check icon, and aliases included in matching.

## Architecture

### Language Configuration

Add a focused editor code-block module, for example:

```text
src/renderer/src/features/editor/lib/editor-code-block.ts
```

Responsibilities:

- Define the common language set and aliases.
- Provide display labels and short labels for the language pill.
- Provide language search helpers.
- Provide Shiki theme selection helpers for light and dark editor themes.
- Export the BlockNote code block spec or the data needed to build it.

The common language set should include:

- `text`
- `javascript` / `js`
- `typescript` / `ts`
- `jsx`
- `tsx`
- `vue`
- `html`
- `css`
- `scss`
- `json`
- `markdown` / `md`
- `bash` / `sh`
- `python` / `py`
- `java`
- `go`
- `rust`
- `c`
- `cpp` / `c++`
- `csharp` / `cs`
- `sql`
- `yaml` / `yml`
- `toml`
- `xml`
- `dockerfile`
- `diff`

Unknown languages parsed from existing Markdown should not destroy content. If
a fence contains an unsupported language, the editor should keep the language
string when possible and fall back to plain text highlighting if Shiki cannot
load a grammar.

### Custom Code Block Rendering

Use a custom BlockNote `codeBlock` block spec so the code block owns its
controls and copied text. It can reuse the same block type and prop shape as the
default `codeBlock` so existing Markdown parsing and serialization continue to
work.

The custom renderer should include:

- Root code block shell.
- Language picker button.
- Searchable language popover.
- Copy button.
- Line number gutter.
- Editable code content region.

The block's content remains BlockNote inline content. This keeps editing,
selection, Markdown serialization, and document caching aligned with the current
editor lifecycle.

Shiki integration should use BlockNote's existing highlighter extension point
when possible. If custom rendering requires a separate path for token colors,
the implementation should still centralize Shiki setup in the code-block module
and load only the common language set.

### Editor Schema

Create a custom BlockNote schema in `blocknote-editor.tsx` or a small adjacent
module. The schema should reuse all default block specs except `codeBlock`,
which is replaced with the custom Shiki-enabled code block spec.

The schema must be passed into `useCreateBlockNote` so parsing, editing,
serialization, and slash-menu behavior all use the same code block definition.

### Clipboard

The copy button should read code text from the block's content DOM or from the
BlockNote block content model. It must copy only the code text. It should use
`navigator.clipboard.writeText` where available and fail silently or show a
brief error state when clipboard access is unavailable.

No filesystem or Electron main-process capability is needed for this clipboard
operation.

## Data Flow

1. Markdown content enters the editor through the existing parse path.
2. BlockNote parses fenced code blocks into `codeBlock` blocks with a
   `language` prop.
3. The custom schema renders each code block with controls and editable code.
4. Changing the language updates the block prop through BlockNote.
5. Editing code content triggers the existing editor change gate and Markdown
   serialization.
6. Serialization preserves the fenced language and content through the existing
   save pipeline.

List and quote styling does not change data flow; it only changes how existing
BlockNote block types are displayed.

## Error Handling

- If Shiki fails to load, code blocks remain editable and fall back to plain
  monospace text.
- If an unsupported language is selected or parsed, the block uses plain text
  highlighting while preserving the language string where possible.
- If clipboard copying fails, the button should not crash the editor. A short
  failed state may be shown.
- If language search has no matches, the popover shows a concise empty result
  state.

## Accessibility

- The language pill is a button with an accessible label.
- The language popover search input is keyboard focusable.
- Options can be navigated with keyboard focus and selected with Enter or click.
- The copy button has an accessible label and does not steal focus from code
  editing after the action completes.
- Line numbers are visually present but excluded from copied text and can be
  marked as presentation-only.

## Testing Strategy

Automated tests should cover:

- Common language definitions include expected ids, labels, and aliases.
- Language search matches ids, labels, and aliases.
- Unsupported or unknown languages fall back without throwing.
- Stylesheet expectations for quote, checklist, nested bullet list, code block
  shell, line gutter, language picker, search popover, and copy button.
- Markdown parse and serialize tests continue to preserve fenced code language
  and content.

Manual verification should cover:

- Creating code fences by typing triple backticks with supported aliases.
- Selecting and searching languages from the left code-block control.
- Copying code from the right floating button.
- Editing multi-line code and confirming line numbers update.
- Viewing checklist, nested bullet list, quote, and code block examples in
  light and dark themes.
- Running `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

## Acceptance Criteria

- Checklists match the square checkbox reference and remain editable.
- Bullet lists show clear nested levels matching the compact reference style.
- Quotes use a clean left-rule presentation.
- Code blocks match the provided reference layout: left language control, right
  floating copy button, line numbers, dark code surface, and Shiki highlighting.
- The language picker is searchable and visually polished, especially around the
  left-side control and popover.
- Common languages and aliases work for both typed fences and picker selection.
- Copying a code block copies code text only.
- Markdown round trips do not lose code fence language or code content.
- Verification commands pass before implementation is considered complete.
