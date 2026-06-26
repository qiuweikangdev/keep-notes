import { spawn as nodeSpawn } from "node:child_process";
import type { SpawnOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExternalOpenApp, ExternalOpenAppId } from "../shared/types";

type Platform = NodeJS.Platform;
type StatResult = Pick<fs.Stats, "isDirectory" | "isFile">;
type SpawnResult = { unref?: () => void } | void;
type SpawnCommand = (
  command: string,
  args: string[],
  options?: SpawnOptions,
) => SpawnResult;
type PathExists = (targetPath: string) => Promise<boolean>;
type CommandExists = (command: string) => Promise<boolean>;
type StatPath = (targetPath: string) => Promise<StatResult>;
type ExternalShell = {
  openPath: (targetPath: string) => Promise<string>;
  showItemInFolder: (targetPath: string) => void;
};

interface ExternalOpenDeps {
  platform?: Platform;
  spawn?: SpawnCommand;
  pathExists?: PathExists;
  commandExists?: CommandExists;
  stat?: StatPath;
  shell?: ExternalShell;
}

interface EditorDefinition {
  id: Extract<ExternalOpenAppId, "vscode" | "zed" | "cursor">;
  label: string;
  appName: string;
  command: string;
  windowsPaths: string[];
}

const EDITORS: EditorDefinition[] = [
  {
    id: "vscode",
    label: "VS Code",
    appName: "Visual Studio Code",
    command: "code",
    windowsPaths: [
      "Programs/Microsoft VS Code/Code.exe",
      "Microsoft VS Code/Code.exe",
    ],
  },
  {
    id: "zed",
    label: "Zed",
    appName: "Zed",
    command: "zed",
    windowsPaths: ["Programs/Zed/Zed.exe", "Zed/Zed.exe"],
  },
  {
    id: "cursor",
    label: "Cursor",
    appName: "Cursor",
    command: "cursor",
    windowsPaths: ["Programs/Cursor/Cursor.exe", "Cursor/Cursor.exe"],
  },
];

function defaultPathExists(targetPath: string): Promise<boolean> {
  return fs.promises
    .access(targetPath)
    .then(() => true)
    .catch(() => false);
}

function defaultCommandExists(
  command: string,
  platform: Platform,
): Promise<boolean> {
  const checker = platform === "win32" ? "where.exe" : "which";

  return new Promise((resolve) => {
    const child = nodeSpawn(checker, [command], { stdio: "ignore" });

    child.once("error", () => resolve(false));
    child.once("close", (code) => resolve(code === 0));
  });
}

function resolveDeps(deps?: ExternalOpenDeps) {
  const platform = deps?.platform ?? process.platform;
  const hasInjectedDeps = deps !== undefined;

  return {
    platform,
    spawn: deps?.spawn ?? nodeSpawn,
    pathExists: deps?.pathExists ?? defaultPathExists,
    commandExists:
      deps?.commandExists ??
      (hasInjectedDeps
        ? async () => false
        : (command: string) => defaultCommandExists(command, platform)),
    stat: deps?.stat ?? fs.promises.stat,
    shell: deps?.shell,
  };
}

function getMacAppPaths(appName: string): string[] {
  return [
    path.join("/Applications", `${appName}.app`),
    path.join(os.homedir(), "Applications", `${appName}.app`),
  ];
}

function getWindowsEditorPaths(editor: EditorDefinition): string[] {
  const roots = [
    process.env.LOCALAPPDATA,
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
  ].filter((root): root is string => Boolean(root));

  return roots.flatMap((root) =>
    editor.windowsPaths.map((editorPath) => path.join(root, editorPath)),
  );
}

async function isMacEditorAvailable(
  editor: EditorDefinition,
  deps: ReturnType<typeof resolveDeps>,
): Promise<boolean> {
  for (const appPath of getMacAppPaths(editor.appName)) {
    if (await deps.pathExists(appPath)) return true;
  }

  return deps.commandExists(editor.command);
}

async function isWindowsEditorAvailable(
  editor: EditorDefinition,
  deps: ReturnType<typeof resolveDeps>,
): Promise<boolean> {
  for (const editorPath of getWindowsEditorPaths(editor)) {
    if (await deps.pathExists(editorPath)) return true;
  }

  return deps.commandExists(editor.command);
}

export async function listExternalOpenApps(
  deps?: ExternalOpenDeps,
): Promise<ExternalOpenApp[]> {
  const resolvedDeps = resolveDeps(deps);

  if (!["darwin", "win32"].includes(resolvedDeps.platform)) {
    return [];
  }

  const apps: ExternalOpenApp[] = [];

  for (const editor of EDITORS) {
    const available =
      resolvedDeps.platform === "darwin"
        ? await isMacEditorAvailable(editor, resolvedDeps)
        : await isWindowsEditorAvailable(editor, resolvedDeps);

    if (available) {
      apps.push({
        id: editor.id,
        label: editor.label,
        kind: "editor",
        available: true,
      });
    }
  }

  apps.push({
    id: "terminal",
    label: "Terminal",
    kind: "terminal",
    available: true,
  });
  apps.push({
    id: "file-manager",
    label: resolvedDeps.platform === "darwin" ? "Finder" : "File Explorer",
    kind: "file-manager",
    available: true,
  });

  return apps;
}

export async function getDirectoryTargetForExternalApp(
  targetPath: string,
  stat: StatPath = fs.promises.stat,
): Promise<string> {
  try {
    const stats = await stat(targetPath);

    // 终端只能可靠地打开目录；文件目标统一转换为其父目录。
    if (stats.isDirectory()) return targetPath;
  } catch {
    return path.dirname(targetPath);
  }

  return path.dirname(targetPath);
}

async function getShell(shell?: ExternalShell): Promise<ExternalShell> {
  if (shell) return shell;

  const electron = await import("electron");
  return electron.shell;
}

function spawnDetached(
  spawn: SpawnCommand,
  command: string,
  args: string[],
): boolean {
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });

    child?.unref?.();
    return true;
  } catch (error) {
    console.error("Failed to open external app:", error);
    return false;
  }
}

function openMacApp(
  spawn: SpawnCommand,
  appName: string,
  targetPath: string,
): boolean {
  return spawnDetached(spawn, "open", ["-a", appName, targetPath]);
}

function openWindowsCommand(
  spawn: SpawnCommand,
  command: string,
  args: string[],
): boolean {
  return spawnDetached(spawn, "cmd.exe", [
    "/d",
    "/s",
    "/c",
    "start",
    '""',
    command,
    ...args,
  ]);
}

async function getWindowsEditorCommand(
  editor: EditorDefinition,
  deps: ReturnType<typeof resolveDeps>,
): Promise<string | null> {
  for (const editorPath of getWindowsEditorPaths(editor)) {
    if (await deps.pathExists(editorPath)) return editorPath;
  }

  if (await deps.commandExists(editor.command)) return editor.command;

  return null;
}

async function openEditor(
  targetPath: string,
  editor: EditorDefinition,
  deps: ReturnType<typeof resolveDeps>,
): Promise<boolean> {
  if (deps.platform === "darwin") {
    return openMacApp(deps.spawn, editor.appName, targetPath);
  }

  if (deps.platform === "win32") {
    const command = await getWindowsEditorCommand(editor, deps);
    if (!command) return false;

    return path.isAbsolute(command)
      ? spawnDetached(deps.spawn, command, [targetPath])
      : openWindowsCommand(deps.spawn, command, [targetPath]);
  }

  return false;
}

async function openTerminal(
  targetPath: string,
  deps: ReturnType<typeof resolveDeps>,
): Promise<boolean> {
  const directoryPath = await getDirectoryTargetForExternalApp(
    targetPath,
    deps.stat,
  );

  if (deps.platform === "darwin") {
    return openMacApp(deps.spawn, "Terminal", directoryPath);
  }

  if (deps.platform === "win32") {
    return openWindowsCommand(deps.spawn, "cmd.exe", [
      "/k",
      "cd",
      "/d",
      directoryPath,
    ]);
  }

  return false;
}

async function openFileManager(
  targetPath: string,
  deps: ReturnType<typeof resolveDeps>,
): Promise<boolean> {
  const shell = await getShell(deps.shell);

  try {
    const stats = await deps.stat(targetPath);

    // 文件管理器打开目录，文件则只定位到所在位置，避免把 Markdown 当作可执行目标。
    if (stats.isDirectory()) {
      const errorMessage = await shell.openPath(targetPath);
      return errorMessage.length === 0;
    }

    shell.showItemInFolder(targetPath);
    return true;
  } catch (error) {
    console.error("Failed to open file manager:", error);
    return false;
  }
}

export async function openWithExternalApp(
  targetPath: string,
  appId: ExternalOpenAppId,
  deps?: ExternalOpenDeps,
): Promise<boolean> {
  const resolvedDeps = resolveDeps(deps);
  const editor = EDITORS.find((app) => app.id === appId);

  if (editor) {
    return openEditor(targetPath, editor, resolvedDeps);
  }

  if (appId === "terminal") {
    return openTerminal(targetPath, resolvedDeps);
  }

  if (appId === "file-manager") {
    return openFileManager(targetPath, resolvedDeps);
  }

  return false;
}
