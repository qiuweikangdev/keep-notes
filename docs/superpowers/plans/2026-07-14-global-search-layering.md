# Global Search Layering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the title-bar search entry opens the application-level global search modal above the editor.

**Architecture:** Keep `SearchModal` mounted only by `App`, which already owns shortcut and menu handling. The title bar will dispatch the existing `open-search` event instead of maintaining a nested modal instance and local open state.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Tailwind CSS.

## Global Constraints

- Do not add dependencies or change `pnpm-lock.yaml`.
- Preserve search keyboard, menu, outside-click, and accessibility behavior.
- Keep the modification limited to the title-bar search entry and its focused test.
- Use Chinese comments only when new core logic requires comments.

---

### Task 1: Route the title-bar entry to the global search owner

**Files:**
- Modify: `src/renderer/src/components/layout/title-bar.test.tsx`
- Modify: `src/renderer/src/components/layout/title-bar.tsx`

**Interfaces:**
- Consumes: the existing `Window` event name `open-search`, listened to by `App`.
- Produces: a title-bar search button that dispatches `new Event("open-search")`; no nested `SearchModal` instance or local search-open state remains in `TitleBar`.

- [ ] **Step 1: Write the failing test**

Add this focused test to `src/renderer/src/components/layout/title-bar.test.tsx`:

```tsx
it("dispatches the global search event from the title-bar search entry", () => {
  const listener = vi.fn();
  window.addEventListener("open-search", listener);

  render(<TitleBar collapsed={false} onToggleCollapse={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /搜索文件/i }));

  expect(listener).toHaveBeenCalledOnce();
  window.removeEventListener("open-search", listener);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `pnpm test src/renderer/src/components/layout/title-bar.test.tsx`

Expected: FAIL because the current click only updates local title-bar state and does not dispatch `open-search`.

- [ ] **Step 3: Write the minimal implementation**

In `src/renderer/src/components/layout/title-bar.tsx`:

```tsx
onClick={() => window.dispatchEvent(new Event("open-search"))}
```

Remove the `SearchModal` import, the `isSearchOpen` state declaration, and the nested `SearchModal` JSX. Retain the existing `GitPanel` and all unrelated title-bar behavior.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `pnpm test src/renderer/src/components/layout/title-bar.test.tsx`

Expected: PASS with the new dispatch assertion and existing title-bar tests passing.

- [ ] **Step 5: Run repository verification**

Run: `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

Expected: all commands exit with code 0.
