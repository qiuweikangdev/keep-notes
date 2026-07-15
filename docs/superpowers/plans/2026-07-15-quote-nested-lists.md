# Quote Blocks with Nested Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Markdown bullet lists typed or pasted in a quote become bullet-list children of that quote, and preserve that relationship through Markdown save and reload.

**Architecture:** Keep BlockNote's inline `quote` block and use its `children` tree for quote-owned list items. A Markdown adapter flattens only quote-list source for BlockNote parsing and restores the tree, then composes quote children as standard `> - item` Markdown on save. Quote-only paste and marker input use the same child-block model.

**Tech Stack:** React 19, TypeScript, BlockNote 0.51, Tiptap/ProseMirror, Vitest, Testing Library, Oxfmt, Oxlint.

## Global Constraints

- Use `pnpm`; do not add dependencies or modify `pnpm-lock.yaml`.
- Preserve existing ordinary-list paste and quote Enter/Backspace behavior.
- Serialize quote lists as `> quote`, a blank `>`, and `> - item` lines.
- Write Chinese comments for new core logic.
- Modify only the editor Markdown adapter, schema/tests, and quote/list CSS.

---

### Task 1: Preserve quote-list Markdown round trips

**Files:**

- Modify: `src/renderer/src/features/editor/lib/markdown.ts:1303-1325`
- Test: `src/renderer/src/features/editor/lib/markdown.test.ts:1-120`

**Interfaces:**

- Consumes: `MarkdownParser<TBlock>`, `MarkdownSerializer<TBlock>`, and values shaped as `{ type, content, children }`.
- Produces: a quote with `bulletListItem` children after parsing, and standard nested quote Markdown after serialization.

- [ ] **Step 1: Write the failing parser test**

Add `vi` to the Vitest import and append:

```ts
type TestBlock = { content?: string; children?: TestBlock[]; type: string };

it("nests quoted markdown list items under their quote after parsing", async () => {
  let received = "";
  const blocks = await parseMarkdown<TestBlock>(
    {
      tryParseMarkdownToBlocks: (markdown) => {
        received = markdown;
        return [
          { type: "quote", content: "Quote text" },
          { type: "bulletListItem", content: "First item" },
          { type: "bulletListItem", content: "Second item" },
        ];
      },
    },
    "> Quote text\n>\n> - First item\n> - Second item\n",
  );

  expect(received).toBe("> Quote text\n\n- First item\n- Second item\n");
  expect(blocks).toEqual([{
    type: "quote",
    content: "Quote text",
    children: [
      { type: "bulletListItem", content: "First item" },
      { type: "bulletListItem", content: "Second item" },
    ],
  }]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/renderer/src/features/editor/lib/markdown.test.ts`

Expected: FAIL because `parseMarkdown` passes `> -` lines directly to BlockNote, which flattens them into quote text.

- [ ] **Step 3: Write the minimal parser implementation**

Before `parseMarkdown`, define:

```ts
interface MarkdownTreeBlock {
  children?: MarkdownTreeBlock[];
  type?: unknown;
}
interface QuoteListDescriptor {
  itemCount: number;
  quoteOrdinal: number;
}
```

Implement `normalizeQuoteListsForParser(markdown)`. It scans quote sections, replaces a contiguous group of `> -`, `> +`, or `> *` lines with normal list lines, and records the preceding quote ordinal and item count. It must leave non-quote lists, code fences, malformed markers, and ordinary quotes untouched. Add a Chinese comment explaining that BlockNote flattens quote-list source.

Implement `restoreQuoteListChildren<TBlock>`. It finds the recorded quote ordinal in the parser result, verifies that the next exact number of blocks are `bulletListItem` values, clones the quote with those blocks appended to `children`, removes the sibling items, and returns unmodified output if validation fails.

Replace the parsing flow with:

```ts
const repairedMarkdown = repairMarkdownSourceBeforeParse(markdown);
const parseInput = repairedMarkdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
const normalized = normalizeQuoteListsForParser(parseInput);
const blocks = await parser.tryParseMarkdownToBlocks(normalized.markdown);
return resolveImageBlockUrls(
  restoreQuoteListChildren(blocks, normalized.descriptors),
  options,
);
```

- [ ] **Step 4: Add the failing serializer test**

Append:

```ts
it("serializes quote-owned bullet items as nested quote markdown", async () => {
  const serialize = vi.fn((blocks: TestBlock[]) =>
    blocks[0]?.type === "quote"
      ? "> Quote text\n"
      : "* First item\n* Second item\n",
  );

  await expect(
    serializeMarkdown<TestBlock>(
      { blocksToMarkdownLossy: serialize },
      [{
        type: "quote",
        content: "Quote text",
        children: [
          { type: "bulletListItem", content: "First item" },
          { type: "bulletListItem", content: "Second item" },
        ],
      }],
    ),
  ).resolves.toBe("> Quote text\n>\n> * First item\n> * Second item\n");
  expect(serialize).toHaveBeenCalledWith([
    { type: "quote", content: "Quote text", children: [] },
  ]);
});
```

Run: `pnpm test src/renderer/src/features/editor/lib/markdown.test.ts`

Expected: FAIL because `serializeMarkdown` directly delegates to BlockNote and it un-nests quote children.

- [ ] **Step 5: Write the minimal serializer implementation and verify**

After `yieldToMain`, route serialization through `serializeQuoteListBlocks(serializer, blocks)`. For a quote whose direct children are all `bulletListItem` values, serialize a clone with `children: []`, serialize its children separately, prefix every nonempty child output line with `> `, and insert a `>\n` separator. Delegate all other blocks to the current serializer unchanged. Add a Chinese comment explaining the composition.

Run: `pnpm test src/renderer/src/features/editor/lib/markdown.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/features/editor/lib/markdown.ts src/renderer/src/features/editor/lib/markdown.test.ts
git commit -m "fix: preserve lists nested in quotes"
```

### Task 2: Convert quote paste and marker input into child blocks

**Files:**

- Modify: `src/renderer/src/features/editor/lib/blocknote-schema.ts:290-472`
- Test: `src/renderer/src/features/editor/lib/blocknote-schema.test.ts:659-770`

**Interfaces:**

- Consumes: the active BlockNote quote plus either a recognized plain-text unordered list or a complete `- `, `+ `, `* ` quote marker.
- Produces: the original quote, retaining its content and children, with new `bulletListItem` children.

- [ ] **Step 1: Write failing paste and input tests**

Add next to the existing list-paste tests:

```tsx
it("pastes a markdown list as children of a non-empty quote", () => {
  setupMatchMedia();
  setupClipboardEvent();
  const editor = BlockNoteEditor.create({
    schema: editorSchema,
    initialContent: [{ type: "quote", content: "这是引用" }],
  });
  render(createElement(BlockNoteView, { editor }));
  editor.setTextCursorPosition(editor.document[0].id, "end");
  editor.pasteText("* 列表1\n* 列表2");

  expect(editor.document).toHaveLength(1);
  expect(editor.document[0].type).toBe("quote");
  expect(getInlineText(editor.document[0])).toBe("这是引用");
  expect(editor.document[0].children.map((block) => ({
    type: block.type,
    text: getInlineText(block),
  }))).toEqual([
    { type: "bulletListItem", text: "列表1" },
    { type: "bulletListItem", text: "列表2" },
  ]);
});

it("turns a quote-started bullet marker into its first child", () => {
  setupMatchMedia();
  const editor = BlockNoteEditor.create({
    schema: editorSchema,
    initialContent: [{ type: "quote", content: "" }],
  });
  render(createElement(BlockNoteView, { editor }));
  editor.setTextCursorPosition(editor.document[0].id, "start");
  typeString(editor, "- 这是引用");

  expect(editor.document).toHaveLength(1);
  expect(editor.document[0].type).toBe("quote");
  expect(getInlineText(editor.document[0])).toBe("");
  expect(editor.document[0].children).toHaveLength(1);
  expect(editor.document[0].children[0].type).toBe("bulletListItem");
  expect(getInlineText(editor.document[0].children[0])).toBe("这是引用");
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm test src/renderer/src/features/editor/lib/blocknote-schema.test.ts`

Expected: FAIL because list paste becomes sibling blocks and the quote marker remains literal text.

- [ ] **Step 3: Write the minimal schema implementation**

Add a `replaceQuoteWithChildren` helper beside `getPlainBulletListPasteBlocks`:

```ts
function replaceQuoteWithChildren(editor: BlockNoteEditor, quote: Block, children: PartialBlock[]) {
  editor.replaceBlocks([quote], [{
    id: quote.id,
    type: "quote",
    content: quote.content,
    props: quote.props,
    children: [...quote.children, ...children],
  }]);
}
```

Import the required `Block` and `PartialBlock` types from `@blocknote/core`. In `plainBulletListPasteExtension.handlePaste`, before the current empty/non-empty branch, call this helper when `block.type === "quote"`, then prevent default and return `true`.

Add a quote-extension ProseMirror `handleTextInput` plugin. It must only handle an empty quote when its complete post-insert text is exactly `- `, `+ `, or `* `: replace the quote with an empty quote containing one empty `bulletListItem`, then place the cursor inside that child. Return `false` for non-empty quotes, partial markers, and all other input.

- [ ] **Step 4: Verify and commit**

Run: `pnpm test src/renderer/src/features/editor/lib/blocknote-schema.test.ts`

Expected: PASS, including existing ordinary-list-paste and quote Enter/Backspace tests.

```bash
git add src/renderer/src/features/editor/lib/blocknote-schema.ts src/renderer/src/features/editor/lib/blocknote-schema.test.ts
git commit -m "fix: support lists inside quote blocks"
```

### Task 3: Extend quote presentation and run all checks

**Files:**

- Modify: `src/renderer/src/styles/blocknote-overrides.css:172-204`
- Verify: `src/renderer/src/features/editor/lib/markdown.test.ts`
- Verify: `src/renderer/src/features/editor/lib/blocknote-schema.test.ts`

**Interfaces:**

- Consumes: BlockNote's nested `.bn-block-children` group under a quote.
- Produces: a continuous quote rail around child lists without changing ordinary-list layout.

- [ ] **Step 1: Add the DOM assertion**

Extend the successful quote-paste test:

```tsx
const quoteElement = document.querySelector<HTMLElement>(
  '.bn-block-content[data-content-type="quote"]',
);
expect(quoteElement?.parentElement?.querySelector(".bn-block-children")).not.toBeNull();
```

Run: `pnpm test src/renderer/src/features/editor/lib/blocknote-schema.test.ts`

Expected: PASS.

- [ ] **Step 2: Add the CSS rule**

Place this after the existing quote `blockquote` rule and leave all existing `ul` rules unchanged:

```css
:is(.bn-editor, .bn-editor-preview)
  .bn-block-outer:has(> .bn-block-content[data-content-type="quote"])
  > .bn-block-children {
  border-left: 3px solid var(--accent-color);
  margin-left: 0;
  padding: 0.2em 0 0.2em 0.9em;
}
```

- [ ] **Step 3: Run focused and repository verification**

Run: `pnpm test src/renderer/src/features/editor/lib/markdown.test.ts src/renderer/src/features/editor/lib/blocknote-schema.test.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: PASS with exit code 0.

Run: `pnpm lint`

Expected: PASS with exit code 0.

Run: `pnpm build`

Expected: PASS with exit code 0.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/styles/blocknote-overrides.css src/renderer/src/features/editor/lib/markdown.ts src/renderer/src/features/editor/lib/markdown.test.ts src/renderer/src/features/editor/lib/blocknote-schema.ts src/renderer/src/features/editor/lib/blocknote-schema.test.ts
git commit -m "fix: render lists inside quote blocks"
```

