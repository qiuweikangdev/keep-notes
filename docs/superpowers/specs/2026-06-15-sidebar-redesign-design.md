# Sidebar Redesign

## Overview

Redesign the left sidebar layout based on reference mockups, simplifying the action area, removing sorting UI, and optimizing the recent directories display.

## Goals

1. Simplify the bottom panel layout
2. Remove the sorting section, keep default sorting (by most recently opened time)
3. Remove the "+" button
4. Optimize recent directories display (default expanded)

## Design

### Overall Layout

The sidebar is divided into three sections from top to bottom:

| Section | Content | Notes |
|---------|---------|-------|
| **Top Toolbar** | View toggle, title, search | Keep existing functionality unchanged |
| **Main Content** | File tree / Outline view | Keep existing functionality unchanged |
| **Bottom Panel** | Action area + Recent directories | Redesigned |

### Bottom Panel Detailed Design

#### Action Area (when a directory is open)

```
┌─────────────────────────────────────┐
│  📂 Show in Explorer    🔄 Refresh  │
└─────────────────────────────────────┘
```

- **Show in Explorer**: Opens the current directory in the system file manager
  - macOS: Displays as "Show in Finder"
  - Windows: Displays as "Show in Explorer"
- **Refresh**: Reloads the current directory

#### Action Area (when no directory is open)

```
┌─────────────────────────────────────┐
│  📁 Open Folder...                  │
└─────────────────────────────────────┘
```

- **Open Folder...**: Opens the system file selection dialog

#### Recent Directories

```
┌─────────────────────────────────────┐
│  Recent Directories          ▲/▼   │
│  📁 blog                           │
│  📁 my-book-notes                  │
│  📁 interview-notes                │
│  📁 claude-code-notes              │
│  📁 doc                            │
│  📁 my-notes3                   ✕  │
└─────────────────────────────────────┘
```

- **Title bar**: Displays "Recent Directories" with expand/collapse icon on the right
- **Default state**: Expanded
- **List items**: Click to open the corresponding directory
- **Remove button**: Shows ✕ on hover, click to remove the record
- **Sorting**: By most recently opened time (newest first)

### Removed Features

| Feature | Description |
|---------|-------------|
| **Sorting section** | Completely removed, keep default sorting (by most recently opened time) |
| **"+" button** | Completely removed |
| **New File** | Removed from action area (still available via right-click menu) |
| **Search** | Removed from action area (still available via top toolbar) |

## Code Changes

| File | Changes |
|------|---------|
| `quick-actions-panel.tsx` | Redesign bottom panel layout, remove sorting-related code |
| `file-tree.tsx` | Keep top toolbar unchanged |
| Main process sorting code | No changes needed (keep existing sorting logic) |

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

1. **Windows compatibility**: Need to ensure "Show in Explorer" displays correctly on Windows
2. **Layout adjustment**: Bottom panel height may need adjustment for the new layout
3. **State management**: Recent directories expand/collapse state needs to be managed correctly
