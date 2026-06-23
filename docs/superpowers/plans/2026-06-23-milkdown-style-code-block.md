# Milkdown-Style Code Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the editor code block around CodeMirror 6 so folding, highlighting, language search, long-code performance, and empty-code Backspace deletion behave like Milkdown's code block.

**Architecture:** Keep BlockNote as the document editor and keep `EditorCodeBlock` as the custom React renderer. CodeMirror owns the visible code editor, selection, syntax highlighting, folding, and code-block-local keymaps. BlockNote remains the persistence and document-structure owner through narrow sync calls.

**Tech Stack:** React, TypeScript, BlockNote, ProseMirror, CodeMirror 6, Vitest, Testing Library.

---

### Task 1: Restore Failing Interaction Tests

**Files:**
- Modify: `src/renderer/src/features/editor/components/editor-code-block.test.tsx`
- Test: `src/renderer/src/features/editor/components/editor-code-block.test.tsx`

- [ ] **Step 1: Keep the CodeMirror state helper**

Use `EditorView.findFromDOM` in the test file to inspect real CodeMirror selection state:

```ts
function getCodeMirrorView() {
  const host = screen.getByTestId("editor-code-block-codemirror");
  const editorElement = host.querySelector<HTMLElement>(".cm-editor");
  expect(editorElement).not.toBeNull();

  const view = EditorView.findFromDOM(editorElement as HTMLElement);
  expect(view).not.toBeNull();

  return view as EditorView;
}
```

- [ ] **Step 2: Keep the parser-independent folding test**

The test should render `python`, set indentation-based code, click the first `Fold line` marker, and assert the CodeMirror document remains unchanged.

- [ ] **Step 3: Keep the CodeMirror select-all test**

The test should dispatch `keydown` on `.cm-content` with `metaKey: true`, then assert `state.selection.main.from === 0` and `state.selection.main.to === code.length`.

- [ ] **Step 4: Add empty-code Backspace test**

Add a component test that creates a code block with empty content, puts CodeMirror selection at `0`, dispatches Backspace, and verifies the provided editor deletion/replacement API is called.

- [ ] **Step 5: Run the focused test and verify it fails for expected missing behavior**

Run:

```bash
pnpm test src/renderer/src/features/editor/components/editor-code-block.test.tsx
```

Expected before implementation: failures for parser-independent folding, CodeMirror select-all, or empty Backspace behavior.

### Task 2: Extract CodeMirror Utilities

**Files:**
- Create: `src/renderer/src/features/editor/lib/editor-code-mirror.ts`
- Modify: `src/renderer/src/features/editor/components/editor-code-block.tsx`
- Test: `src/renderer/src/features/editor/components/editor-code-block.test.tsx`

- [ ] **Step 1: Create `computeTextChange`**

Add a utility based on Milkdown's `computeChange`:

```ts
export function computeTextChange(
  oldValue: string,
  newValue: string,
): { from: number; to: number; text: string } | null {
  if (oldValue === newValue) return null;

  let start = 0;
  let oldEnd = oldValue.length;
  let newEnd = newValue.length;

  while (
    start < oldEnd &&
    oldValue.charCodeAt(start) === newValue.charCodeAt(start)
  ) {
    start += 1;
  }

  while (
    oldEnd > start &&
    newEnd > start &&
    oldValue.charCodeAt(oldEnd - 1) === newValue.charCodeAt(newEnd - 1)
  ) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  return { from: start, to: oldEnd, text: newValue.slice(start, newEnd) };
}
```

- [ ] **Step 2: Move fallback folding helpers**

Move the CodeMirror fallback fold cache and fold service from `editor-code-block.tsx` into `editor-code-mirror.ts`.

- [ ] **Step 3: Export CodeMirror select-all command**

Export a helper that returns a `KeyBinding` for `Mod-a` using CodeMirror's `selectAll` command.

- [ ] **Step 4: Run focused test**

Run:

```bash
pnpm test src/renderer/src/features/editor/components/editor-code-block.test.tsx
```

Expected: tests still fail only for behavior not implemented yet, not for import or type errors.

### Task 3: Fix CodeMirror Select-All and Event Boundaries

**Files:**
- Modify: `src/renderer/src/features/editor/components/editor-code-block.tsx`
- Modify: `src/renderer/src/features/editor/components/blocknote-editor.tsx`
- Test: `src/renderer/src/features/editor/components/editor-code-block.test.tsx`
- Test: `src/renderer/src/features/editor/components/blocknote-editor.test.ts`

- [ ] **Step 1: Use correct CodeMirror DOM handler signature**

Ensure CodeMirror DOM event handlers use `(event, view)` for editor events and `(view, line, event)` only for gutter handlers.

- [ ] **Step 2: Add CodeMirror `Mod-a` keymap before default keymap**

Use:

```ts
keymap.of([
  indentWithTab,
  { key: "Mod-a", run: selectAll },
  ...defaultKeymap,
  ...historyKeymap,
  ...foldKeymap,
])
```

- [ ] **Step 3: Stop `Mod-a` propagation without swallowing CodeMirror handling**

The CodeMirror `keydown` DOM handler should stop propagation for `Mod-a` and return `false`, allowing the keymap to run.

- [ ] **Step 4: Keep outer BlockNote select-all guard**

`shouldLetCodeMirrorHandleKeyboardEvent` should return true for `.editor-code-block__codemirror` descendants.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm test src/renderer/src/features/editor/components/editor-code-block.test.tsx src/renderer/src/features/editor/components/blocknote-editor.test.ts
```

Expected: CodeMirror select-all tests pass and outer BlockNote select-all tests still pass.

### Task 4: Fix Folding for Parser and Non-Parser Languages

**Files:**
- Modify: `src/renderer/src/features/editor/lib/editor-code-mirror.ts`
- Modify: `src/renderer/src/features/editor/components/editor-code-block.tsx`
- Test: `src/renderer/src/features/editor/components/editor-code-block.test.tsx`
- Test: `src/renderer/src/features/editor/lib/editor-code-folding.test.ts`

- [ ] **Step 1: Register fallback fold service before `codeFolding()`**

Use CodeMirror `foldService.of(getCodeMirrorFallbackFoldRange)` so unsupported languages still expose fold markers.

- [ ] **Step 2: Keep explicit gutter toggle**

Clicking the gutter should call the current line's folded range or `foldable(view.state, line.from, line.to)`, then dispatch `unfoldEffect` or `foldEffect`.

- [ ] **Step 3: Ensure fallback ranges map to document positions correctly**

For a source fold range `{ startLine, endLine }`, map:

```ts
const startLine = state.doc.line(range.startLine);
const endLine = state.doc.line(range.endLine);
const foldRange = { from: startLine.to, to: endLine.to };
```

- [ ] **Step 4: Run folding tests**

Run:

```bash
pnpm test src/renderer/src/features/editor/components/editor-code-block.test.tsx src/renderer/src/features/editor/lib/editor-code-folding.test.ts
```

Expected: JSON, TypeScript, Vue-like, and Python indentation folding tests pass.

### Task 5: Implement Empty-Code Backspace Deletion

**Files:**
- Modify: `src/renderer/src/features/editor/components/editor-code-block.tsx`
- Test: `src/renderer/src/features/editor/components/editor-code-block.test.tsx`

- [ ] **Step 1: Extend the editor adapter type**

Add an optional method to the local `EditorCodeBlockEditor` test adapter if BlockNote exposes a suitable remove/replace API:

```ts
removeBlocks?: (blocks: Array<{ id: string } | string>) => void;
insertBlocks?: (...args: unknown[]) => void;
```

If the actual BlockNote API differs, use `prosemirrorView` transaction deletion as the primary path.

- [ ] **Step 2: Add CodeMirror Backspace key binding**

The key binding should return `false` unless:

- selection has exactly one range
- the range is empty
- `selection.anchor === 0`
- `view.state.doc.lines < 2`
- `view.state.doc.toString().length === 0`

- [ ] **Step 3: Delete or replace the code block**

Primary behavior:

```ts
editor.removeBlocks?.([block.id]);
```

Fallback behavior:

Use `editor.prosemirrorView`, `posAtDOM`, and a transaction to remove the block when the API is not available.

- [ ] **Step 4: Return focus to the rich editor**

Call `editor.prosemirrorView?.focus?.()` after deletion.

- [ ] **Step 5: Run Backspace tests**

Run:

```bash
pnpm test src/renderer/src/features/editor/components/editor-code-block.test.tsx
```

Expected: empty-code Backspace deletes the block, while non-empty Backspace remains CodeMirror's normal behavior.

### Task 6: Remove Shiki and Legacy Fold Preview Paths

**Files:**
- Modify: `src/renderer/src/features/editor/lib/blocknote-schema.ts`
- Modify: `src/renderer/src/features/editor/lib/blocknote-schema.test.ts`
- Modify: `src/renderer/src/features/editor/components/editor-code-block.tsx`
- Modify: `src/renderer/src/styles/blocknote-overrides.css`
- Test: `src/renderer/src/features/editor/lib/blocknote-schema.test.ts`
- Test: `src/renderer/src/styles/blocknote-overrides.test.ts`

- [ ] **Step 1: Keep schema free of Shiki highlighter**

`codeBlockOptions` should contain only:

```ts
const codeBlockOptions: Partial<CodeBlockOptions> = {
  defaultLanguage: "text",
  supportedLanguages: editorCodeBlockSupportedLanguages,
};
```

- [ ] **Step 2: Remove unused Shiki helper exports**

Remove unused code-line HTML helpers if no remaining tests or production code use them.

- [ ] **Step 3: Keep hidden content host plain and clipped**

The hidden host should stay plain text, clipped, and pointer-events disabled.

- [ ] **Step 4: Run schema and style tests**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/blocknote-schema.test.ts src/renderer/src/styles/blocknote-overrides.test.ts
```

Expected: tests pass and no Shiki highlighter assertions remain except assertions that it is absent.

### Task 7: Add Long-Code Performance Guards

**Files:**
- Modify: `src/renderer/src/features/editor/components/editor-code-block.tsx`
- Test: `src/renderer/src/features/editor/components/editor-code-block.test.tsx`

- [ ] **Step 1: Add an IntersectionObserver gate**

Initialize CodeMirror immediately when `IntersectionObserver` is unavailable. Otherwise, initialize when the shell enters a `200px` root margin.

- [ ] **Step 2: Add delayed off-screen teardown**

When the block leaves view, schedule teardown after a short delay. Do not destroy while CodeMirror has focus.

- [ ] **Step 3: Keep a plain placeholder**

Before initialization, render the plain hidden code text in a lightweight `<pre>` placeholder that does not run syntax highlighting.

- [ ] **Step 4: Add tests with mocked IntersectionObserver**

Test that CodeMirror initializes when the observer reports visible and does not initialize before visibility when the observer is available.

- [ ] **Step 5: Run focused test**

Run:

```bash
pnpm test src/renderer/src/features/editor/components/editor-code-block.test.tsx
```

Expected: CodeMirror lifecycle tests pass.

### Task 8: Final Verification

**Files:**
- All files touched by previous tasks.

- [ ] **Step 1: Run related tests**

Run:

```bash
pnpm test src/renderer/src/features/editor/components/editor-code-block.test.tsx src/renderer/src/features/editor/components/blocknote-editor.test.ts src/renderer/src/features/editor/lib/blocknote-schema.test.ts src/renderer/src/features/editor/lib/editor-code-folding.test.ts src/renderer/src/features/editor/lib/editor-code-block-languages.test.ts src/renderer/src/styles/blocknote-overrides.test.ts
```

Expected: all related tests pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: pass.

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm lint
```

Expected: no errors. Existing unrelated warnings may remain.

- [ ] **Step 4: Do not run build**

The user previously asked not to build during this investigation. Do not run `pnpm build` unless explicitly requested.

---

## Self-Review

- Spec coverage: folding, highlighting, language search, performance, Shiki removal, and Backspace deletion are each covered by tasks.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: the plan consistently uses the current React/BlockNote component names and CodeMirror APIs.
