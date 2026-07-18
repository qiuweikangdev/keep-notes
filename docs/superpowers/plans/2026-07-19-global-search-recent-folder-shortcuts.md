# Global Search Recent Folder Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show up to five recent files and five recent folders in the global search dialog's default state while keeping entered queries file-only.

**Architecture:** Keep the change inside the existing `SearchModal`. Derive file, folder, and query result groups from the existing Zustand stores, flatten the groups into one selection sequence, and render visual headings without changing the listbox's keyboard semantics.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind CSS, Vitest, Testing Library, Electron Vite

## Global Constraints

- Do not add dependencies or modify `package.json` or `pnpm-lock.yaml`.
- Keep recent file persistence capped at its existing store limit; only the dialog display limit changes to five per group.
- Searchable files remain limited to `.md` and `.txt` files in the current workspace.
- Entered queries search files only; recent folders are default-state shortcuts, not search results.
- Reuse `loadTree`, `openFile`, and the existing file-tree reveal event.
- Preserve the existing IME, outside-click, focus, portal, and keyboard-wrap behavior.
- Add Chinese comments only if new core logic needs explanation.
- Do not touch the user's unrelated editor and code-block changes.

---

### Task 1: Add grouped recent shortcuts and file-only query behavior

**Files:**
- Modify: `src/renderer/src/features/search/components/search-modal.test.tsx`
- Modify: `src/renderer/src/features/search/components/search-modal.tsx`

**Interfaces:**
- Consumes: `useTreeStore().recentFolders`, `useEditorStore().recentOpenedFilePaths`, `useElectron().loadTree(path)`, and `useElectron().openFile(path)`.
- Produces: a default-state `SearchResultGroup[]` ordered as files then folders, a flattened `SearchResult[]` for keyboard selection, and a file-only search-state group.

- [ ] **Step 1: Write the failing grouped-result tests**

In `search-modal.test.tsx`, set six folders in `beforeEach` so the limit is observable:

```tsx
useTreeStore.setState({
  treeRoot: { title: "notes", key: "C:\\notes" },
  treeData,
  selectedKey: null,
  recentFolders: Array.from({ length: 6 }, (_, index) => ({
    title: `folder-${index + 1}`,
    path: `C:\\workspaces\\folder-${index + 1}`,
  })),
});
```

Replace the ten-file default test with:

```tsx
it("shows five recent files followed by five recent folders by default", () => {
  render(<SearchModal isOpen onClose={vi.fn()} />);

  const options = screen.getAllByRole("option");
  expect(screen.getByText("文件")).toBeInTheDocument();
  expect(screen.getByText("目录")).toBeInTheDocument();
  expect(options).toHaveLength(10);
  expect(options.map((option) => option.textContent)).toEqual([
    expect.stringContaining("first.md"),
    expect.stringContaining("second.txt"),
    expect.stringContaining("third.md"),
    expect.stringContaining("fourth.md"),
    expect.stringContaining("fifth.md"),
    expect.stringContaining("folder-1"),
    expect.stringContaining("folder-2"),
    expect.stringContaining("folder-3"),
    expect.stringContaining("folder-4"),
    expect.stringContaining("folder-5"),
  ]);
  expect(screen.queryByText("sixth.md")).not.toBeInTheDocument();
  expect(screen.queryByText("folder-6")).not.toBeInTheDocument();
  expect(screen.queryByText("image.png")).not.toBeInTheDocument();
});
```

Replace the no-workspace folder test with:

```tsx
it("shows up to five recent folders when no workspace is open", async () => {
  const user = userEvent.setup();
  useTreeStore.setState({
    treeRoot: null,
    treeData: [],
    recentFolders: Array.from({ length: 6 }, (_, index) => ({
      title: `folder-${index + 1}`,
      path: `C:\\workspaces\\folder-${index + 1}`,
    })),
  });
  render(<SearchModal isOpen onClose={vi.fn()} />);

  expect(screen.getAllByRole("option")).toHaveLength(5);
  expect(screen.queryByText("文件")).not.toBeInTheDocument();
  expect(screen.getByText("目录")).toBeInTheDocument();
  expect(screen.queryByText("folder-6")).not.toBeInTheDocument();

  await user.click(screen.getByText("folder-1"));
  expect(loadTree).toHaveBeenCalledWith("C:\\workspaces\\folder-1");
  expect(openFile).not.toHaveBeenCalled();
});
```

Add these new behavior tests:

```tsx
it("hides recent folders and searches only files after query input", async () => {
  const user = userEvent.setup();
  useTreeStore.setState({
    recentFolders: [
      {
        title: "workspace-shortcut",
        path: "C:\\workspaces\\workspace-shortcut",
      },
    ],
  });
  render(<SearchModal isOpen onClose={vi.fn()} />);

  await user.type(screen.getByRole("searchbox"), "workspace-shortcut");

  expect(screen.queryByText("目录")).not.toBeInTheDocument();
  expect(screen.queryByText("workspace-shortcut")).not.toBeInTheDocument();
  expect(screen.getByText("没有找到匹配文件")).toBeInTheDocument();
});

it("does not search recent folders when no workspace is open", async () => {
  const user = userEvent.setup();
  useTreeStore.setState({
    treeRoot: null,
    treeData: [],
    recentFolders: [
      { title: "archive", path: "C:\\workspaces\\archive" },
    ],
  });
  render(<SearchModal isOpen onClose={vi.fn()} />);

  await user.type(screen.getByRole("searchbox"), "archive");

  expect(screen.queryByRole("option")).not.toBeInTheDocument();
  expect(screen.queryByText("archive")).not.toBeInTheDocument();
  expect(screen.getByText("没有找到匹配文件")).toBeInTheDocument();
});

it("opens a folder after keyboard selection crosses the group boundary", async () => {
  const user = userEvent.setup();
  useEditorStore.setState({
    recentOpenedFilePaths: ["C:\\notes\\docs\\first.md"],
    panelGroups: [],
  });
  useTreeStore.setState({
    selectedKey: null,
    recentFolders: [
      { title: "archive", path: "C:\\workspaces\\archive" },
    ],
  });
  const onClose = vi.fn();
  render(<SearchModal isOpen onClose={onClose} />);

  await user.keyboard("{ArrowDown}{Enter}");

  expect(loadTree).toHaveBeenCalledWith("C:\\workspaces\\archive");
  expect(openFile).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
});

it("omits empty groups and shows one empty default message", () => {
  useTreeStore.setState({
    treeRoot: null,
    treeData: [],
    selectedKey: null,
    recentFolders: [],
  });
  useEditorStore.setState({
    recentOpenedFilePaths: [],
    panelGroups: [],
  });
  render(<SearchModal isOpen onClose={vi.fn()} />);

  expect(screen.queryByText("文件")).not.toBeInTheDocument();
  expect(screen.queryByText("目录")).not.toBeInTheDocument();
  expect(screen.getByText("暂无最近打开的文件或目录")).toBeInTheDocument();
});

it("uses the taller grouped result viewport", () => {
  render(<SearchModal isOpen onClose={vi.fn()} />);
  expect(screen.getByRole("listbox")).toHaveClass("max-h-[376px]");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run `pnpm test src/renderer/src/features/search/components/search-modal.test.tsx`.

Expected: FAIL because the dialog renders ten files without folder grouping, searches recent folders without a workspace, and uses `max-h-[320px]`.

- [ ] **Step 3: Implement grouped result derivation**

In `search-modal.tsx`, replace `RECENT_RESULT_LIMIT` with `RECENT_GROUP_LIMIT = 5`, use the new name in `getRecentOpenedFiles`, and add:

```tsx
interface SearchResultGroup {
  label: "文件" | "目录";
  results: SearchResult[];
}

type SearchDisplayItem =
  | { type: "heading"; key: string; label: SearchResultGroup["label"] }
  | { type: "result"; result: SearchResult; resultIndex: number };

function createFolderResult(folder: {
  title: string;
  path: string;
}): SearchResult {
  return {
    kind: "folder",
    key: folder.path,
    title: folder.title,
    subtitle: folder.path,
  };
}
```

Replace the current `results` memo with:

```tsx
const normalizedQuery = query.trim().toLowerCase();
const hasQuery = normalizedQuery.length > 0;

const recentFileResults = useMemo(
  () =>
    getRecentOpenedFiles(searchableFiles, defaultCandidateFilePaths).map(
      (file) => createFileResult(file, treeRoot?.key),
    ),
  [defaultCandidateFilePaths, searchableFiles, treeRoot?.key],
);

const recentFolderResults = useMemo(
  () =>
    recentFolders
      .slice(0, RECENT_GROUP_LIMIT)
      .map((folder) => createFolderResult(folder)),
  [recentFolders],
);

const searchedFileResults = useMemo(() => {
  if (!hasWorkspace || !normalizedQuery) return [];

  return searchableFiles
    .filter((file) => {
      const title = file.title.toLowerCase();
      const path = file.key.toLowerCase();
      return title.includes(normalizedQuery) || path.includes(normalizedQuery);
    })
    .map((file) => createFileResult(file, treeRoot?.key));
}, [hasWorkspace, normalizedQuery, searchableFiles, treeRoot?.key]);

const resultGroups = useMemo<SearchResultGroup[]>(() => {
  if (hasQuery) {
    return searchedFileResults.length > 0
      ? [{ label: "文件", results: searchedFileResults }]
      : [];
  }

  const groups: SearchResultGroup[] = [];
  if (recentFileResults.length > 0) {
    groups.push({ label: "文件", results: recentFileResults });
  }
  if (recentFolderResults.length > 0) {
    groups.push({ label: "目录", results: recentFolderResults });
  }
  return groups;
}, [hasQuery, recentFileResults, recentFolderResults, searchedFileResults]);

const results = useMemo(
  () => resultGroups.flatMap((group) => group.results),
  [resultGroups],
);

const displayItems = useMemo<SearchDisplayItem[]>(() => {
  let resultIndex = 0;

  return resultGroups.flatMap((group) => [
    {
      type: "heading" as const,
      key: `heading-${group.label}`,
      label: group.label,
    },
    ...group.results.map((result) => ({
      type: "result" as const,
      result,
      resultIndex: resultIndex++,
    })),
  ]);
}, [resultGroups]);
```

- [ ] **Step 4: Render both groups inside one listbox**

Remove `resultTypeLabel` and the old standalone heading. Use `placeholder="搜索文件"`. Replace the result body with:

```tsx
{results.length > 0 ? (
  <div
    id="search-results"
    aria-label={hasQuery ? "搜索结果" : "最近打开项目"}
    className="max-h-[376px] overflow-y-auto px-1.5 pb-2"
    role="listbox"
  >
    {displayItems.map((item) => {
      if (item.type === "heading") {
        return (
          <div
            key={item.key}
            className="px-2 pb-1 pt-1 text-xs text-[var(--text-muted)]"
            role="presentation"
          >
            {item.label}
          </div>
        );
      }

      const { result, resultIndex } = item;
      const selected = resultIndex === selectedIndex;

      return (
        <button
          id={`search-result-${resultIndex}`}
          key={`${result.kind}-${result.key}`}
          ref={(element) => {
            resultRefs.current[resultIndex] = element;
          }}
          aria-selected={selected}
          className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors ${
            selected
              ? "bg-[var(--active-bg)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          }`}
          role="option"
          type="button"
          onClick={() => openSelectedResult(result)}
        >
          {result.kind === "folder" ? (
            <FolderOpen aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          ) : (
            <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
          )}
          <span className="min-w-0 flex-1 truncate font-medium">
            {result.title}
          </span>
          {result.subtitle ? (
            <span className="min-w-[120px] max-w-[240px] truncate text-right text-xs text-[var(--text-muted)]">
              {result.subtitle}
            </span>
          ) : null}
        </button>
      );
    })}
  </div>
) : (
  <div className="px-4 pb-5 pt-2 text-[13px] text-[var(--text-muted)]">
    {hasQuery ? "没有找到匹配文件" : "暂无最近打开的文件或目录"}
  </div>
)}
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run `pnpm test src/renderer/src/features/search/components/search-modal.test.tsx`.

Expected: all `SearchModal` tests PASS without warnings or unhandled errors.

- [ ] **Step 6: Format only the touched files and re-run the focused test**

```bash
pnpm exec oxfmt --write src/renderer/src/features/search/components/search-modal.tsx src/renderer/src/features/search/components/search-modal.test.tsx
pnpm test src/renderer/src/features/search/components/search-modal.test.tsx
```

Expected: formatting exits with status 0, no unrelated files change, and all focused tests PASS.

- [ ] **Step 7: Commit the feature files**

```bash
git add src/renderer/src/features/search/components/search-modal.tsx src/renderer/src/features/search/components/search-modal.test.tsx
git commit -m "feat: add recent folder search shortcuts"
```

Expected: the commit contains only the global-search component and its tests.

---

### Task 2: Verify repository correctness

**Files:**
- Verify only: `src/renderer/src/features/search/components/search-modal.tsx`
- Verify only: `src/renderer/src/features/search/components/search-modal.test.tsx`

**Interfaces:**
- Consumes: the completed grouped global-search behavior from Task 1.
- Produces: verification evidence for TypeScript correctness, lint compliance, regression coverage, and production bundling.

- [ ] **Step 1: Run TypeScript checks**

Run `pnpm typecheck`.

Expected: exit status 0 with no TypeScript errors.

- [ ] **Step 2: Run lint checks**

Run `pnpm lint`.

Expected: exit status 0 with no new warnings or errors in the global-search files. Record any unrelated existing findings without editing unrelated files.

- [ ] **Step 3: Run the full test suite**

Run `pnpm test`.

Expected: exit status 0 with every Vitest suite passing.

- [ ] **Step 4: Build the application**

Run `pnpm build`.

Expected: TypeScript checks and Electron Vite builds complete successfully for main, preload, and renderer targets.

- [ ] **Step 5: Confirm final diff scope**

```bash
git status --short
git show --stat --oneline HEAD
```

Expected: the feature commit lists only `search-modal.tsx` and `search-modal.test.tsx`; the user's pre-existing editor/code-block modifications remain unstaged and unchanged.
