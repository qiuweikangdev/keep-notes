# Editor Opacity Ghosting Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent offset rich-text shadows during scrolling at reduced appearance opacity while preserving window transparency.

**Architecture:** The app root remains the single owner of `appearance.opacity`, so Electron composites the complete rendered app against the desktop. The stacked live editor and virtual preview remain internally opaque, preventing either layer from revealing independently-scrolled content below it.

**Tech Stack:** Electron, React 19, TypeScript, BlockNote, TanStack Virtual, Vitest, Testing Library.

## Global Constraints

- Keep `appearance.opacity` applied at `src/renderer/src/app/App.tsx` only.
- Do not change rich-document session, preview, scrolling, or window behavior.
- Use Chinese comments for any new core-logic comments.
- Do not install dependencies or modify `pnpm-lock.yaml`.
- Verify with `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

---

### Task 1: Add regression coverage for layer-local opacity

**Files:**

- Modify: `src/renderer/src/features/editor/components/blocknote-editor.test.ts:805-1544`
- Modify: `src/renderer/src/features/editor/components/virtual-rich-preview.test.tsx:144-181`

**Interfaces:**

- Consumes: the rendered `.editor-rich-scroll` live BlockNote surface and the virtual preview `role="textbox"`.
- Produces: two regression tests asserting that neither internal render layer sets an inline `opacity` style.

- [ ] **Step 1: Write the failing live-editor test**

Add this test inside `describe("BlockNoteEditor persistent session runtime", ...)`:

```tsx
  it("keeps the live editor surface opaque at reduced window opacity", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    setupSessionTab("C:/notes/opaque-surface.md");
    useEditorStore.setState((state) => ({
      appearance: { ...state.appearance, opacity: 60 },
    }));
    const session = renderRealSession("C:/notes/opaque-surface.md");

    await waitFor(() => expect(session.runtime.current).not.toBeNull());
    expect(
      session.view.container.querySelector<HTMLElement>(".editor-rich-scroll")
        ?.style.opacity,
    ).toBe("");
  });
```

- [ ] **Step 2: Run the live-editor test and verify it fails**

Run: `pnpm test src/renderer/src/features/editor/components/blocknote-editor.test.ts -t "keeps the live editor surface opaque"`

Expected: FAIL because `.editor-rich-scroll` has inline `opacity: 0.6`.

- [ ] **Step 3: Write the failing virtual-preview test**

Add this test after the bounded virtual-block rendering test:

```tsx
  it("keeps the virtual preview opaque at reduced window opacity", () => {
    const { cache } = createCache();
    useEditorStore.setState((state) => ({
      appearance: { ...state.appearance, opacity: 60 },
    }));

    render(
      <VirtualRichPreview
        paneKey="group-a:tab-a"
        cache={cache}
        onActivate={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox").style.opacity).toBe("");
  });
```

- [ ] **Step 4: Run the virtual-preview test and verify it fails**

Run: `pnpm test src/renderer/src/features/editor/components/virtual-rich-preview.test.tsx -t "keeps the virtual preview opaque"`

Expected: FAIL because the textbox has inline `opacity: 0.6`.

### Task 2: Make internal rich-text render layers opaque

**Files:**

- Modify: `src/renderer/src/features/editor/components/blocknote-editor.tsx:1938-1946`
- Modify: `src/renderer/src/features/editor/components/virtual-rich-preview.tsx:314-334`
- Test: `src/renderer/src/features/editor/components/blocknote-editor.test.ts`
- Test: `src/renderer/src/features/editor/components/virtual-rich-preview.test.tsx`

**Interfaces:**

- Consumes: `appearance` font and spacing settings, plus root-level opacity from `App.tsx`.
- Produces: opaque live and preview surfaces whose dimensions, colors, and typography remain unchanged.

- [ ] **Step 1: Remove the live-editor local opacity declaration**

In `editorStyle`, keep the existing background, containment, isolation, and editor custom properties, but delete this line:

```tsx
    opacity: appearance.opacity / 100,
```

- [ ] **Step 2: Remove the virtual-preview local opacity declaration and stale dependency**

In `previewStyle`, delete this line:

```tsx
        opacity: appearance.opacity / 100,
```

Then remove `appearance.opacity` from the `useMemo` dependency array because the memoized style no longer reads it.

- [ ] **Step 3: Run both focused tests and verify they pass**

Run: `pnpm test src/renderer/src/features/editor/components/blocknote-editor.test.ts src/renderer/src/features/editor/components/virtual-rich-preview.test.tsx`

Expected: PASS, including the two new opacity regression tests.

- [ ] **Step 4: Commit the focused fix**

```bash
git add src/renderer/src/features/editor/components/blocknote-editor.tsx src/renderer/src/features/editor/components/blocknote-editor.test.ts src/renderer/src/features/editor/components/virtual-rich-preview.tsx src/renderer/src/features/editor/components/virtual-rich-preview.test.tsx
git commit -m "fix: prevent rich editor opacity ghosting"
```

### Task 3: Run project verification

**Files:**

- No source changes expected.

**Interfaces:**

- Consumes: the completed regression tests and source fix.
- Produces: verified type, lint, and production build status.

- [ ] **Step 1: Run TypeScript validation**

Run: `pnpm typecheck`

Expected: exit code 0.

- [ ] **Step 2: Run lint validation**

Run: `pnpm lint`

Expected: exit code 0.

- [ ] **Step 3: Run the production build**

Run: `pnpm build`

Expected: exit code 0 and Electron Vite build output for main, preload, and renderer bundles.
