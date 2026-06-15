# Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the sidebar bottom panel layout, simplify the action area, remove sorting UI, and optimize the recent directories display.

**Architecture:** Modify the `quick-actions-panel.tsx` component to redesign the bottom panel layout, remove expand/collapse logic, and make recent directories always visible.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide React icons

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/renderer/src/features/file-tree/components/quick-actions-panel.tsx` | Bottom panel main component, contains action area and recent directories |

## Implementation Steps

### Task 1: Refactor QuickActionsPanel Component

**Files:**
- Modify: `src/renderer/src/features/file-tree/components/quick-actions-panel.tsx`

- [ ] **Step 1: Remove MoreVertical icon import**

The current code imports `MoreVertical` icon which is no longer needed in the new design. Remove this import.

```typescript
// Before
import {
  RefreshCw,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  FolderOpen,
  X,
  MoreVertical,
} from "lucide-react";

// After
import {
  RefreshCw,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  FolderOpen,
  X,
} from "lucide-react";
```

- [ ] **Step 2: Change isExpanded default value to true**

The new design requires recent directories to be expanded by default. Change the initial value of `isExpanded` from `false` to `true`.

```typescript
// Before
const [isExpanded, setIsExpanded] = useState(false);

// After
const [isExpanded, setIsExpanded] = useState(true);
```

- [ ] **Step 3: Modify rendering logic when no treeRoot**

Remove the `MoreVertical` button and simplify the layout. When no directory is open, only show the "Open Folder..." button and recent directories list.

```typescript
// Before (lines 88-139)
if (!treeRoot) {
  return (
    <div
      ref={panelRef}
      className="flex-shrink-0"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {/* When expanded, only show panel */}
      {isExpanded && hasRecentContent ? (
        <div style={{ borderTop: "1px solid var(--border-color)" }}>
          <RecentContentPanel
            recentFolders={recentFolders}
            onOpenRecentFolder={handleOpenRecentFolder}
            onRemoveRecentFolder={handleRemoveRecentFolder}
            onOpenFolder={handleOpenFolder}
            showOpenFolder={!treeRoot}
          />
        </div>
      ) : (
        /* Normal state: show open folder button */
        <div
          className="quick-open-folder flex items-center"
          style={{ borderTop: "1px solid var(--border-color)" }}
        >
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-2 py-2.5 text-[13px]"
            style={{ color: "var(--text-muted)" }}
            onClick={handleOpenFolder}
          >
            <FolderOpen className="h-4 w-4" />
            打开文件夹...
          </button>

          {/* More button on the right */}
          {hasRecentContent && (
            <button
              type="button"
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center"
              style={{ color: "var(--text-muted)" }}
              onClick={() => {
                setIsExpanded(true);
                onExpandedChange?.(true);
              }}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// After
if (!treeRoot) {
  return (
    <div
      ref={panelRef}
      className="flex-shrink-0"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {/* Open folder button */}
      <div
        className="quick-open-folder flex items-center"
        style={{ borderTop: "1px solid var(--border-color)" }}
      >
        <button
          type="button"
          className="flex flex-1 items-center justify-center gap-2 py-2.5 text-[13px]"
          style={{ color: "var(--text-muted)" }}
          onClick={handleOpenFolder}
        >
          <FolderOpen className="h-4 w-4" />
          打开文件夹...
        </button>
      </div>

      {/* Recent directories list */}
      {hasRecentContent && (
        <div
          className="px-1 pb-0.5"
          style={{ borderTop: "1px solid var(--border-color)" }}
        >
          <RecentContentPanel
            recentFolders={recentFolders}
            onOpenRecentFolder={handleOpenRecentFolder}
            onRemoveRecentFolder={handleRemoveRecentFolder}
            onOpenFolder={handleOpenFolder}
            showOpenFolder={false}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Modify rendering logic when treeRoot exists**

Remove the expand/collapse button and make recent directories always visible. Simplify the toolbar layout.

```typescript
// Before (lines 142-220)
return (
  <div
    ref={panelRef}
    className="flex-shrink-0"
    style={{ backgroundColor: "var(--bg-secondary)" }}
  >
    {/* Main toolbar - icon buttons */}
    <div
      className="flex items-center justify-between px-1 py-1"
      style={{ borderTop: "1px solid var(--border-color)" }}
    >
      <div className="flex items-center gap-0.5">
        <ToolButton
          icon={<ExternalLink className="h-3.5 w-3.5" />}
          tooltip="在资源管理器中显示"
          onClick={handleOpenInExplorer}
        />
        <ToolButton
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          tooltip="刷新"
          onClick={handleRefresh}
        />
      </div>
      {hasRecentContent && (
        <Tooltip.Provider>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded transition-colors"
                style={{ color: "var(--text-muted)" }}
                onClick={handleToggleExpand}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5" />
                )}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="z-50 rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
                sideOffset={5}
              >
                {isExpanded ? "收起最近列表" : "展开最近列表"}
                <Tooltip.Arrow className="fill-popover" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      )}
    </div>

    {/* Recent panel */}
    {isExpanded && hasRecentContent && (
      <div
        className="px-1 pb-0.5"
        style={{ borderTop: "1px solid var(--border-color)" }}
      >
        <RecentContentPanel
          recentFolders={recentFolders}
          onOpenRecentFolder={handleOpenRecentFolder}
          onRemoveRecentFolder={handleRemoveRecentFolder}
          onOpenFolder={handleOpenFolder}
          showOpenFolder={!treeRoot}
        />
      </div>
    )}
  </div>
);

// After
return (
  <div
    ref={panelRef}
    className="flex-shrink-0"
    style={{ backgroundColor: "var(--bg-secondary)" }}
  >
    {/* Action area */}
    <div
      className="flex items-center gap-0.5 px-1 py-1"
      style={{ borderTop: "1px solid var(--border-color)" }}
    >
      <ToolButton
        icon={<ExternalLink className="h-3.5 w-3.5" />}
        tooltip="Show in Explorer"
        onClick={handleOpenInExplorer}
      />
      <ToolButton
        icon={<RefreshCw className="h-3.5 w-3.5" />}
        tooltip="Refresh"
        onClick={handleRefresh}
      />
    </div>

    {/* Recent directories */}
    {hasRecentContent && (
      <div
        className="px-1 pb-0.5"
        style={{ borderTop: "1px solid var(--border-color)" }}
      >
        <RecentContentPanel
          recentFolders={recentFolders}
          onOpenRecentFolder={handleOpenRecentFolder}
          onRemoveRecentFolder={handleRemoveRecentFolder}
          onOpenFolder={handleOpenFolder}
          showOpenFolder={false}
        />
      </div>
    )}
  </div>
);
```

- [ ] **Step 5: Remove unused callback functions**

Remove the `handleToggleExpand` function since there's no expand/collapse button anymore.

```typescript
// Before (lines 47-51)
const handleToggleExpand = useCallback(() => {
  const newState = !isExpanded;
  setIsExpanded(newState);
  onExpandedChange?.(newState);
}, [isExpanded, onExpandedChange]);

// After
// Delete this function
```

- [ ] **Step 6: Remove click outside panel logic**

Since recent directories are always visible, there's no need for the click outside panel logic.

```typescript
// Before (lines 28-45)
// Click outside to close panel
useEffect(() => {
  if (!isExpanded) return;

  const handleClickOutside = (event: MouseEvent) => {
    if (
      panelRef.current &&
      !panelRef.current.contains(event.target as Node)
    ) {
      setIsExpanded(false);
      onExpandedChange?.(false);
    }
  };

  document.addEventListener("mousedown", handleClickOutside);
  return () => {
    document.removeEventListener("mousedown", handleClickOutside);
  };
}, [isExpanded, onExpandedChange]);

// After
// Delete this useEffect
```

- [ ] **Step 7: Remove isExpanded state**

Since recent directories are always visible, the `isExpanded` state is no longer needed.

```typescript
// Before
const [isExpanded, setIsExpanded] = useState(true);

// After
// Delete this state
```

- [ ] **Step 8: Update RecentContentPanel default expand state**

Modify the `RecentContentPanel` component to have `foldersCollapsed` default value as `false` (expanded state).

```typescript
// Before (line 282)
const [foldersCollapsed, setFoldersCollapsed] = useState(false);

// After
// Keep unchanged, default value is already false
```

- [ ] **Step 9: Run type check**

Verify code modifications have no type errors.

```bash
pnpm typecheck
```

- [ ] **Step 10: Run lint check**

Verify code style complies with project standards.

```bash
pnpm lint
```

- [ ] **Step 11: Run build**

Verify the project can build successfully.

```bash
pnpm build
```

- [ ] **Step 12: Commit code**

```bash
git add src/renderer/src/features/file-tree/components/quick-actions-panel.tsx
git commit -m "refactor: simplify sidebar bottom panel layout"
```

## Acceptance Criteria

1. Bottom panel displays action area and recent directories
2. Action area shows "Show in Explorer" and "Refresh" buttons
3. Recent directories are expanded by default
4. Recent directories can be expanded/collapsed via title bar icon
5. Sorting section is no longer displayed
6. "+" button is no longer displayed
7. New file functionality is still available via right-click menu
8. Search functionality is still available via top toolbar

## Potential Risks

1. **Layout adjustment**: Bottom panel height may need adjustment for the new layout
2. **State management**: Recent directories expand/collapse state needs to be managed correctly
3. **Windows compatibility**: Need to ensure "Show in Explorer" displays correctly on Windows
