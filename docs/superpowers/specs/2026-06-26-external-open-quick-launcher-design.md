# External Open Quick Launcher Design

## Overview

Add a title-bar quick launcher for opening the current file, folder, or workspace root in common external tools. The launcher should support macOS and Windows naming, detect installed editors automatically, provide a default action, and expose appearance settings so users can choose their preferred default app or hide the title-bar entry entirely.

The visual direction follows the Codex app reference: a compact pill-style default app button with a neighboring dropdown for quick alternatives.

## Goals

1. Add a title-bar entry near the search area for quickly opening the active target externally.
2. Resolve the active target as the selected file or folder first, then fall back to the current workspace root.
3. Support common editors: VS Code, Zed, and Cursor.
4. Support system file managers: Finder on macOS and File Explorer on Windows.
5. Support terminal opening for the target folder, or the parent folder when the target is a file.
6. Automatically detect available apps for the current platform.
7. Let users choose a default external app in Settings > Appearance.
8. Let users hide or show the title-bar quick launcher with an Appearance setting.
9. Preserve existing file-tree context menu behavior and existing new-window behavior.

## Non-Goals

1. Do not add Linux-specific app detection in this iteration.
2. Do not support custom user-defined commands yet.
3. Do not install or download missing editors.
4. Do not expose raw shell execution to the renderer process.
5. Do not change how Markdown files open inside Keep Notes.

## Recommended Approach

Use main-process IPC for app detection and external opening, while the renderer only renders available options and passes a typed app id plus a target path. Persist the default app and title-bar visibility in the existing editor appearance store.

This matches the repository architecture: filesystem and OS integration stay in the main process, preload exposes narrow safe wrappers, and renderer components consume typed APIs.

## Alternatives Considered

### Renderer-defined menu with main-process open execution

The renderer could hard-code all menu items and ask the main process to open a selected app.

Pros:
- Smaller renderer iteration.
- Fewer app-list IPC calls.

Cons:
- The UI would show apps that are not installed.
- Settings could persist unavailable defaults.
- Platform naming would be duplicated in renderer code.

### System file manager only

Only support Finder/File Explorer and terminal.

Pros:
- Smallest implementation.
- Lowest platform risk.

Cons:
- Does not meet the requested VS Code, Zed, and Cursor workflows.
- Does not match the Codex-style default editor quick action.

## Architecture

### Shared Types

Add external app types in `src/shared/types/index.ts`.

```ts
export type ExternalOpenAppId =
  | "vscode"
  | "zed"
  | "cursor"
  | "terminal"
  | "file-manager";

export type ExternalOpenAppKind = "editor" | "terminal" | "file-manager";

export interface ExternalOpenApp {
  id: ExternalOpenAppId;
  label: string;
  kind: ExternalOpenAppKind;
  available: boolean;
}
```

The `label` is platform-aware:

| App ID | macOS label | Windows label |
|--------|-------------|---------------|
| `vscode` | VS Code | VS Code |
| `zed` | Zed | Zed |
| `cursor` | Cursor | Cursor |
| `terminal` | Terminal | Terminal |
| `file-manager` | Finder | File Explorer |

### IPC Channels

Add file IPC channels:

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `file:list-external-open-apps` | invoke | Return available external apps for the current platform |
| `file:open-with-external-app` | invoke | Open a target path with a selected external app |

### Main Process

Add focused helpers in `src/main/file.ts` rather than creating renderer-side command logic.

Responsibilities:

1. Detect known editors on macOS and Windows.
2. Always include the platform file manager as available.
3. Include terminal when the platform supports a known open command.
4. Open editor targets directly.
5. Open terminal targets as directories: selected folder directly, or file parent directory.
6. Open file-manager targets by revealing files or opening folders.
7. Return `false` on unsupported or failed app launches without throwing to the renderer.

Detection should be conservative:

1. macOS checks known `.app` paths under `/Applications` and the user Applications folder.
2. Windows checks common install paths and PATH command availability where practical.
3. Zed can be hidden on Windows unless detected, because Windows availability may vary by installation.

### Preload API

Extend `src/preload/api/file.api.ts`:

```ts
listExternalOpenApps(): Promise<ExternalOpenApp[]>
openWithExternalApp(targetPath: string, appId: ExternalOpenAppId): Promise<boolean>
```

Update `src/renderer/src/types/electron.d.ts` accordingly.

### Renderer Store

Extend `EditorAppearance` in `src/renderer/src/store/editor.store.ts`:

```ts
defaultExternalOpenApp: ExternalOpenAppId;
showTitleBarQuickLauncher: boolean;
```

Defaults:

1. `defaultExternalOpenApp`: `vscode`
2. `showTitleBarQuickLauncher`: `true`

Existing persistence migration already merges missing appearance fields from defaults, so older local storage should pick up the new values automatically.

## UI Design

### Title Bar

Add a quick launcher in `src/renderer/src/components/layout/title-bar.tsx`, positioned near the right side of the centered search field.

Behavior:

1. Hide the launcher when `appearance.showTitleBarQuickLauncher` is `false`.
2. Load available apps from `window.electronAPI.listExternalOpenApps()`.
3. Resolve the effective default app:
   - use `appearance.defaultExternalOpenApp` if it is available;
   - otherwise use the first available editor;
   - otherwise use the platform file manager.
4. Main button opens the active target with the effective default app.
5. Dropdown lists all available apps and opens the active target with the selected app.
6. The active target is `selectedKey` if set; otherwise `treeRoot.key`.
7. Disable the launcher when there is no selected path and no workspace root.

Visual style:

1. Compact pill button, matching the title bar token colors.
2. Use icon-only or icon-plus-short label depending on available width.
3. Use a separate chevron segment for the dropdown.
4. Keep button hit targets stable at title-bar height.

### Settings > Appearance

Add two settings:

1. **Default Open Target**
   - Chinese UI label: `默认打开目标`
   - Description: `默认打开文件和文件夹的位置`
   - Control: dropdown populated from detected available apps.

2. **Title Bar Quick Launcher**
   - Chinese UI label: `标题栏快速打开器`
   - Description: `在标题栏显示默认应用与快捷下拉入口`
   - Control: switch.

When no external apps are detected beyond the system file manager, the dropdown still offers Finder/File Explorer so the setting remains usable.

## Error Handling

1. If app detection fails, return the system file manager as the safe fallback.
2. If a saved default is unavailable, use the effective fallback at render time without mutating user settings immediately.
3. If opening fails, keep the UI stable and log the failure in the main process.
4. If there is no target path, disable the title-bar launcher.

## Security Considerations

1. Renderer never receives raw shell command access.
2. Renderer sends only a typed `ExternalOpenAppId` and a filesystem path selected inside the app.
3. Main process maps app ids to controlled command templates.
4. Avoid command string interpolation where possible; prefer Electron `shell` APIs and `child_process.spawn` with argument arrays.

## Testing Strategy

### Unit Tests

1. Verify app-list normalization returns platform labels.
2. Verify target resolution uses selected path before workspace root.
3. Verify unavailable saved defaults fall back to a detected editor or file manager.
4. Verify preload calls the new IPC channels with correct arguments.
5. Verify appearance migration preserves defaults for new settings.

### Integration Checks

1. Run `pnpm typecheck`.
2. Run `pnpm lint`.
3. Run `pnpm build`.

Manual smoke checks should cover:

1. macOS: VS Code, Zed, Cursor, Terminal, and Finder options when installed.
2. Windows: VS Code, Cursor, Terminal, and File Explorer labels.
3. Turning off the quick launcher hides the title-bar entry.
4. Selecting a default app changes the main quick-launch action.

## Files Expected To Change

1. `src/shared/types/index.ts`
2. `src/shared/constants/ipc-channels.ts`
3. `src/main/file.ts`
4. `src/main/ipc/file.ipc.ts`
5. `src/preload/api/file.api.ts`
6. `src/renderer/src/types/electron.d.ts`
7. `src/renderer/src/store/editor.store.ts`
8. `src/renderer/src/features/editor/lib/editor-state-migration.ts` if stricter normalization is needed
9. `src/renderer/src/components/layout/title-bar.tsx`
10. `src/renderer/src/features/settings/components/settings-modal.tsx`
11. Focused tests near the changed modules

## Future Enhancements

1. Add custom commands for advanced users.
2. Add Linux detection for common desktop environments.
3. Add per-workspace default open app.
4. Add file-tree context menu submenus that reuse the same app list.
