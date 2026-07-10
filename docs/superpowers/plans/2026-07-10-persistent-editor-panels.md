# Persistent Editor Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every surviving BlockNote editor instance across nested panel split and close operations while eliminating raw Markdown transition frames for large documents.

**Architecture:** Keep the existing recursive `react-resizable-panels` layout, but render each `EditorPanelGroup` through a stable React portal into a persistent DOM surface keyed by `groupId`. Layout leaves register replaceable host elements with a small surface registry; reparenting a stable surface moves the existing editor DOM before paint without remounting its React subtree.

**Tech Stack:** React 19, React DOM portals, TypeScript, Zustand, BlockNote, react-resizable-panels, Vitest, Testing Library.

## Global Constraints

- Preserve simultaneous editing and real-time synchronization for the same file in multiple panes.
- Preserve each pane's independent selection, focus, undo state, and scroll position.
- Do not replace `react-resizable-panels` or change split placement semantics.
- Do not add dependencies or modify `package.json` or `pnpm-lock.yaml`.
- Preserve all unrelated staged and unstaged working-tree changes.
- Do not create a Git commit unless the user explicitly requests one; this repository already contains unrelated staged changes.
- Write Chinese comments for core method logic.
- Use the existing local `node_modules`; do not install dependencies.

---

## File Structure

- Create `src/renderer/src/features/editor/lib/editor-panel-surface-registry.ts`: owns stable surface/host registration, DOM attachment, stale-cleanup protection, and focus restoration.
- Create `src/renderer/src/features/editor/lib/editor-panel-surface-registry.test.ts`: unit coverage for attachment, host replacement, focus restoration, and isolated cleanup.
- Modify `src/renderer/src/features/editor/components/editor.tsx`: separate editor ownership from recursive layout leaves and render persistent portals.
- Modify `src/renderer/src/features/editor/components/editor.test.tsx`: prove surviving workspace instances do not remount through nested split and close operations.
- Modify `src/renderer/src/features/editor/components/editor-workspace.tsx`: remove the raw Markdown split snapshot and mount the rich editor directly.
- Modify `src/renderer/src/features/editor/components/editor-workspace.test.tsx`: replace the snapshot expectation with a no-source-transition regression assertion.

---

### Task 1: Add Failing Editor Lifecycle Regression Coverage

**Files:**
- Modify: `src/renderer/src/features/editor/components/editor.test.tsx`

**Interfaces:**
- Consumes: `useEditorStore.getState().addPanelGroup(direction, targetGroupId)` and `removeTab(groupId, tabId)`.
- Produces: a test double that exposes stable `data-instance-id` values and mount/unmount counters by `groupId`.

- [ ] **Step 1: Add the required test imports**

Extend the Testing Library and Vitest imports:

```tsx
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

- [ ] **Step 2: Add lifecycle instrumentation to the `EditorWorkspace` mock**

Replace the current workspace mock with an async mock using React state and effects:

```tsx
const workspaceLifecycle = vi.hoisted(() => ({
  nextInstanceId: 0,
  mounts: new Map<string, number>(),
  unmounts: new Map<string, number>(),
}));

vi.mock("./editor-workspace", async () => {
  const { useEffect, useState } = await import("react");

  return {
    EditorWorkspace: ({ groupId }: { groupId: string }) => {
      const [instanceId] = useState(() => {
        workspaceLifecycle.nextInstanceId += 1;
        return workspaceLifecycle.nextInstanceId;
      });

      useEffect(() => {
        workspaceLifecycle.mounts.set(
          groupId,
          (workspaceLifecycle.mounts.get(groupId) ?? 0) + 1,
        );
        return () => {
          workspaceLifecycle.unmounts.set(
            groupId,
            (workspaceLifecycle.unmounts.get(groupId) ?? 0) + 1,
          );
        };
      }, [groupId]);

      return (
        <div
          data-testid={`workspace-${groupId}`}
          data-instance-id={instanceId}
        >
          workspace-{groupId}
        </div>
      );
    },
  };
});
```

Reset all three lifecycle fields in `beforeEach` so tests remain isolated.

- [ ] **Step 3: Write the nested split and close regression test**

Add a test that starts with `group-1` and `group-2`, captures both instance IDs, splits `group-2`, and closes the generated group:

```tsx
it("keeps surviving editor instances mounted through nested split and close", () => {
  useEditorStore.setState({
    panelGroups: [
      {
        id: "group-1",
        activeTabId: "tab-1",
        direction: "horizontal",
        tabs: [createTab("tab-1", "/notes/large.md")],
      },
      {
        id: "group-2",
        activeTabId: "tab-2",
        direction: "horizontal",
        splitParentGroupId: "group-1",
        tabs: [createTab("tab-2", "/notes/large.md")],
      },
    ],
    activeGroupId: "group-1",
  });

  render(<Editor />);
  const firstInstance = screen
    .getByTestId("workspace-group-1")
    .getAttribute("data-instance-id");
  const secondInstance = screen
    .getByTestId("workspace-group-2")
    .getAttribute("data-instance-id");

  act(() => {
    useEditorStore.getState().addPanelGroup("vertical", "group-2");
  });

  const addedGroup = useEditorStore
    .getState()
    .panelGroups.find((group) => !["group-1", "group-2"].includes(group.id));
  expect(addedGroup).toBeDefined();
  expect(
    screen.getByTestId("workspace-group-1").getAttribute("data-instance-id"),
  ).toBe(firstInstance);
  expect(
    screen.getByTestId("workspace-group-2").getAttribute("data-instance-id"),
  ).toBe(secondInstance);

  act(() => {
    useEditorStore
      .getState()
      .removeTab(addedGroup!.id, addedGroup!.activeTabId);
  });

  expect(
    screen.getByTestId("workspace-group-1").getAttribute("data-instance-id"),
  ).toBe(firstInstance);
  expect(
    screen.getByTestId("workspace-group-2").getAttribute("data-instance-id"),
  ).toBe(secondInstance);
  expect(workspaceLifecycle.mounts.get("group-1")).toBe(1);
  expect(workspaceLifecycle.mounts.get("group-2")).toBe(1);
  expect(workspaceLifecycle.unmounts.get("group-1") ?? 0).toBe(0);
  expect(workspaceLifecycle.unmounts.get("group-2") ?? 0).toBe(0);
});
```

- [ ] **Step 4: Run the lifecycle test and verify RED**

Run:

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/components/editor.test.tsx --reporter=dot
```

Expected: FAIL because `workspace-group-2` receives a new instance ID when its leaf becomes a nested split or collapses back to a leaf.

- [ ] **Step 5: Review the focused diff checkpoint**

Run:

```powershell
git diff --check -- src/renderer/src/features/editor/components/editor.test.tsx
git diff -- src/renderer/src/features/editor/components/editor.test.tsx
```

Expected: only lifecycle test changes, with no production edits.

---

### Task 2: Implement and Unit-Test the Persistent Surface Registry

**Files:**
- Create: `src/renderer/src/features/editor/lib/editor-panel-surface-registry.ts`
- Create: `src/renderer/src/features/editor/lib/editor-panel-surface-registry.test.ts`

**Interfaces:**
- Produces: `EditorPanelSurfaceRegistry.registerSurface(groupId: string, surface: HTMLElement): () => void`.
- Produces: `EditorPanelSurfaceRegistry.registerHost(groupId: string, host: HTMLElement): () => void`.
- Consumes: no application store state; the registry is renderer-local and DOM-only.

- [ ] **Step 1: Write failing registry behavior tests**

Create tests covering attachment and isolated cleanup:

```ts
import { describe, expect, it, vi } from "vitest";
import { EditorPanelSurfaceRegistry } from "./editor-panel-surface-registry";

describe("EditorPanelSurfaceRegistry", () => {
  it("moves one stable surface between replacement hosts", () => {
    const registry = new EditorPanelSurfaceRegistry();
    const surface = document.createElement("div");
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    const unregisterSurface = registry.registerSurface("group-1", surface);
    const unregisterFirstHost = registry.registerHost("group-1", firstHost);

    expect(firstHost.firstElementChild).toBe(surface);

    unregisterFirstHost();
    const unregisterSecondHost = registry.registerHost("group-1", secondHost);

    expect(secondHost.firstElementChild).toBe(surface);

    unregisterSecondHost();
    unregisterSurface();
  });

  it("ignores stale host cleanup and leaves other groups untouched", () => {
    const registry = new EditorPanelSurfaceRegistry();
    const firstSurface = document.createElement("div");
    const secondSurface = document.createElement("div");
    const staleHost = document.createElement("div");
    const currentHost = document.createElement("div");
    const otherHost = document.createElement("div");

    registry.registerSurface("group-1", firstSurface);
    registry.registerSurface("group-2", secondSurface);
    const unregisterStaleHost = registry.registerHost("group-1", staleHost);
    registry.registerHost("group-1", currentHost);
    registry.registerHost("group-2", otherHost);

    unregisterStaleHost();

    expect(currentHost.firstElementChild).toBe(firstSurface);
    expect(otherHost.firstElementChild).toBe(secondSurface);
  });

  it("restores focus after a focused surface is reattached", () => {
    const registry = new EditorPanelSurfaceRegistry();
    const surface = document.createElement("div");
    const input = document.createElement("input");
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    document.body.append(firstHost, secondHost);
    surface.append(input);
    registry.registerSurface("group-1", surface);
    const unregisterFirstHost = registry.registerHost("group-1", firstHost);
    input.focus();
    const focusSpy = vi.spyOn(input, "focus");

    unregisterFirstHost();
    registry.registerHost("group-1", secondHost);

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(input);
  });
});
```

- [ ] **Step 2: Run the registry test and verify RED**

Run:

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/lib/editor-panel-surface-registry.test.ts --reporter=dot
```

Expected: FAIL because `editor-panel-surface-registry.ts` does not exist.

- [ ] **Step 3: Implement the minimal registry**

Create the production module:

```ts
interface EditorPanelSurfaceEntry {
  surface: HTMLElement | null;
  host: HTMLElement | null;
  focusTarget: HTMLElement | null;
}

export class EditorPanelSurfaceRegistry {
  private readonly entries = new Map<string, EditorPanelSurfaceEntry>();

  registerSurface(groupId: string, surface: HTMLElement): () => void {
    const entry = this.getEntry(groupId);
    entry.surface = surface;
    this.attach(entry);

    return () => {
      if (entry.surface !== surface) return;
      entry.surface = null;
      entry.focusTarget = null;
      surface.remove();
      this.deleteEmptyEntry(groupId, entry);
    };
  }

  registerHost(groupId: string, host: HTMLElement): () => void {
    const entry = this.getEntry(groupId);
    entry.host = host;
    this.attach(entry);

    return () => {
      if (entry.host !== host) return;
      const activeElement = document.activeElement;
      if (
        entry.surface &&
        activeElement instanceof HTMLElement &&
        entry.surface.contains(activeElement)
      ) {
        entry.focusTarget = activeElement;
      }
      entry.host = null;
      this.deleteEmptyEntry(groupId, entry);
    };
  }

  private getEntry(groupId: string): EditorPanelSurfaceEntry {
    const existing = this.entries.get(groupId);
    if (existing) return existing;

    const entry: EditorPanelSurfaceEntry = {
      surface: null,
      host: null,
      focusTarget: null,
    };
    this.entries.set(groupId, entry);
    return entry;
  }

  private attach(entry: EditorPanelSurfaceEntry): void {
    if (!entry.surface || !entry.host) return;
    if (entry.surface.parentElement !== entry.host) {
      entry.host.append(entry.surface);
    }

    if (entry.focusTarget?.isConnected) {
      entry.focusTarget.focus({ preventScroll: true });
    }
    entry.focusTarget = null;
  }

  private deleteEmptyEntry(
    groupId: string,
    entry: EditorPanelSurfaceEntry,
  ): void {
    if (!entry.surface && !entry.host) {
      this.entries.delete(groupId);
    }
  }
}
```

Add concise Chinese comments around focus capture/restoration and stale cleanup identity checks.

- [ ] **Step 4: Run registry tests and verify GREEN**

Run:

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/lib/editor-panel-surface-registry.test.ts --reporter=dot
```

Expected: PASS with 3 tests.

- [ ] **Step 5: Review the registry diff checkpoint**

Run:

```powershell
git diff --check -- src/renderer/src/features/editor/lib/editor-panel-surface-registry.ts src/renderer/src/features/editor/lib/editor-panel-surface-registry.test.ts
```

Expected: no whitespace errors.

---

### Task 3: Integrate Stable Portal Ownership into the Panel Layout

**Files:**
- Modify: `src/renderer/src/features/editor/components/editor.tsx`
- Verify: `src/renderer/src/features/editor/components/editor.test.tsx`

**Interfaces:**
- Consumes: `EditorPanelSurfaceRegistry` from Task 2.
- Produces: one `PersistentEditorPanel` portal owner per `panelGroups` entry.
- Produces: one replaceable `PanelLeaf` host per layout leaf.

- [ ] **Step 1: Add portal and layout-effect imports**

Update imports to include `useLayoutEffect`, `useRef`, `useState`, and `createPortal`, then import the registry directly:

```tsx
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { EditorPanelSurfaceRegistry } from "../lib/editor-panel-surface-registry";
```

- [ ] **Step 2: Replace leaf ownership with registered hosts**

Implement the host and portal owner:

```tsx
function PanelLeaf({
  groupId,
  surfaceRegistry,
}: {
  groupId: string;
  surfaceRegistry: EditorPanelSurfaceRegistry;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    return surfaceRegistry.registerHost(groupId, host);
  }, [groupId, surfaceRegistry]);

  return (
    <div
      ref={hostRef}
      data-editor-panel-host={groupId}
      className="h-full min-h-0 overflow-hidden"
    />
  );
}

function PersistentEditorPanel({
  groupId,
  surfaceRegistry,
}: {
  groupId: string;
  surfaceRegistry: EditorPanelSurfaceRegistry;
}) {
  const [surface] = useState(() => {
    const element = document.createElement("div");
    element.dataset.editorPanelSurface = groupId;
    element.className = "h-full min-h-0 overflow-hidden";
    return element;
  });

  useLayoutEffect(
    () => surfaceRegistry.registerSurface(groupId, surface),
    [groupId, surface, surfaceRegistry],
  );

  return createPortal(<EditorPanelGroup groupId={groupId} />, surface);
}
```

- [ ] **Step 3: Pass the registry through recursive layout components**

Create one registry instance per `Editor` mount:

```tsx
const [surfaceRegistry] = useState(() => new EditorPanelSurfaceRegistry());
```

Render layout hosts and stable portal owners together:

```tsx
<>
  <RootPanelLayout node={panelLayout} surfaceRegistry={surfaceRegistry} />
  {panelGroups.map(({ id }) => (
    <PersistentEditorPanel
      key={id}
      groupId={id}
      surfaceRegistry={surfaceRegistry}
    />
  ))}
</>
```

Add the `surfaceRegistry` prop to `RootPanelLayout` and every recursive `PanelLayout` call. Leaf nodes render `PanelLeaf` with the same registry.

- [ ] **Step 4: Run the editor lifecycle test and verify GREEN**

Run:

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/components/editor.test.tsx --reporter=dot
```

Expected: PASS; existing horizontal/vertical layout assertions still pass and surviving workspaces retain their original instance IDs.

- [ ] **Step 5: Add a visible-host placement assertion if needed**

For every current group, assert the surface is attached to its matching host:

```tsx
expect(
  screen
    .getByTestId("workspace-group-2")
    .closest('[data-editor-panel-surface="group-2"]')?.parentElement,
).toHaveAttribute("data-editor-panel-host", "group-2");
```

Run the editor test again and keep it green.

- [ ] **Step 6: Review the integration diff checkpoint**

Run:

```powershell
git diff --check -- src/renderer/src/features/editor/components/editor.tsx src/renderer/src/features/editor/components/editor.test.tsx
```

Expected: no whitespace errors and no edits outside persistent surface integration and regression coverage.

---

### Task 4: Remove the Raw Markdown Split Transition

**Files:**
- Modify: `src/renderer/src/features/editor/components/editor-workspace.test.tsx`
- Modify: `src/renderer/src/features/editor/components/editor-workspace.tsx`

**Interfaces:**
- Consumes: existing `BlockNoteEditor({ groupId, tabId })`.
- Removes: `DEFER_SPLIT_RICH_EDITOR_MOUNT_LENGTH`, `SplitRichEditorMountGate`, and `RichEditorSplitSnapshot`.

- [ ] **Step 1: Change the large split-pane test to require direct rich-editor mounting**

Replace the source-snapshot test with:

```tsx
it("mounts a large split rich editor without a raw Markdown transition", () => {
  render(<EditorWorkspace groupId="group-2" tabId="tab-2" />);

  expect(screen.queryByTestId("split-rich-editor-snapshot")).toBeNull();
  expect(screen.getByTestId("blocknote-editor")).toHaveTextContent(
    "group-2:tab-2",
  );
  expect(screen.queryByText(createLargeContent())).toBeNull();
});
```

Remove requestAnimationFrame test setup that is no longer needed.

- [ ] **Step 2: Run the workspace test and verify RED**

Run:

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/components/editor-workspace.test.tsx --reporter=dot
```

Expected: FAIL because the current draft still renders `split-rich-editor-snapshot` before the editor.

- [ ] **Step 3: Remove the snapshot gate from production**

Delete the split-size threshold, split-group lookup, gate component, and snapshot component. Restore the rich branch to:

```tsx
{tabMode === "source" ? (
  // Existing source editor branch remains unchanged.
) : (
  <BlockNoteEditor groupId={groupId} tabId={tabId} />
)}
```

Keep the optimized store selectors and current-tab callbacks already present in the working tree.

- [ ] **Step 4: Run the workspace test and verify GREEN**

Run:

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/components/editor-workspace.test.tsx --reporter=dot
```

Expected: PASS with direct rich-editor mounting and no source snapshot.

- [ ] **Step 5: Run all focused editor regressions**

Run:

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/components/editor.test.tsx src/renderer/src/features/editor/components/editor-workspace.test.tsx src/renderer/src/features/editor/lib/editor-panel-surface-registry.test.ts src/renderer/src/features/editor/lib/editor-cache.test.ts src/renderer/src/store/editor.store.test.ts --reporter=dot
```

Expected: all focused files pass.

---

### Task 5: Format, Verify, and Audit the Final Change

**Files:**
- Modify only if formatting requires it: all files from Tasks 1–4.
- Verify: the complete repository.

**Interfaces:**
- Consumes: project scripts in `package.json`.
- Produces: fresh typecheck, lint, test, and build evidence.

- [ ] **Step 1: Format only the touched implementation and test files**

Run Oxfmt against the explicit file list so unrelated user changes are not reformatted:

```powershell
pnpm.cmd exec oxfmt --write src/renderer/src/features/editor/components/editor.tsx src/renderer/src/features/editor/components/editor.test.tsx src/renderer/src/features/editor/components/editor-workspace.tsx src/renderer/src/features/editor/components/editor-workspace.test.tsx src/renderer/src/features/editor/lib/editor-panel-surface-registry.ts src/renderer/src/features/editor/lib/editor-panel-surface-registry.test.ts
```

- [ ] **Step 2: Run focused tests after formatting**

Run:

```powershell
pnpm.cmd exec vitest run src/renderer/src/features/editor/components/editor.test.tsx src/renderer/src/features/editor/components/editor-workspace.test.tsx src/renderer/src/features/editor/lib/editor-panel-surface-registry.test.ts src/renderer/src/features/editor/lib/editor-cache.test.ts src/renderer/src/store/editor.store.test.ts --reporter=dot
```

Expected: all focused tests pass.

- [ ] **Step 3: Run TypeScript checking**

Run:

```powershell
pnpm.cmd typecheck
```

Expected: exit code 0.

- [ ] **Step 4: Run linting**

Run:

```powershell
pnpm.cmd lint
```

Expected: exit code 0.

- [ ] **Step 5: Run the complete test suite**

Run:

```powershell
pnpm.cmd exec vitest run --reporter=dot
```

Expected: record the exact result. If unrelated pre-existing failures remain, confirm focused editor tests are green and report the unrelated failures without changing their files.

- [ ] **Step 6: Run the production build**

Run:

```powershell
pnpm.cmd build
```

Expected: exit code 0.

- [ ] **Step 7: Audit scope and acceptance criteria**

Run:

```powershell
git diff --check
git status --short
git diff -- src/renderer/src/features/editor/components/editor.tsx src/renderer/src/features/editor/components/editor.test.tsx src/renderer/src/features/editor/components/editor-workspace.tsx src/renderer/src/features/editor/components/editor-workspace.test.tsx src/renderer/src/features/editor/lib/editor-panel-surface-registry.ts src/renderer/src/features/editor/lib/editor-panel-surface-registry.test.ts
```

Confirm:

- Existing panes show zero unmounts during split and close tests.
- One split creates one new workspace instance.
- One close destroys only the closed workspace instance.
- No raw Markdown transition is rendered.
- No dependency or lockfile changed.
- Unrelated staged and unstaged files remain untouched.
