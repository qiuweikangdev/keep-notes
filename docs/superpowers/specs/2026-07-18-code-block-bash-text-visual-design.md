# Code Block Bash and Text Visual Design

## Problem

The editor renders `bash` and `text` code blocks without a CodeMirror language
parser. Their entire contents therefore inherit the code block's default
foreground color and `600` content weight.

In the dark theme this produces nearly white, visibly heavy text on a near-black
background. The result is more prominent and tiring than the subdued,
monochrome reference treatment. The same default weight also makes plain code
content unnecessarily strong in the light theme.

## Goals

- Make `bash` and `text` code content quieter and less glaring in both dark and
  light themes.
- Match the reference direction with a restrained neutral foreground and normal
  font weight.
- Update the treatment immediately when a code block switches into or out of
  `bash` or `text`.
- Preserve current line numbers, cursor, selection, folding, toolbar, border,
  background, spacing, and editing behavior.
- Leave syntax-highlighted languages unchanged.

## Non-Goals

- Adding a Bash parser or introducing multicolor Bash syntax highlighting.
- Changing the shared code block background or control styling.
- Redesigning the complete code block palette.
- Changing code block serialization, saving, or Markdown behavior.
- Modifying the legacy React code block component that is not used by the
  current BlockNote schema.

## Selected Approach

Use a language-specific CSS treatment on the active code block node view.

The code block shell will expose its normalized language through a
`data-language` attribute. CSS selectors for `bash` and `text` will override
only the CodeMirror content foreground and weight. Theme-scoped custom
properties will supply the two neutral foreground colors:

- Light theme: `#475569`
- Dark theme: `#b7bec8`

Both languages will use `font-weight: 400`. The existing code block background
and all interaction colors remain unchanged.

This approach is deliberately narrower than changing
`--editor-code-block-text`, which is also used by controls and by every other
language. It also avoids a new CodeMirror language dependency and stays aligned
with the monochrome reference.

## Language State

The current node view already normalizes language identifiers and reconfigures
the CodeMirror language extension when the user selects a new language. The
same normalized value will be written to the shell's `data-language` attribute:

1. Set the attribute when the node view is created.
2. Update it whenever `setLanguage` accepts a different normalized language.
3. Let CSS immediately enter or leave the plain-language treatment.

No document content or editor state needs to be rewritten for the visual
change.

## Styling Rules

The new token will be named `--editor-code-plain-text` and defined in both
BlockNote color schemes.

The content override will apply only when the shell language is `bash` or
`text`. Line numbers will continue to use `--editor-code-block-muted`, while
the language selector and copy control will continue to use their existing
tokens. Parsed languages will retain their existing default text color and
syntax-token colors.

The foreground values remain comfortably readable against the existing code
block backgrounds while reducing brightness and weight. The design does not
lower opacity, so selection, focus, and antialiasing remain predictable.

## Alternatives Considered

### Change the global code block text color and weight

This would be simpler, but it would affect JavaScript, TypeScript, CSS, JSON,
and other parsed languages, along with any code tokens that inherit the default
foreground. It would exceed the requested scope.

### Add complete Bash syntax highlighting

A Bash parser would provide semantic colors, but it would introduce additional
implementation and dependency surface. More importantly, a colorful result
would conflict with the quiet monochrome reference.

## Testing

Add focused regression coverage for the active node view and stylesheet:

- A `bash` node view exposes `data-language="bash"`.
- A `text` node view exposes `data-language="text"`.
- Switching from another language to `bash` updates the attribute.
- Switching away from a plain language removes the language-specific match by
  updating the attribute.
- Light and dark themes define the expected plain-text token.
- CSS restricts the softer foreground and normal weight to `bash` and `text`.

Run focused tests first, followed by the repository-required verification:

```bash
pnpm test src/renderer/src/features/editor/lib/blocknote-schema.test.ts
pnpm test src/renderer/src/styles/blocknote-overrides.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

## Files Expected to Change

- `src/renderer/src/features/editor/lib/editor-code-block-node-view.ts`
- `src/renderer/src/styles/blocknote-overrides.css`
- Focused tests for the node view and theme overrides

No package manifest, lockfile, main-process, preload, IPC, or save-path changes
are expected.
