# Code Block Save Fence Separation Design

## Problem

The rich-text editor can display a code block correctly while saving malformed
Markdown. During source-preserving save reconciliation, a newly inserted first
code line can be mapped to the end of the opening fence info string instead of
after its line ending.

For example, the editor document represents:

````markdown
```text
html.h5-layout {
```
````

but the reconciled Markdown can become:

````markdown
```texthtml.h5-layout {
```
````

The BlockNote serializer already emits the correct separation. The corruption
is introduced later by `preserveMarkdownSource`, which transfers serialized
edits onto the original Markdown source while retaining source formatting.

## Goals

- Prevent all future rich-editor saves from joining a fenced-code language and
  the first code line.
- Use the current serialized editor document as structural evidence rather than
  guessing where an ASCII language name ends.
- Preserve source formatting outside the affected fence, including line-ending
  style, list markers, spacing, fence marker style, and final source ending.
- Keep valid code blocks unchanged.
- Add regression coverage that fails on the reported `text` plus
  `html.h5-layout` save sequence.

## Non-Goals

- Automatically repairing files that were already saved with a joined opening
  fence and ASCII first line.
- Broadening `repairMarkdownSourceBeforeParse` to guess unsupported or custom
  language names.
- Changing code-block rendering, language selection, CodeMirror behavior, or
  syntax highlighting.
- Replacing the existing source-preservation algorithm.

## Selected Approach

Add a serialized-output-guided structural guard to the finalization stage of
`preserveMarkdownSource`.

The serialized Markdown is the authoritative representation of the current
editor document. It proves that the language belongs on the opening fence line
and that the first code line belongs on the following line. The reconciled
Markdown remains authoritative for source formatting. The guard compares these
two representations and repairs only a proven fence-line join introduced by the
current save.

This is safer than broad pre-parse recovery because a string such as
`texthtml` may be a legitimate custom language in an existing file. During a
save, however, the serialized form supplies the missing structural context, so
no language-prefix guess is required.

## Reconciliation Rules

The guard runs after the existing character-level or large-document
preservation path has produced a candidate Markdown string and before that
candidate is returned to the editor save flow.

For each fenced code block represented in the serialized Markdown:

1. Identify the serialized opening fence line and its following first code
   line while respecting backtick or tilde fence markers and fence lengths.
2. Check the candidate Markdown for the exact structural failure in which that
   opening line and first code line occur as one joined line.
3. When the failure is proven, restore the boundary between the opening line and
   the first code line.
4. Use the candidate/source line-ending convention for the inserted boundary.
5. Leave the candidate unchanged when the serialized block is empty, the first
   line is already separate, or the joined form cannot be proven.

The comparison must be fence-aware so fence-like text inside an already open
code block is treated as code content, not as another opening or closing fence.
Closing fences remain valid only when they use the same marker, are at least as
long as the opening fence, and contain no trailing non-whitespace content.

## Data Flow

1. BlockNote serializes the current editor blocks to valid Markdown.
2. `preserveMarkdownSource` maps the editor change onto the original source.
3. The new structural guard compares the mapped candidate with the serialized
   fenced-code structure.
4. A proven joined language/first-line boundary is separated.
5. Existing list-marker, quote-list, source-ending, cache, and save behavior
   continues unchanged.

## Testing

Use test-driven development with a failing regression test before production
changes.

Required coverage:

- Reproduce a source-preservation transition that joins ` ```text` and
  `html.h5-layout {`, and require the saved result to contain a newline.
- Verify subsequent edits to the same code block keep the language and first
  line separated.
- Verify backtick and tilde fences remain supported.
- Verify CRLF input retains CRLF at the repaired boundary.
- Verify already valid fenced code is byte-for-byte unchanged when no other
  edit requires a change.
- Verify empty code blocks and fence-like code content are not rewritten.
- Verify unrelated Markdown formatting remains preserved.

Run the focused Markdown test first, then the repository-required checks:

```bash
pnpm test src/renderer/src/features/editor/lib/markdown.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

Finally, use Keep Notes with a non-sensitive test document to confirm that
creating and repeatedly editing a `text` code block never saves its first code
line on the language line.

## Files Expected to Change

- `src/renderer/src/features/editor/lib/markdown.test.ts`
- `src/renderer/src/features/editor/lib/markdown.ts`

No renderer component, stylesheet, main-process, preload, IPC, dependency, or
lockfile changes are expected.
