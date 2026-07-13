# Code Block First-Line and Focus Repair Design

## Problem

The rich-text editor mishandles malformed fenced code openings such as:

````markdown
```bashWrite a while True loop
read tasks from the database
```
````

BlockNote treats the entire text after the opening fence as the code block language. The language control then displays a long value, its wrapped text overflows the toolbar, and the intended first code line disappears from the CodeMirror document. The Bash language control also displays `sh` even when the canonical language is `bash`.

CodeMirror normally receives focus when the user clicks its content or the code block shell. However, the shell focus handler explicitly excludes all CodeMirror gutters, so clicking a line number or some left-side whitespace can leave the code block without an editing caret. An overflowing language control can also cover the first code line and intercept clicks.

## Goals

- Repair a malformed fenced-code opening when it starts with a supported language or alias followed by intended first-line content.
- Preserve the recovered first-line content inside the code block.
- Store the repaired Markdown source so the problem does not return after reload.
- Display `bash` for canonical Bash code blocks while continuing to accept `sh`, `shell`, and `zsh` as aliases.
- Keep the language control on one line and prevent it from covering code content.
- Focus CodeMirror when the user clicks code content, line-number gutters, or non-control whitespace inside the code block.
- Preserve language-picker, copy-button, folding, selection, and source-preservation behavior.

## Non-Goals

- Supporting arbitrary Markdown info-string attributes such as filenames or executable flags.
- Replacing BlockNote's Markdown parser.
- Refactoring the existing CodeMirror node view or language registry beyond the required behavior.
- Changing syntax-highlighting support for Bash.

## Selected Approach

Extend `repairMarkdownSourceBeforeParse` with a fenced-code repair pass. This is the existing boundary for normalizing known malformed Markdown before BlockNote parses and caches it. The editor load flow already writes a repaired source through `onChange`, updates its cache, and uses the repaired source as the preservation baseline.

For each opening backtick or tilde fence outside another fenced block:

1. Read the text following the fence.
2. Match the longest supported language identifier or alias at the beginning, case-insensitively.
3. If additional non-whitespace content remains, keep the canonical language on the opening line and insert the remaining content as the first code line.
4. Preserve indentation, fence marker and length, line-ending style, closing fence, and final source ending.
5. Leave valid openings, empty openings, unsupported language values, and fenced content unchanged.

Example:

````markdown
```bashWrite a while True loop
read tasks from the database
```
````

becomes:

````markdown
```bash
Write a while True loop
read tasks from the database
```
````

Aliases are canonicalized by the repair only when malformed first-line content is recovered. Thus `shRun the worker` becomes an opening `bash` fence followed by `Run the worker`, while an already valid ` ```sh ` opening remains valid and continues to parse as Bash.

## Language Control

Change the Bash option's short label from `sh` to `bash`. Keep its aliases unchanged so existing Markdown and search behavior remain compatible.

Add a no-wrap and overflow constraint to the language trigger. Correct values remain fully visible, while unexpected legacy values cannot expand vertically over the CodeMirror content.

## Focus Behavior

Keep CodeMirror's native content click handling so a click selects the exact character position. The shell fallback continues to focus CodeMirror for non-control whitespace. Remove the blanket gutter exclusion so line-number gutter clicks also focus the code editor. Fold controls retain their existing event handling and folding behavior.

Toolbar controls and the language popover remain excluded from the focus fallback because they have their own intentional focus behavior.

## Testing

Add regression coverage for:

- repairing `bash` joined directly to Chinese or English first-line content;
- repairing a Bash alias followed by first-line content;
- preserving the recovered first line in parsed code block content;
- leaving valid, unsupported, nested, and already closed fence cases unchanged;
- preserving backtick/tilde fence style and source line endings;
- displaying `bash` for Bash code blocks while resolving legacy aliases;
- constraining the language trigger to a single line;
- focusing CodeMirror from the line-number gutter and shell whitespace;
- retaining precise CodeMirror content-click focus and fold-gutter behavior.

Run the focused Vitest suites first, followed by `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

## Files Expected to Change

- `src/renderer/src/features/editor/lib/markdown.ts`
- `src/renderer/src/features/editor/lib/markdown.test.ts`
- `src/renderer/src/features/editor/lib/editor-code-block-languages.ts`
- `src/renderer/src/features/editor/lib/editor-code-block-languages.test.ts`
- `src/renderer/src/features/editor/lib/editor-code-block-node-view.ts`
- `src/renderer/src/features/editor/lib/blocknote-schema.test.ts`
- `src/renderer/src/styles/blocknote-overrides.css`
- `src/renderer/src/styles/blocknote-overrides.test.ts`

No main-process, preload, IPC, dependency, or lockfile changes are required.
