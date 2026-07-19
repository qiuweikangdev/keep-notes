# Code Block Bash and Text Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `bash` and `text` code blocks a softer neutral foreground and normal font weight in both light and dark themes without changing other languages.

**Architecture:** The active BlockNote CodeMirror node view will expose its normalized language on the code block shell as `data-language`. Theme-scoped CSS tokens and a narrowly targeted selector will then style only Bash/Text CodeMirror content, so language changes update the appearance without reconfiguring editor state.

**Tech Stack:** TypeScript, BlockNote, CodeMirror 6, CSS custom properties, Vitest, Testing Library

## Global Constraints

- Work directly in the current `dev` workspace; do not create a worktree.
- Light-theme Bash/Text foreground must be `#5b687a` (`5.33:1` contrast
  against the existing code background).
- Dark-theme Bash/Text foreground must be `#929ba7` (`6.73:1` contrast
  against the existing code background).
- Bash/Text content must use `font-weight: 400`.
- Do not change code block backgrounds, controls, line numbers, cursor, selection, folding, spacing, or save behavior.
- Do not change syntax-highlighted languages.
- Do not add dependencies or modify `package.json` or `pnpm-lock.yaml`.
- Preserve unrelated working-tree changes.
- Use test-driven development: observe the focused tests fail before production changes, then pass afterward.

---

## File Structure

- `src/renderer/src/features/editor/lib/editor-code-block-node-view.ts`: expose and synchronize the normalized code block language on the active node-view shell.
- `src/renderer/src/features/editor/lib/blocknote-schema.test.ts`: verify the shell language attribute at creation and after language changes.
- `src/renderer/src/styles/blocknote-overrides.css`: define light/dark plain-code foreground tokens and the Bash/Text-only content rule.
- `src/renderer/src/styles/blocknote-overrides.test.ts`: verify both theme values and the exact language-scoped styling boundary.

### Task 1: Add the Bash/Text-only quiet visual treatment

**Files:**

- Modify: `src/renderer/src/features/editor/lib/blocknote-schema.test.ts:296-350`
- Modify: `src/renderer/src/styles/blocknote-overrides.test.ts:25-51,190-282`
- Modify: `src/renderer/src/features/editor/lib/editor-code-block-node-view.ts:583-595,947-958`
- Modify: `src/renderer/src/styles/blocknote-overrides.css:20-24,64-68,476-518`

**Interfaces:**

- Consumes: `getSupportedCodeBlockLanguageId(language: string): string` through the node view's existing `getLanguage` and `setLanguage` methods.
- Produces: `HTMLElement.dataset.language: string` on `.editor-code-block-shell` and the CSS custom property `--editor-code-plain-text` in both BlockNote color schemes.

- [ ] **Step 1: Write failing node-view language-state tests**

Add focused coverage near the existing CodeMirror node-view tests in `blocknote-schema.test.ts`:

```ts
it.each(["bash", "text"])(
  "exposes the normalized %s language on the code block shell",
  (language) => {
    const output = editorBlockSpecs.codeBlock.implementation.render.call(
      {
        blockContentDOMAttributes: {},
        props: undefined,
        renderType: "nodeView",
      },
      {
        id: "block-1",
        type: "codeBlock",
        props: { language },
        content: "plain content",
        children: [],
      } as never,
      {
        isEditable: true,
        updateBlock: vi.fn(),
      } as never,
    ) as { destroy?: () => void; dom: HTMLElement };

    expect(output.dom.dataset.language).toBe(language);
    output.destroy?.();
  },
);

it("keeps the shell language synchronized after a code language change", async () => {
  setupMatchMedia();
  const editor = BlockNoteEditor.create({
    schema: editorSchema,
    initialContent: [
      {
        type: "codeBlock",
        props: { language: "js" },
        content: "echo ready",
      },
    ],
  });
  const { container } = render(createElement(BlockNoteView, { editor }));
  const getShell = () =>
    container.querySelector<HTMLElement>(".editor-code-block-shell");

  await waitFor(() => {
    expect(getShell()?.dataset.language).toBe("javascript");
  });

  editor.updateBlock(editor.document[0], { props: { language: "bash" } });
  await waitFor(() => {
    expect(getShell()?.dataset.language).toBe("bash");
  });

  editor.updateBlock(editor.document[0], { props: { language: "python" } });
  await waitFor(() => {
    expect(getShell()?.dataset.language).toBe("python");
  });
});
```

- [ ] **Step 2: Write failing theme and selector tests**

Extend the existing theme-color test in `blocknote-overrides.test.ts`:

```ts
expect(getRule('.bn-root[data-color-scheme="light"]')).toMatch(
  /--editor-code-plain-text:\s*#5b687a;/,
);
expect(getRule('.bn-root[data-color-scheme="dark"]')).toMatch(
  /--editor-code-plain-text:\s*#929ba7;/,
);
```

Add a separate scope test:

```ts
it("softens only Bash and Text code content", () => {
  const plainCodeRule = getRule(
    ':is(.editor-code-block-shell[data-language="bash"], .editor-code-block-shell[data-language="text"]) .editor-code-block__codemirror .cm-content',
  );

  expect(plainCodeRule).toBeDefined();
  expect(plainCodeRule).toMatch(
    /color:\s*var\(--editor-code-plain-text\);/,
  );
  expect(plainCodeRule).toMatch(/font-weight:\s*400;/);
  expect(stylesheet).not.toMatch(
    /data-language="(?:javascript|typescript|css|json|python)"[^}]*--editor-code-plain-text/,
  );
});
```

- [ ] **Step 3: Run focused tests and verify the new assertions fail**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/blocknote-schema.test.ts src/renderer/src/styles/blocknote-overrides.test.ts
```

Expected: FAIL because the shell has no `data-language` attribute, neither theme defines `--editor-code-plain-text`, and the Bash/Text selector does not exist.

- [ ] **Step 4: Synchronize the normalized language on the node-view shell**

In `editor-code-block-node-view.ts`, set the initial attribute immediately after constructing the shell:

```ts
this.dom.className =
  "editor-code-block-shell editor-code-block relative rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)]";
this.dom.dataset.language = this.language;
this.dom.contentEditable = "false";
```

Update the attribute in `setLanguage` after accepting a different normalized language:

```ts
this.language = normalizedLanguage;
this.dom.dataset.language = normalizedLanguage;
this.languageButton.querySelector("span")!.textContent =
  getCodeBlockLanguageShortLabel(normalizedLanguage);
```

The existing early return remains valid because the constructor sets the initial value and every accepted change updates it.

- [ ] **Step 5: Add theme tokens and the Bash/Text-only CSS rule**

In the light and dark `.bn-root` token blocks in `blocknote-overrides.css`, add:

```css
/* Light */
--editor-code-plain-text: #5b687a;

/* Dark */
--editor-code-plain-text: #929ba7;
```

After the `.editor-code-block__codemirror .cm-editor` rule, add:

```css
:is(
  .editor-code-block-shell[data-language="bash"],
  .editor-code-block-shell[data-language="text"]
)
  .editor-code-block__codemirror
  .cm-content {
  color: var(--editor-code-plain-text);
  font-weight: 400;
}
```

This selector has enough specificity to override the generated CodeMirror base theme while leaving tokenized languages and non-content controls unchanged.

- [ ] **Step 6: Run the focused tests and verify they pass**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/blocknote-schema.test.ts src/renderer/src/styles/blocknote-overrides.test.ts
```

Expected: both test files PASS, including the new language synchronization and visual-scope cases.

- [ ] **Step 7: Format only the files changed by this task**

Run:

```bash
pnpm exec oxfmt --write src/renderer/src/features/editor/lib/blocknote-schema.test.ts src/renderer/src/features/editor/lib/editor-code-block-node-view.ts src/renderer/src/styles/blocknote-overrides.css src/renderer/src/styles/blocknote-overrides.test.ts
```

Expected: command exits successfully and does not modify unrelated files.

- [ ] **Step 8: Run repository verification**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all three commands exit with status 0. If an existing unrelated failure occurs, record the exact failure and confirm the focused tests still pass.

- [ ] **Step 9: Review the final diff and commit the focused implementation**

Run:

```bash
git diff --check
git diff -- src/renderer/src/features/editor/lib/blocknote-schema.test.ts src/renderer/src/features/editor/lib/editor-code-block-node-view.ts src/renderer/src/styles/blocknote-overrides.css src/renderer/src/styles/blocknote-overrides.test.ts
git add src/renderer/src/features/editor/lib/blocknote-schema.test.ts src/renderer/src/features/editor/lib/editor-code-block-node-view.ts src/renderer/src/styles/blocknote-overrides.css src/renderer/src/styles/blocknote-overrides.test.ts
git commit -m "style: soften bash and text code blocks"
```

Expected: only the four task files are staged, the commit succeeds, and the user's unrelated working-tree changes remain unstaged.
