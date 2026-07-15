# Always-Visible Code Block Cursor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the focused CodeMirror cursor in BlockNote code blocks continuously visible.

**Architecture:** Configure the public CodeMirror `drawSelection` extension in the active custom code block NodeView. Verify the effective extension configuration through the real NodeView renderer so the regression test covers the schema integration rather than a duplicated constant.

**Tech Stack:** TypeScript, BlockNote, CodeMirror 6, Vitest, Testing Library

## Global Constraints

- Preserve all pre-existing uncommitted changes in the workspace.
- Do not change focus, selection synchronization, CSS, or the inactive legacy React code block renderer.
- Do not add or update dependencies or modify `pnpm-lock.yaml`.
- Use Chinese comments only if new core logic requires a comment; this configuration change does not require one.

---

### Task 1: Configure a continuously visible CodeMirror cursor

**Files:**
- Modify: `src/renderer/src/features/editor/lib/blocknote-schema.test.ts`
- Modify: `src/renderer/src/features/editor/lib/editor-code-block-node-view.ts:682`

**Interfaces:**
- Consumes: CodeMirror `getDrawSelectionConfig(state)` and `drawSelection(config)`.
- Produces: An effective `cursorBlinkRate` of `0` for the active code block CodeMirror state.

- [x] **Step 1: Write the failing regression test**

Extend the CodeMirror view import and add a NodeView-level test beside the existing code block renderer tests:

```ts
import { EditorView, getDrawSelectionConfig } from "@codemirror/view";

it("keeps the focused code block cursor continuously visible", () => {
  const output = editorBlockSpecs.codeBlock.implementation.render.call(
    {
      blockContentDOMAttributes: {},
      props: undefined,
      renderType: "nodeView",
    },
    {
      id: "block-1",
      type: "codeBlock",
      props: { language: "text" },
      content: "",
      children: [],
    } as never,
    {
      isEditable: true,
      updateBlock: vi.fn(),
    } as never,
  ) as {
    destroy?: () => void;
    dom: HTMLElement;
  };
  const editorElement = output.dom.querySelector<HTMLElement>(
    ".editor-code-block__codemirror .cm-editor",
  );
  const view = EditorView.findFromDOM(editorElement as HTMLElement);

  expect(view).not.toBe(null);
  expect(getDrawSelectionConfig((view as EditorView).state).cursorBlinkRate).toBe(
    0,
  );

  output.destroy?.();
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run src/renderer/src/features/editor/lib/blocknote-schema.test.ts -t "keeps the focused code block cursor continuously visible"
```

Expected: FAIL because the effective `cursorBlinkRate` is `1200`, not `0`.

- [x] **Step 3: Implement the minimal CodeMirror configuration change**

In the active NodeView extension list, replace the default configuration:

```ts
drawSelection({ cursorBlinkRate: 0 }),
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run the same focused test command. Expected: PASS with one matching test and no failures.

- [x] **Step 5: Run repository verification**

Run these commands and require exit code `0` from each:

```bash
pnpm exec vitest run src/renderer/src/features/editor/lib/blocknote-schema.test.ts
pnpm typecheck
pnpm lint
pnpm build
```

- [x] **Step 6: Review and commit only the cursor fix**

Confirm the diff contains only the import, regression test, and `cursorBlinkRate` configuration. Stage only those hunks from the already-dirty test file plus the clean implementation file, then commit:

```bash
git commit -m "fix: keep code block cursor visible"
```
