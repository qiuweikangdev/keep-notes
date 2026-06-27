# External Open Quick Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a configurable title-bar quick launcher that opens the selected file/folder or workspace root in detected external apps.

**Architecture:** Keep OS integration in the main process behind typed IPC. Renderer code loads the detected app list, resolves the active target from tree selection/root state, and persists visibility/default-app preferences in the existing editor appearance store.

**Tech Stack:** Electron main/preload IPC, React 19, TypeScript, Zustand persistence, Radix dropdown primitives, Vitest.

---

## File Structure

- Create: `src/main/external-open.ts`
  - Detects supported external apps.
  - Resolves file versus directory targets.
  - Opens targets through controlled app-specific launchers.
- Create: `src/main/external-open.test.ts`
  - Unit tests app-label normalization, fallback app lists, target directory resolution, and launch command selection through injected dependencies.
- Create: `src/renderer/src/features/external-open/external-open-options.ts`
  - Renderer-only helpers for resolving effective default app and active target path.
- Create: `src/renderer/src/features/external-open/external-open-options.test.ts`
  - Unit tests selected-key/root fallback and default-app fallback behavior.
- Modify: `src/shared/types/index.ts`
  - Adds shared external-open app types.
- Modify: `src/shared/constants/ipc-channels.ts`
  - Adds two file IPC channel names.
- Modify: `src/main/file.ts`
  - Re-exports narrow wrappers from `external-open.ts`.
- Modify: `src/main/ipc/file.ipc.ts`
  - Registers the new IPC handlers.
- Modify: `src/preload/api/file.api.ts`
  - Exposes safe renderer wrappers.
- Modify: `src/preload/api/file.api.test.ts`
  - Verifies the new preload IPC calls.
- Modify: `src/renderer/src/types/electron.d.ts`
  - Adds new `ElectronAPI` methods.
- Modify: `src/renderer/src/store/editor.store.ts`
  - Adds `defaultExternalOpenApp` and `showTitleBarQuickLauncher`.
- Modify: `src/renderer/src/features/editor/lib/editor-state-migration.ts`
  - Normalizes persisted default app ids defensively.
- Modify: `src/renderer/src/components/layout/title-bar.tsx`
  - Adds the title-bar quick launcher UI and target resolution.
- Modify: `src/renderer/src/components/layout/title-bar.test.tsx`
  - Verifies visibility toggle and click target selection.
- Modify: `src/renderer/src/features/settings/components/settings-modal.tsx`
  - Adds default app dropdown and quick launcher switch in Appearance.
- Modify: `src/renderer/src/features/settings/components/settings-modal.test.tsx`
  - Verifies the new settings render and update appearance state.

## Task 1: Shared Contract And Preload API

**Files:**
- Modify: `src/shared/types/index.ts`
- Modify: `src/shared/constants/ipc-channels.ts`
- Modify: `src/preload/api/file.api.ts`
- Modify: `src/preload/api/file.api.test.ts`
- Modify: `src/renderer/src/types/electron.d.ts`

- [ ] **Step 1: Write failing preload tests**

Add these tests to `src/preload/api/file.api.test.ts`:

```ts
it("invokes the list-external-open-apps channel", async () => {
  const { fileApi } = await import("./file.api");

  await fileApi.listExternalOpenApps();

  expect(invoke).toHaveBeenCalledWith("file:list-external-open-apps");
});

it("invokes the open-with-external-app channel", async () => {
  const { fileApi } = await import("./file.api");

  await fileApi.openWithExternalApp("/workspace/notes/daily.md", "vscode");

  expect(invoke).toHaveBeenCalledWith(
    "file:open-with-external-app",
    "/workspace/notes/daily.md",
    "vscode",
  );
});
```

- [ ] **Step 2: Run the focused preload test to verify RED**

Run:

```bash
pnpm test src/preload/api/file.api.test.ts
```

Expected: FAIL because `listExternalOpenApps` and `openWithExternalApp` do not exist.

- [ ] **Step 3: Add shared external-open types**

Append to `src/shared/types/index.ts` near the other app/window types:

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

- [ ] **Step 4: Add IPC channel constants**

Add these fields under `IPC_CHANNELS.FILE` in `src/shared/constants/ipc-channels.ts`:

```ts
LIST_EXTERNAL_OPEN_APPS: "file:list-external-open-apps",
OPEN_WITH_EXTERNAL_APP: "file:open-with-external-app",
```

- [ ] **Step 5: Add preload wrappers**

Update imports in `src/preload/api/file.api.ts`:

```ts
import type {
  ApiResponse,
  ExternalOpenApp,
  ExternalOpenAppId,
  TreeInfo,
  TreeNode,
} from "../../shared/types";
```

Add methods inside `fileApi`:

```ts
listExternalOpenApps: (): Promise<ExternalOpenApp[]> => {
  return ipcRenderer.invoke(IPC_CHANNELS.FILE.LIST_EXTERNAL_OPEN_APPS);
},

openWithExternalApp: (
  targetPath: string,
  appId: ExternalOpenAppId,
): Promise<boolean> => {
  return ipcRenderer.invoke(
    IPC_CHANNELS.FILE.OPEN_WITH_EXTERNAL_APP,
    targetPath,
    appId,
  );
},
```

- [ ] **Step 6: Update renderer Electron types**

Update imports in `src/renderer/src/types/electron.d.ts`:

```ts
ExternalOpenApp,
ExternalOpenAppId,
```

Add methods to `ElectronAPI`:

```ts
listExternalOpenApps: () => Promise<ExternalOpenApp[]>;
openWithExternalApp: (
  targetPath: string,
  appId: ExternalOpenAppId,
) => Promise<boolean>;
```

- [ ] **Step 7: Run the focused preload test to verify GREEN**

Run:

```bash
pnpm test src/preload/api/file.api.test.ts
```

Expected: PASS.

## Task 2: Main-Process App Detection And Opening

**Files:**
- Create: `src/main/external-open.ts`
- Create: `src/main/external-open.test.ts`
- Modify: `src/main/file.ts`
- Modify: `src/main/ipc/file.ipc.ts`

- [ ] **Step 1: Write failing main-process tests**

Create `src/main/external-open.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { ExternalOpenAppId } from "../shared/types";
import {
  getDirectoryTargetForExternalApp,
  listExternalOpenApps,
  openWithExternalApp,
} from "./external-open";

describe("external open apps", () => {
  it("uses Finder as the macOS file-manager label", async () => {
    const apps = await listExternalOpenApps({
      platform: "darwin",
      pathExists: async (path) => path === "/Applications/Visual Studio Code.app",
    });

    expect(apps).toEqual([
      { id: "vscode", label: "VS Code", kind: "editor", available: true },
      { id: "terminal", label: "Terminal", kind: "terminal", available: true },
      { id: "file-manager", label: "Finder", kind: "file-manager", available: true },
    ]);
  });

  it("uses File Explorer as the Windows file-manager label", async () => {
    const apps = await listExternalOpenApps({
      platform: "win32",
      pathExists: async () => false,
      commandExists: async (command) => command === "code",
    });

    expect(apps).toEqual([
      { id: "vscode", label: "VS Code", kind: "editor", available: true },
      { id: "terminal", label: "Terminal", kind: "terminal", available: true },
      { id: "file-manager", label: "File Explorer", kind: "file-manager", available: true },
    ]);
  });

  it("opens terminal at the parent directory for file targets", async () => {
    const stat = vi.fn(async () => ({ isDirectory: () => false, isFile: () => true }));

    await expect(
      getDirectoryTargetForExternalApp("/workspace/notes/daily.md", stat as never),
    ).resolves.toBe("/workspace/notes");
  });

  it("rejects unsupported app ids without spawning a command", async () => {
    const spawn = vi.fn();

    const result = await openWithExternalApp(
      "/workspace",
      "unknown" as ExternalOpenAppId,
      {
        platform: "darwin",
        spawn,
        pathExists: async () => false,
        commandExists: async () => false,
        stat: async () => ({ isDirectory: () => true, isFile: () => false }) as never,
      },
    );

    expect(result).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the focused main-process test to verify RED**

Run:

```bash
pnpm test src/main/external-open.test.ts
```

Expected: FAIL because `src/main/external-open.ts` does not exist.

- [ ] **Step 3: Implement `src/main/external-open.ts`**

Create `src/main/external-open.ts` with these exports and injected dependencies:

```ts
import { spawn as nodeSpawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { shell } from "electron";
import type { ExternalOpenApp, ExternalOpenAppId } from "../shared/types";

type Platform = NodeJS.Platform;
type SpawnFn = typeof nodeSpawn;
type StatFn = typeof fs.promises.stat;

interface ExternalOpenDeps {
  platform?: Platform;
  pathExists?: (targetPath: string) => Promise<boolean>;
  commandExists?: (command: string) => Promise<boolean>;
  spawn?: SpawnFn;
  stat?: StatFn;
}

const editorLabels: Record<Exclude<ExternalOpenAppId, "terminal" | "file-manager">, string> = {
  vscode: "VS Code",
  zed: "Zed",
  cursor: "Cursor",
};

function createSpawnPromise(spawn: SpawnFn, command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", () => resolve(false));
    child.unref();
    resolve(true);
  });
}

async function defaultPathExists(targetPath: string): Promise<boolean> {
  return fs.promises
    .access(targetPath)
    .then(() => true)
    .catch(() => false);
}

async function defaultCommandExists(command: string, platform = process.platform): Promise<boolean> {
  const checker = platform === "win32" ? "where" : "command";
  const args = platform === "win32" ? [command] : ["-v", command];
  return new Promise((resolve) => {
    const child = nodeSpawn(checker, args, { stdio: "ignore", shell: platform !== "win32" });
    child.once("error", () => resolve(false));
    child.once("exit", (code) => resolve(code === 0));
  });
}

function macAppPaths(appName: string): string[] {
  return [
    `/Applications/${appName}.app`,
    path.join(os.homedir(), "Applications", `${appName}.app`),
  ];
}

function windowsAppPaths(appId: ExternalOpenAppId): string[] {
  const localAppData = process.env.LOCALAPPDATA;
  const programFiles = process.env.ProgramFiles;
  const programFilesX86 = process.env["ProgramFiles(x86)"];

  const candidates: string[] = [];
  if (appId === "vscode") {
    if (localAppData) candidates.push(path.join(localAppData, "Programs", "Microsoft VS Code", "Code.exe"));
    if (programFiles) candidates.push(path.join(programFiles, "Microsoft VS Code", "Code.exe"));
    if (programFilesX86) candidates.push(path.join(programFilesX86, "Microsoft VS Code", "Code.exe"));
  }
  if (appId === "cursor") {
    if (localAppData) candidates.push(path.join(localAppData, "Programs", "cursor", "Cursor.exe"));
    if (programFiles) candidates.push(path.join(programFiles, "Cursor", "Cursor.exe"));
  }
  if (appId === "zed") {
    if (localAppData) candidates.push(path.join(localAppData, "Programs", "Zed", "Zed.exe"));
    if (programFiles) candidates.push(path.join(programFiles, "Zed", "Zed.exe"));
  }
  return candidates;
}

async function hasAnyPath(paths: string[], pathExists: (targetPath: string) => Promise<boolean>): Promise<boolean> {
  for (const item of paths) {
    if (await pathExists(item)) return true;
  }
  return false;
}

export async function listExternalOpenApps(deps: ExternalOpenDeps = {}): Promise<ExternalOpenApp[]> {
  const platform = deps.platform ?? process.platform;
  const pathExists = deps.pathExists ?? defaultPathExists;
  const commandExists = deps.commandExists ?? ((command) => defaultCommandExists(command, platform));
  const apps: ExternalOpenApp[] = [];

  if (platform === "darwin") {
    const macEditors: Array<[ExternalOpenAppId, string]> = [
      ["vscode", "Visual Studio Code"],
      ["zed", "Zed"],
      ["cursor", "Cursor"],
    ];
    for (const [id, appName] of macEditors) {
      if (await hasAnyPath(macAppPaths(appName), pathExists)) {
        apps.push({ id, label: editorLabels[id], kind: "editor", available: true });
      }
    }
    apps.push({ id: "terminal", label: "Terminal", kind: "terminal", available: true });
    apps.push({ id: "file-manager", label: "Finder", kind: "file-manager", available: true });
    return apps;
  }

  if (platform === "win32") {
    const windowsEditors: Array<[ExternalOpenAppId, string]> = [
      ["vscode", "code"],
      ["zed", "zed"],
      ["cursor", "cursor"],
    ];
    for (const [id, command] of windowsEditors) {
      if ((await hasAnyPath(windowsAppPaths(id), pathExists)) || (await commandExists(command))) {
        apps.push({ id, label: editorLabels[id], kind: "editor", available: true });
      }
    }
    apps.push({ id: "terminal", label: "Terminal", kind: "terminal", available: true });
    apps.push({ id: "file-manager", label: "File Explorer", kind: "file-manager", available: true });
    return apps;
  }

  return [{ id: "file-manager", label: "File Manager", kind: "file-manager", available: true }];
}

export async function getDirectoryTargetForExternalApp(
  targetPath: string,
  stat: StatFn = fs.promises.stat,
): Promise<string> {
  const stats = await stat(targetPath);
  return stats.isDirectory() ? targetPath : path.dirname(targetPath);
}

async function revealInFileManager(targetPath: string, stat: StatFn): Promise<boolean> {
  const stats = await stat(targetPath);
  if (stats.isDirectory()) {
    return shell.openPath(targetPath).then((message) => message === "");
  }
  shell.showItemInFolder(targetPath);
  return true;
}

export async function openWithExternalApp(
  targetPath: string,
  appId: ExternalOpenAppId,
  deps: ExternalOpenDeps = {},
): Promise<boolean> {
  const platform = deps.platform ?? process.platform;
  const spawn = deps.spawn ?? nodeSpawn;
  const stat = deps.stat ?? fs.promises.stat;

  try {
    if (appId === "file-manager") return revealInFileManager(targetPath, stat);

    if (platform === "darwin") {
      if (appId === "terminal") {
        const directory = await getDirectoryTargetForExternalApp(targetPath, stat);
        return createSpawnPromise(spawn, "open", ["-a", "Terminal", directory]);
      }
      const appName =
        appId === "vscode" ? "Visual Studio Code" : appId === "zed" ? "Zed" : appId === "cursor" ? "Cursor" : null;
      return appName ? createSpawnPromise(spawn, "open", ["-a", appName, targetPath]) : false;
    }

    if (platform === "win32") {
      if (appId === "terminal") {
        const directory = await getDirectoryTargetForExternalApp(targetPath, stat);
        return createSpawnPromise(spawn, "cmd.exe", ["/c", "start", "", "cmd.exe", "/K", "cd", "/d", directory]);
      }
      const command = appId === "vscode" ? "code" : appId === "zed" ? "zed" : appId === "cursor" ? "cursor" : null;
      return command ? createSpawnPromise(spawn, command, [targetPath]) : false;
    }

    return false;
  } catch (error) {
    console.error("Error while opening external app:", error);
    return false;
  }
}
```

- [ ] **Step 4: Export wrappers from `src/main/file.ts`**

Add imports:

```ts
import {
  listExternalOpenApps,
  openWithExternalApp,
} from "./external-open";
import type { ExternalOpenAppId } from "../shared/types";
```

Add wrapper exports near other file actions:

```ts
export function listAvailableExternalOpenApps() {
  return listExternalOpenApps();
}

export function openPathWithExternalApp(
  targetPath: string,
  appId: ExternalOpenAppId,
) {
  return openWithExternalApp(targetPath, appId);
}
```

- [ ] **Step 5: Register file IPC handlers**

Update imports in `src/main/ipc/file.ipc.ts`:

```ts
listAvailableExternalOpenApps,
openPathWithExternalApp,
```

Add IPC handlers:

```ts
ipcMain.handle(IPC_CHANNELS.FILE.LIST_EXTERNAL_OPEN_APPS, async () => {
  return listAvailableExternalOpenApps();
});

ipcMain.handle(
  IPC_CHANNELS.FILE.OPEN_WITH_EXTERNAL_APP,
  async (_, targetPath: string, appId: ExternalOpenAppId) => {
    return openPathWithExternalApp(targetPath, appId);
  },
);
```

Also import `ExternalOpenAppId` from `../../shared/types`.

- [ ] **Step 6: Run the focused main-process test to verify GREEN**

Run:

```bash
pnpm test src/main/external-open.test.ts
```

Expected: PASS.

## Task 3: Appearance State And Renderer Helpers

**Files:**
- Modify: `src/renderer/src/store/editor.store.ts`
- Modify: `src/renderer/src/features/editor/lib/editor-state-migration.ts`
- Create: `src/renderer/src/features/external-open/external-open-options.ts`
- Create: `src/renderer/src/features/external-open/external-open-options.test.ts`

- [ ] **Step 1: Write failing renderer helper tests**

Create `src/renderer/src/features/external-open/external-open-options.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ExternalOpenApp } from "@shared/types";
import {
  resolveExternalOpenTargetPath,
  resolveEffectiveExternalOpenApp,
} from "./external-open-options";

const apps: ExternalOpenApp[] = [
  { id: "vscode", label: "VS Code", kind: "editor", available: true },
  { id: "terminal", label: "Terminal", kind: "terminal", available: true },
  { id: "file-manager", label: "Finder", kind: "file-manager", available: true },
];

describe("external open options", () => {
  it("uses selected path before workspace root", () => {
    expect(resolveExternalOpenTargetPath("/workspace/a.md", "/workspace")).toBe("/workspace/a.md");
  });

  it("falls back to workspace root when no path is selected", () => {
    expect(resolveExternalOpenTargetPath(null, "/workspace")).toBe("/workspace");
  });

  it("uses the saved default when it is available", () => {
    expect(resolveEffectiveExternalOpenApp(apps, "terminal")?.id).toBe("terminal");
  });

  it("falls back to the first editor before file manager", () => {
    expect(resolveEffectiveExternalOpenApp(apps, "cursor")?.id).toBe("vscode");
  });
});
```

- [ ] **Step 2: Run the focused renderer helper test to verify RED**

Run:

```bash
pnpm test src/renderer/src/features/external-open/external-open-options.test.ts
```

Expected: FAIL because the helper file does not exist.

- [ ] **Step 3: Implement renderer helper functions**

Create `src/renderer/src/features/external-open/external-open-options.ts`:

```ts
import type { ExternalOpenApp, ExternalOpenAppId } from "@shared/types";

export function resolveExternalOpenTargetPath(
  selectedPath: string | null | undefined,
  rootPath: string | null | undefined,
): string | null {
  return selectedPath || rootPath || null;
}

export function resolveEffectiveExternalOpenApp(
  apps: ExternalOpenApp[],
  preferredAppId: ExternalOpenAppId,
): ExternalOpenApp | null {
  const availableApps = apps.filter((app) => app.available);
  return (
    availableApps.find((app) => app.id === preferredAppId) ??
    availableApps.find((app) => app.kind === "editor") ??
    availableApps.find((app) => app.id === "file-manager") ??
    availableApps[0] ??
    null
  );
}
```

- [ ] **Step 4: Extend editor appearance state**

Update imports in `src/renderer/src/store/editor.store.ts`:

```ts
import type { ExternalOpenAppId } from "@shared/types";
```

Add fields to `EditorAppearance`:

```ts
defaultExternalOpenApp: ExternalOpenAppId;
showTitleBarQuickLauncher: boolean;
```

Add defaults:

```ts
defaultExternalOpenApp: "vscode",
showTitleBarQuickLauncher: true,
```

- [ ] **Step 5: Normalize persisted default app ids**

Update `normalizePersistedAppearance` in `src/renderer/src/features/editor/lib/editor-state-migration.ts` by adding this after the padding migration:

```ts
const defaultExternalOpenApp = (defaults as { defaultExternalOpenApp?: unknown })
  .defaultExternalOpenApp;
const currentExternalOpenApp = (normalized as { defaultExternalOpenApp?: unknown })
  .defaultExternalOpenApp;
if (
  typeof defaultExternalOpenApp === "string" &&
  !["vscode", "zed", "cursor", "terminal", "file-manager"].includes(
    String(currentExternalOpenApp),
  )
) {
  (normalized as { defaultExternalOpenApp: string }).defaultExternalOpenApp =
    defaultExternalOpenApp;
}
```

- [ ] **Step 6: Run the focused renderer helper test to verify GREEN**

Run:

```bash
pnpm test src/renderer/src/features/external-open/external-open-options.test.ts
```

Expected: PASS.

## Task 4: Title-Bar Quick Launcher UI

**Files:**
- Modify: `src/renderer/src/components/layout/title-bar.tsx`
- Modify: `src/renderer/src/components/layout/title-bar.test.tsx`

- [ ] **Step 1: Write failing title-bar tests**

Update `src/renderer/src/components/layout/title-bar.test.tsx` mocks:

1. Include `defaultExternalOpenApp: "vscode"` and `showTitleBarQuickLauncher: true` in mocked appearance.
2. Include `selectedKey` in mocked tree store.
3. Include `listExternalOpenApps` and `openWithExternalApp` on `window.electronAPI`.

Add tests:

```ts
let mockAppearance = {
  showFileHistoryNavigation: true,
  defaultExternalOpenApp: "vscode",
  showTitleBarQuickLauncher: true,
};

it("opens the selected path with the effective default external app", async () => {
  const openWithExternalApp = vi.fn().mockResolvedValue(true);

  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: {
      getPlatform: () => "darwin",
      maximizeWindow: vi.fn(),
      listExternalOpenApps: vi.fn(async () => [
        { id: "vscode", label: "VS Code", kind: "editor", available: true },
        { id: "file-manager", label: "Finder", kind: "file-manager", available: true },
      ]),
      openWithExternalApp,
    },
  });

  const { findByRole } = render(
    <TitleBar collapsed={false} onToggleCollapse={vi.fn()} />,
  );

  fireEvent.click(await findByRole("button", { name: /使用 VS Code 打开/ }));

  expect(openWithExternalApp).toHaveBeenCalledWith(
    "/workspace/selected.md",
    "vscode",
  );
});

it("does not render the quick launcher when disabled", () => {
  mockAppearance = {
    ...mockAppearance,
    showTitleBarQuickLauncher: false,
  };

  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    value: {
      getPlatform: () => "darwin",
      maximizeWindow: vi.fn(),
      listExternalOpenApps: vi.fn(async () => [
        { id: "vscode", label: "VS Code", kind: "editor", available: true },
        { id: "file-manager", label: "Finder", kind: "file-manager", available: true },
      ]),
      openWithExternalApp: vi.fn(),
    },
  });

  const { queryByRole } = render(
    <TitleBar collapsed={false} onToggleCollapse={vi.fn()} />,
  );

  expect(queryByRole("button", { name: /使用 VS Code 打开/ })).toBeNull();
});
```

Update the `useEditorStore` mock to return `mockAppearance` from its `appearance` field so both tests can change the same mock state.

- [ ] **Step 2: Run the title-bar test to verify RED**

Run:

```bash
pnpm test src/renderer/src/components/layout/title-bar.test.tsx
```

Expected: FAIL because the quick launcher UI does not exist.

- [ ] **Step 3: Add title-bar imports**

Update icon imports in `title-bar.tsx`:

```ts
ChevronDown,
Code2,
FolderOpen,
Terminal,
```

Import Radix dropdown and helpers:

```ts
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import type { ExternalOpenApp, ExternalOpenAppId } from "@shared/types";
import {
  resolveEffectiveExternalOpenApp,
  resolveExternalOpenTargetPath,
} from "@/features/external-open/external-open-options";
```

- [ ] **Step 4: Add local icon and label helpers**

Add above `TitleBar`:

```tsx
function getExternalOpenIcon(appId: ExternalOpenAppId) {
  if (appId === "terminal") return Terminal;
  if (appId === "file-manager") return FolderOpen;
  return Code2;
}
```

- [ ] **Step 5: Load external app options and resolve target**

Inside `TitleBar`, extend tree store usage:

```ts
const { treeRoot, selectedKey } = useTreeStore();
```

Add state:

```ts
const [externalOpenApps, setExternalOpenApps] = useState<ExternalOpenApp[]>([]);
```

Add effect:

```ts
useEffect(() => {
  let isMounted = true;
  void window.electronAPI.listExternalOpenApps().then((apps) => {
    if (isMounted) setExternalOpenApps(apps);
  });
  return () => {
    isMounted = false;
  };
}, []);
```

Add derived values:

```ts
const externalOpenTargetPath = resolveExternalOpenTargetPath(
  selectedKey,
  treeRoot?.key,
);
const effectiveExternalOpenApp = resolveEffectiveExternalOpenApp(
  externalOpenApps,
  appearance.defaultExternalOpenApp,
);
```

Add handler:

```ts
const handleOpenWithExternalApp = useCallback(
  (appId: ExternalOpenAppId) => {
    if (!externalOpenTargetPath) return;
    void window.electronAPI.openWithExternalApp(externalOpenTargetPath, appId);
  },
  [externalOpenTargetPath],
);
```

- [ ] **Step 6: Render the quick launcher near the search field**

Inside the center search container, after the search button, render:

```tsx
{appearance.showTitleBarQuickLauncher && effectiveExternalOpenApp ? (
  <div className="ml-2 flex h-[30px] flex-shrink-0 items-center overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
    <button
      type="button"
      disabled={!externalOpenTargetPath}
      aria-label={`使用 ${effectiveExternalOpenApp.label} 打开`}
      title={`使用 ${effectiveExternalOpenApp.label} 打开`}
      onClick={() => handleOpenWithExternalApp(effectiveExternalOpenApp.id)}
      className="flex h-full items-center gap-1.5 px-2.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{ color: "var(--text-primary)" }}
    >
      {(() => {
        const Icon = getExternalOpenIcon(effectiveExternalOpenApp.id);
        return <Icon className="h-3.5 w-3.5" />;
      })()}
      <span className="max-w-[72px] truncate">{effectiveExternalOpenApp.label}</span>
    </button>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={!externalOpenTargetPath}
          aria-label="选择打开应用"
          title="选择打开应用"
          className="flex h-full w-7 items-center justify-center border-l border-[var(--border-color)] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          style={{ color: "var(--text-muted)" }}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-[9999] min-w-[190px] rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-1 shadow-lg"
        >
          {externalOpenApps
            .filter((app) => app.available)
            .map((app) => {
              const Icon = getExternalOpenIcon(app.id);
              return (
                <DropdownMenu.Item
                  key={app.id}
                  className="flex cursor-default select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-[var(--hover-bg)]"
                  style={{ color: "var(--text-primary)" }}
                  onClick={() => handleOpenWithExternalApp(app.id)}
                >
                  <Icon className="h-4 w-4" />
                  <span>{app.label}</span>
                </DropdownMenu.Item>
              );
            })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  </div>
) : null}
```

- [ ] **Step 7: Run the title-bar test to verify GREEN**

Run:

```bash
pnpm test src/renderer/src/components/layout/title-bar.test.tsx
```

Expected: PASS.

## Task 5: Settings Appearance Controls

**Files:**
- Modify: `src/renderer/src/features/settings/components/settings-modal.tsx`
- Modify: `src/renderer/src/features/settings/components/settings-modal.test.tsx`

- [ ] **Step 1: Write failing settings tests**

Update the `electronAPI` mock in `settings-modal.test.tsx`:

```ts
listExternalOpenApps: vi.fn(async () => [
  { id: "vscode", label: "VS Code", kind: "editor", available: true },
  { id: "terminal", label: "Terminal", kind: "terminal", available: true },
  { id: "file-manager", label: "Finder", kind: "file-manager", available: true },
]),
```

Add tests under a new `describe("SettingsModal external open appearance settings", ...)`:

```ts
it("shows the default open target dropdown in the appearance tab", async () => {
  render(<SettingsModal />);

  expect(await screen.findByText("默认打开目标")).toBeInTheDocument();
  expect(screen.getByText("默认打开文件和文件夹的位置")).toBeInTheDocument();
  expect(screen.getByDisplayValue("vscode")).toBeInTheDocument();
});

it("shows the title bar quick launcher switch in the appearance tab", async () => {
  render(<SettingsModal />);

  expect(await screen.findByText("标题栏快速打开器")).toBeInTheDocument();
  expect(screen.getByText("在标题栏显示默认应用与快捷下拉入口")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the settings test to verify RED**

Run:

```bash
pnpm test src/renderer/src/features/settings/components/settings-modal.test.tsx
```

Expected: FAIL because the controls do not exist.

- [ ] **Step 3: Add external app state to `SettingsModal`**

Update imports:

```ts
import type { AppInfo, AppUpdateState, AppUpdateStatus, ExternalOpenApp, ExternalOpenAppId } from "@shared/types";
```

Add state:

```ts
const [externalOpenApps, setExternalOpenApps] = useState<ExternalOpenApp[]>([]);
```

In the existing `useEffect` for `isSettingsOpen`, include `window.electronAPI.listExternalOpenApps()` in the `Promise.all` and set `externalOpenApps`.

- [ ] **Step 4: Render the default app setting**

In the appearance tab, after the theme section, add:

```tsx
<div style={{ borderBottom: "1px solid var(--border-color)" }}>
  <SettingRow
    label="默认打开目标"
    description="默认打开文件和文件夹的位置"
  >
    <select
      value={appearance.defaultExternalOpenApp}
      onChange={(event) =>
        setAppearance({
          defaultExternalOpenApp: event.target.value as ExternalOpenAppId,
        })
      }
      className="h-9 min-w-[180px] rounded-lg px-3 text-sm outline-none"
      style={{
        backgroundColor: "var(--bg-tertiary)",
        border: "1px solid var(--border-color)",
        color: "var(--text-primary)",
      }}
    >
      {externalOpenApps
        .filter((app) => app.available)
        .map((app) => (
          <option key={app.id} value={app.id}>
            {app.label}
          </option>
        ))}
    </select>
  </SettingRow>
</div>
```

- [ ] **Step 5: Render the visibility switch**

Add after the default app setting:

```tsx
<div style={{ borderBottom: "1px solid var(--border-color)" }}>
  <SettingRow
    label="标题栏快速打开器"
    description="在标题栏显示默认应用与快捷下拉入口"
  >
    <Switch
      checked={appearance.showTitleBarQuickLauncher}
      onCheckedChange={(checked) =>
        setAppearance({ showTitleBarQuickLauncher: checked })
      }
    />
  </SettingRow>
</div>
```

- [ ] **Step 6: Run the settings test to verify GREEN**

Run:

```bash
pnpm test src/renderer/src/features/settings/components/settings-modal.test.tsx
```

Expected: PASS.

## Task 6: Full Verification

**Files:**
- Verify all changed files from Tasks 1-5.

- [ ] **Step 1: Run all focused tests**

Run:

```bash
pnpm test src/preload/api/file.api.test.ts src/main/external-open.test.ts src/renderer/src/features/external-open/external-open-options.test.ts src/renderer/src/components/layout/title-bar.test.tsx src/renderer/src/features/settings/components/settings-modal.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript verification**

Run:

```bash
pnpm typecheck
```

Expected: exit code 0.

- [ ] **Step 3: Run lint verification**

Run:

```bash
pnpm lint
```

Expected: exit code 0.

- [ ] **Step 4: Run build verification**

Run:

```bash
pnpm build
```

Expected: exit code 0.

- [ ] **Step 5: Inspect git diff before completion**

Run:

```bash
git diff -- src/shared/types/index.ts src/shared/constants/ipc-channels.ts src/main/external-open.ts src/main/file.ts src/main/ipc/file.ipc.ts src/preload/api/file.api.ts src/renderer/src/types/electron.d.ts src/renderer/src/store/editor.store.ts src/renderer/src/features/editor/lib/editor-state-migration.ts src/renderer/src/features/external-open/external-open-options.ts src/renderer/src/components/layout/title-bar.tsx src/renderer/src/features/settings/components/settings-modal.tsx
```

Expected: diff only contains the external open quick launcher feature and no unrelated refactors.
