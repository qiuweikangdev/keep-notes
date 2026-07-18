# Quick Editor Drag Handle Spacing Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 8 more pixels of left breathing room to the floating quick editor's BlockNote add and drag controls.

**Architecture:** Keep the follow-up local to the existing floating quick editor stylesheet and its focused regression test. Increase the BlockNote surface's left padding from `64px` to `72px` so the side controls and editable content continue to move together without affecting the main editor.

**Tech Stack:** Electron, Vite, React 19, TypeScript, BlockNote, CSS, Vitest

## Global Constraints

- Use the existing local `node_modules`; do not install, delete, move, prune, or recreate dependencies.
- Do not modify `package.json` or `pnpm-lock.yaml`.
- Change only the floating quick editor surface; keep the main editor and shared BlockNote styles unchanged.
- Preserve the existing spacing between the side-menu controls and block content.
- Do not change editor behavior, window dimensions, or scrolling behavior.
- Keep the existing top, right, and bottom editor padding values unchanged.
- Preserve unrelated uncommitted work in the `dev` workspace.
- Use Oxfmt/Oxlint and English Conventional Commit messages.

---

## File Map

- `src/renderer/src/features/editor/components/quick-editor-window-css.test.ts`: Owns the focused stylesheet regression assertion. Update only the expected left padding.
- `src/renderer/src/features/editor/components/quick-editor-window.css`: Owns floating quick editor spacing. Update only the BlockNote editor's left padding.

No React component, shared style, runtime interface, or dependency change is needed.

### Task 1: Increase the floating editor's left breathing room

**Files:**

- Test: `src/renderer/src/features/editor/components/quick-editor-window-css.test.ts:13-23`
- Modify: `src/renderer/src/features/editor/components/quick-editor-window.css:82-86`

**Interfaces:**

- Consumes: the existing `.quick-editor-window__editor .bn-editor` selector and focused stylesheet test.
- Produces: `padding: 22px 42px 96px 72px` for the floating quick editor's BlockNote surface.
- Preserves: all React props, Electron APIs, BlockNote configuration, shared editor styles, window layout, and non-left padding values.

- [ ] **Step 1: Update the regression test to require 72 pixels**

In `src/renderer/src/features/editor/components/quick-editor-window-css.test.ts`, update the padding assertion:

```ts
expect(editorRule).toMatch(/padding:\s*22px 42px 96px 72px;/);
```

- [ ] **Step 2: Run the focused test and verify the updated assertion fails**

Run:

```bash
pnpm test src/renderer/src/features/editor/components/quick-editor-window-css.test.ts
```

Expected: FAIL because the selector still contains `padding: 22px 42px 96px 64px` instead of the required `72px` left padding.

- [ ] **Step 3: Increase only the floating editor's left padding**

In `src/renderer/src/features/editor/components/quick-editor-window.css`, use:

```css
.quick-editor-window__editor .bn-editor {
  min-height: calc(100vh - 38px);
  padding: 22px 42px 96px 72px;
  background: transparent !important;
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
pnpm test src/renderer/src/features/editor/components/quick-editor-window-css.test.ts
```

Expected: PASS with one test file and one test passing.

- [ ] **Step 5: Run repository verification**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all three commands exit with code 0. Existing Oxlint warnings may remain, but this change must introduce no new warnings.

- [ ] **Step 6: Commit the focused follow-up**

```bash
git add src/renderer/src/features/editor/components/quick-editor-window-css.test.ts src/renderer/src/features/editor/components/quick-editor-window.css
git commit -m "style: increase quick editor handle spacing"
```
