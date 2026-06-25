# Title Bar Double-Click Maximize Design

## Overview

Implement double-click maximize/restore functionality for the title bar, supporting both Windows and macOS platforms. When users double-click the empty area of the title bar, the window will toggle between maximized and restored states.

## Requirements

### Functional Requirements

1. **Double-click Maximize**: Double-clicking the empty area of the title bar maximizes the window
2. **Double-click Restore**: Double-clicking again restores the window to its original size
3. **Platform Support**: Support both Windows and macOS platforms
4. **Area Restriction**: Only trigger in the empty area of the title bar, excluding button areas
5. **Button Exclusion**: Double-clicking buttons does not trigger maximize, only responds to button click events

### Non-Functional Requirements

1. **Performance**: Double-click response delay should be less than 300ms
2. **Compatibility**: Does not affect existing drag, button click, and other functionalities
3. **User Experience**: Behavior should align with operating system native habits

## Architecture

### Component Architecture

```
TitleBar Component
├── Double-Click Handler
│   ├── Event Target Check
│   ├── Button Area Exclusion
│   └── Maximize Toggle
├── Existing Drag Behavior
├── Button Click Handlers
└── Platform Detection
```

### Data Flow

1. User double-clicks the title bar area
2. React onDoubleClick event triggers
3. Check if the event target is a button area
4. If not a button area, call electronAPI.maximizeWindow()
5. Main process handles window maximize/restore state switching

## Detailed Design

### 1. Event Handling

Add `onDoubleClick` event handler to the root div in `title-bar.tsx`:

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

### 2. Button Area Exclusion

Use `closest('button')` method to check if the event target is inside a button:

- If the event target is a button or a child element of a button, ignore the double-click
- If the event target is an empty area, trigger maximize

### 3. Platform Handling

The existing `electronAPI.maximizeWindow()` method already handles platform differences:

- **Windows**: Uses `win.maximize()` and `win.unmaximize()`
- **macOS**: Uses `win.maximize()` and `win.unmaximize()`, macOS native traffic light buttons will also sync state

### 4. Integration with Existing Behavior

- **Drag Behavior**: Does not affect existing `webkitAppRegion: "drag"` settings
- **Button Clicks**: Does not affect existing button click event handling
- **Search Bar**: Search bar button area will also be excluded

## Implementation Plan

### Files to Modify

1. **`src/renderer/src/components/layout/title-bar.tsx`**
   - Add `handleDoubleClick` function
   - Add `onDoubleClick` event handler to the root div
   - Add button area exclusion logic

### No New Files Required

- No new components or utility functions needed
- No main process code modification needed
- No preload API modification needed

## Testing Strategy

### Unit Tests

1. **Double-click Empty Area**: Verify `maximizeWindow()` is called
2. **Double-click Button Area**: Verify `maximizeWindow()` is not called
3. **Platform Detection**: Verify both macOS and Windows work correctly

### Integration Tests

1. **Coexistence with Drag**: Verify double-click does not affect window dragging
2. **Coexistence with Buttons**: Verify double-click does not affect button clicks
3. **State Switching**: Verify maximize/restore state switches correctly

## Error Handling

### Edge Cases

1. **Rapid Double-click**: Use standard double-click interval (300ms)
2. **Multiple Monitors**: Window maximize behavior should correctly handle multiple monitor environments
3. **Full-screen Application**: Double-click in full-screen state should be handled correctly

### Error Scenarios

1. **API Unavailable**: If `electronAPI` is unavailable, fail silently
2. **Window State Abnormal**: If window state is abnormal, maintain current state

## Security Considerations

1. **IPC Security**: Use existing secure IPC channels
2. **Permission Control**: No additional permissions required
3. **Input Validation**: Validate the legality of event targets

## Performance Considerations

1. **Event Handling**: Uses React's event delegation, minimal performance overhead
2. **DOM Queries**: `closest('button')` query scope is limited, good performance
3. **Memory Usage**: No additional state storage required

## Compatibility

### Browser Compatibility

- Electron renderer process, supports all modern browser features
- No polyfill or fallback solutions needed

### Platform Compatibility

- **Windows**: Fully supported
- **macOS**: Fully supported
- **Linux**: Theoretically supported, but not tested

## Future Enhancements

### Possible Improvements

1. **Animation Effects**: Add transition animations for maximize/restore
2. **State Indication**: Display current window state in the title bar
3. **Custom Behavior**: Allow users to configure double-click behavior

### Extension Points

1. **Other Components**: Can reuse double-click detection logic
2. **Keyboard Shortcuts**: Can add keyboard shortcut support
3. **Gesture Support**: Can add touchpad gesture support

## References

### Existing Code

1. `src/renderer/src/components/layout/title-bar.tsx` - Existing title bar component
2. `src/preload/api/window.api.ts` - Window control API
3. `src/main/ipc/menu.ipc.ts` - Main process window control logic

### Documentation

1. Electron BrowserWindow documentation
2. React event handling documentation
3. CSS `webkitAppRegion` documentation