# Title Bar Double-Click Maximize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement double-click maximize/restore functionality for the title bar, supporting both Windows and macOS platforms.

**Architecture:** Add double-click event handler to the title bar component that checks if the click target is not a button area, then calls the existing maximizeWindow API method.

**Tech Stack:** React, TypeScript, Electron IPC

---

## File Structure

Only one file needs modification:

- **Modify:** `src/renderer/src/components/layout/title-bar.tsx` - Add double-click event handler with button area exclusion

## Task 1: Add Double-Click Handler to Title Bar

**Files:**
- Modify: `src/renderer/src/components/layout/title-bar.tsx`

- [ ] **Step 1: Read the current title-bar.tsx file**

Read the file to understand the current structure and identify where to add the double-click handler.

Run: `read src/renderer/src/components/layout/title-bar.tsx`
Expected: View the current component structure

- [ ] **Step 2: Add handleDoubleClick function**

Add the double-click handler function inside the TitleBar component, after the existing state declarations:

```tsx
const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
  // Check if the event target is a button or inside a button
  const target = e.target as HTMLElement;
  if (target.closest('button')) {
    return; // Ignore double-click on button area
  }
  
  // Call maximize window method
  window.electronAPI.maximizeWindow();
};
```

- [ ] **Step 3: Add onDoubleClick event to root div**

Add the `onDoubleClick={handleDoubleClick}` prop to the root div element that currently has `ref={titleBarRef}`:

```tsx
<div
  ref={titleBarRef}
  data-testid="title-bar"
  className="flex items-center select-none"
  onDoubleClick={handleDoubleClick}
  style={{
    // macOS and native traffic light buttons share the same height baseline
    height: isMac ? `${MAC_TITLE_BAR_HEIGHT}px` : "44px",
    backgroundColor: "var(--bg-primary)",
    borderBottom: "1px solid var(--border-color)",
  }}
>
```

- [ ] **Step 4: Verify the implementation**

Run the development server to test the functionality:

Run: `pnpm dev`
Expected: Application starts without errors

- [ ] **Step 5: Test double-click behavior**

Manually test the following scenarios:
1. Double-click on empty area of title bar → window should maximize
2. Double-click again → window should restore to original size
3. Double-click on buttons (sidebar toggle, search, theme, settings, window controls) → should not trigger maximize
4. Test on both Windows and macOS if possible

- [ ] **Step 6: Run type checking**

Run: `pnpm typecheck`
Expected: No TypeScript errors

- [ ] **Step 7: Run linting**

Run: `pnpm lint`
Expected: No linting errors

- [ ] **Step 8: Commit the changes**

```bash
git add src/renderer/src/components/layout/title-bar.tsx
git commit -m "feat: add double-click maximize/restore to title bar"
```

## Self-Review Checklist

1. **Spec coverage:** 
   - ✅ Double-click maximize: Implemented
   - ✅ Double-click restore: Implemented (via existing maximizeWindow API)
   - ✅ Platform support: Uses existing electronAPI which handles both platforms
   - ✅ Area restriction: Only triggers on empty areas
   - ✅ Button exclusion: Uses closest('button') check

2. **Placeholder scan:** No TBD, TODO, or placeholder content found

3. **Type consistency:** Uses React.MouseEvent<HTMLDivElement> which matches the existing component types

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-25-title-bar-double-click-maximize.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?