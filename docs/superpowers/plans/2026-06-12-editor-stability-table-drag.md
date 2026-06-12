# Editor Stability And Table Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent autosave file events from resetting the active editor and allow BlockNote table row/column handles to complete native drag-and-drop reordering.

**Architecture:** Keep the existing 250 ms editor serialization debounce and 800 ms disk-write debounce. Make own-write recognition idempotent for a short bounded window, skip external file notifications whose content already matches the tab, and make panel-level drop handlers intercept only explicit file drags so BlockNote internal drag events continue to its native handlers.

**Tech Stack:** React 19, TypeScript, Zustand, BlockNote 0.51, Vitest, Electron `fs.watch`

---

### Task 1: Stabilize Autosave File Events

**Files:**
- Modify: `src/renderer/src/features/editor/lib/editor-save-coordinator.ts`
- Test: `src/renderer/src/features/editor/lib/editor-save-coordinator.test.ts`
- Create: `src/renderer/src/features/editor/lib/editor-external-change.ts`
- Test: `src/renderer/src/features/editor/lib/editor-external-change.test.ts`
- Modify: `src/renderer/src/features/editor/components/editor-workspace.tsx`

- [ ] Add a failing coordinator test proving repeated matching filesystem events remain classified as the same own write during the recent-write window.
- [ ] Add a failing pure-function test proving identical external content is ignored while changed content is applied.
- [ ] Run the focused tests and confirm both fail for the intended reasons.
- [ ] Store bounded own-write records with expiration instead of consuming a record on first match.
- [ ] Guard the editor file subscription against identical content before calling `completeTabLoad`.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Preserve BlockNote Table Drag Events

**Files:**
- Create: `src/renderer/src/features/editor/lib/editor-drag-session.ts`
- Test: `src/renderer/src/features/editor/lib/editor-drag-session.test.ts`
- Modify: `src/renderer/src/features/editor/components/editor.tsx`

- [ ] Add failing tests proving a drag without file MIME types is left to BlockNote while tree and system file drags are intercepted.
- [ ] Run the focused test and confirm it fails because the classifier is missing.
- [ ] Add a small positive file-drag classifier.
- [ ] Return early from panel drag-over, drag-leave, and drop handlers unless the drag explicitly contains a file MIME type.
- [ ] Run the focused test and confirm it passes.

### Task 3: Full Verification

**Files:**
- Verify all modified files above.

- [ ] Run `pnpm test`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm build`.
- [ ] Launch `pnpm dev` and manually verify continuous typing does not jump and table row/column handles reorder content.
