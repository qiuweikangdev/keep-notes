# Quick Editor Drag Handle Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 12 pixels of left breathing room to the floating quick editor's BlockNote add and drag controls without changing the main editor.

**Architecture:** Keep the change local to the floating quick editor stylesheet. Increase the quick editor's BlockNote content padding so BlockNote moves its side-menu controls and editable content together, preserving their existing relationship and all editor behavior.

**Tech Stack:** Electron, Vite, React 19, TypeScript, BlockNote, CSS, Vitest

## Global Constraints

- Use the existing local `node_modules`; do not install, delete, move, prune, or recreate dependencies.
- Do not modify `package.json` or `pnpm-lock.yaml`.
- Change only the floating quick editor surface; keep the main editor and shared BlockNote styles unchanged.
- Preserve the existing spacing between the side-menu controls and block content.
- Do not change editor behavior, window dimensions, or scrolling behavior.
- Keep the existing top, right, and bottom editor padding values unchanged.
- Use Oxfmt/Oxlint and English Conventional Commit messages.

---

## File Map

- `src/renderer/src/features/editor/components/quick-editor-window.css`: Owns the floating quick editor's frame, title bar, action buttons, scroll surface, and BlockNote editor spacing. Change only the BlockNote editor's left padding.
- `src/renderer/src/features/editor/components/quick-editor-window-css.test.ts`: New focused stylesheet regression test that reads the quick editor CSS and asserts the complete editor padding declaration.

No React component, shared BlockNote override, runtime interface, or dependency change is needed.

### Task 1: Add floating editor side-menu breathing room

**Files:**

- Create: `src/renderer/src/features/editor/components/quick-editor-window-css.test.ts`
- Modify: `src/renderer/src/features/editor/components/quick-editor-window.css:82-86`

**Interfaces:**

- Consumes: the existing `.quick-editor-window__editor .bn-editor` selector and BlockNote's positioning of side-menu controls relative to editor content padding.
- Produces: `padding: 22px 42px 96px 64px` for the floating quick editor's BlockNote surface.
- Preserves: all React props, Electron APIs, BlockNote configuration, shared editor styles, window layout, and non-left padding values.

- [ ] **Step 1: Write the failing stylesheet regression test**

Create `src/renderer/src/features/editor/components/quick-editor-window-css.test.ts` with:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(
    process.cwd(),
    "src/renderer/src/features/editor/components/quick-editor-window.css",
  ),
  "utf8",
);

describe("quick editor window stylesheet", () => {
  it("keeps the BlockNote side controls away from the floating window edge", () => {
    const editorRule = stylesheet.match(
      /\.quick-editor-window__editor \.bn-editor\s*\{([\s\S]*?)\n\}/,
    )?.[1];

    expect(editorRule).toBeDefined();
    expect(editorRule).toMatch(/padding:\s*22px 42px 96px 64px;/);
  });
});
```

- [ ] **Step 2: Run the focused test and verify the new assertion fails**

Run:

```bash
pnpm test src/renderer/src/features/editor/components/quick-editor-window-css.test.ts
```

Expected: FAIL because the selector still contains `padding: 22px 42px 96px 52px` instead of the required `64px` left padding.

- [ ] **Step 3: Increase only the floating editor's left padding**

In `src/renderer/src/features/editor/components/quick-editor-window.css`, replace the existing padding declaration inside `.quick-editor-window__editor .bn-editor`:

```css
.quick-editor-window__editor .bn-editor {
  min-height: calc(100vh - 38px);
  padding: 22px 42px 96px 64px;
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

Expected: all three commands exit with code 0 and report no TypeScript, Oxlint, or build errors.

- [ ] **Step 6: Commit the focused implementation**

```bash
git add src/renderer/src/features/editor/components/quick-editor-window-css.test.ts src/renderer/src/features/editor/components/quick-editor-window.css
git commit -m "style: add quick editor handle spacing"
```
