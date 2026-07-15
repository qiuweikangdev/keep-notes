# Quote Blocks with Nested Lists Design

## Goal

Allow a quote block to own and display bullet-list children. Pasting a multi-line plain-text Markdown list into a quote must create bullet-list blocks inside that quote, rather than inserting sibling blocks after it.

## Current Behavior

The editor adds a ProseMirror paste extension for plain-text Markdown lists. It detects two or more `-`, `+`, or `*` lines and converts them to `bulletListItem` blocks. When the selection is inside a quote, the extension inserts those items after the quote because the quote is currently treated as a single inline-content block. The result visually and structurally separates the pasted list from its quote.

## Options Considered

1. Keep the existing sibling insertion behavior and only alter the styling. This would not keep the list within the quote data structure and would not survive Markdown round trips correctly.
2. Model the list as child blocks of the quote. BlockNote blocks support `children`, so the quote can remain its standard inline-content block while owning bullet-list children. This keeps the structure compatible with the editor's block APIs and is the selected approach.
3. Replace the BlockNote quote implementation with a custom Tiptap node that accepts block content. This expands the change surface across drag-and-drop, selection, import, and export, with no benefit for the requested behavior.

## Design

### Data Model and Paste Flow

- A quote remains a `quote` block with inline text content.
- Its pasted bullet-list items are stored in the quote's `children` array.
- The list paste extension detects a quote cursor and replaces or updates the quote as needed so the generated bullet-list blocks become quote children. The original quote content and any existing children are preserved.
- Outside quotes, the current plain-text Markdown list conversion remains unchanged.
- Non-list paste content continues through BlockNote's default paste pipeline.

### Markdown Round Trip

- Parsing recognizes standard nested quote lists such as:

  ```markdown
  > Quote text
  >
  > - First item
  > - Second item
  ```

  and recreates one quote with two bullet-list children.
- Serialization emits the same standard Markdown form so saving, reopening, and export preserve the relationship.
- Existing plain quotes and ordinary lists retain their existing serialized form.

### Interaction and Rendering

- Quote styling extends its visual indicator through child-list content while keeping the existing quote appearance.
- Existing quote keyboard behavior is retained: Enter creates a line break in the quote; a second Enter on an empty quote line exits to a paragraph; Backspace on an empty quote converts it to a paragraph.
- Standard inline Markdown marks in quote text continue to use the existing inline schema. The list-specific syntax is handled as child blocks rather than left as literal marker text.

## Error Handling

- The custom handling activates only for a valid multi-line plain-text unordered list and a quote cursor.
- If the pasted slice cannot be recognized safely, the default BlockNote paste behavior runs unchanged.
- Invalid or partial list syntax remains regular text and is not restructured.

## Verification

Add regression tests that first reproduce the current failure and then validate:

1. Pasting a Markdown list into a non-empty quote keeps the quote as the parent and creates bullet-list children.
2. Pasting a Markdown list into an empty quote preserves the quote and creates the children.
3. The Markdown quote-with-list form parses and serializes without flattening its nested structure.
4. Existing regular-list paste behavior and quote Enter/Backspace behavior remain unchanged.

Run the focused Vitest suite, followed by `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
