import { spawn as nodeSpawn } from "node:child_process";
import type { SpawnOptions } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExternalOpenApp, ExternalOpenAppId } from "../shared/types";

type Platform = NodeJS.Platform;
type StatResult = Pick<fs.Stats, "isDirectory" | "isFile">;
type SpawnResult = {
  unref?: () => void;
  once?: (event: "error" | "spawn", listener: () => void) => unknown;
} | void;
type SpawnCommand = (
  command: string,
  args: string[],
  options?: SpawnOptions,
) => SpawnResult;
type PathExists = (targetPath: string) => Promise<boolean>;
type CommandExists = (command: string) => Promise<boolean>;
type ResolveCommandPath = (command: string) => Promise<string | null>;
type StatPath = (targetPath: string) => Promise<StatResult>;
type GetFileIconDataUrl = (targetPath: string) => Promise<string | null>;
type ExternalShell = {
  openPath: (targetPath: string) => Promise<string>;
  showItemInFolder: (targetPath: string) => void;
};

interface ExternalOpenDeps {
  platform?: Platform;
  spawn?: SpawnCommand;
  pathExists?: PathExists;
  commandExists?: CommandExists;
  resolveCommandPath?: ResolveCommandPath;
  stat?: StatPath;
  getFileIconDataUrl?: GetFileIconDataUrl;
  macApplicationRoots?: string[];
  shell?: ExternalShell;
}

interface EditorDefinition {
  id: Extract<ExternalOpenAppId, "vscode" | "zed" | "cursor">;
  label: string;
  appName: string;
  command: string;
  windowsPaths: string[];
  windowsExecutableNames: string[];
}

interface TerminalAppDefinition {
  id: Extract<ExternalOpenAppId, "warp">;
  label: string;
  appName: string;
  command: string;
  windowsPaths: string[];
  windowsExecutableNames: string[];
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
    windowsExecutableNames: ["Code.exe"],
  },
  {
    id: "zed",
    label: "Zed",
    appName: "Zed",
    command: "zed",
    windowsPaths: ["Programs/Zed/Zed.exe", "Zed/Zed.exe"],
    windowsExecutableNames: ["Zed.exe"],
  },
  {
    id: "cursor",
    label: "Cursor",
    appName: "Cursor",
    command: "cursor",
    windowsPaths: ["Programs/Cursor/Cursor.exe", "Cursor/Cursor.exe"],
    windowsExecutableNames: ["Cursor.exe"],
  },
];

const WARP: TerminalAppDefinition = {
  id: "warp",
  label: "Warp",
  appName: "Warp",
  command: "warp",
  windowsPaths: ["Programs/Warp/Warp.exe", "Warp/Warp.exe"],
  windowsExecutableNames: ["warp.exe"],
};

function defaultPathExists(targetPath: string): Promise<boolean> {
  return fs.promises
    .access(targetPath)
    .then(() => true)
    .catch(() => false);
}

const defaultSpawn: SpawnCommand = (command, args, options) =>
  options === undefined
    ? nodeSpawn(command, args)
    : nodeSpawn(command, args, options);

function defaultResolveCommandPath(
  command: string,
  platform: Platform,
): Promise<string | null> {
  const checker = platform === "win32" ? "where.exe" : "which";

  return new Promise((resolve) => {
    const child = nodeSpawn(checker, [command], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";

    child.stdout?.on("data", (chunk) => {
      output += String(chunk);
    });

    child.once("error", () => resolve(null));
    child.once("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }

      const commandPath = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      resolve(commandPath ?? null);
    });
  });
}

async function defaultGetFileIconDataUrl(
  targetPath: string,
): Promise<string | null> {
  try {
    const bundleIconDataUrl = await getMacBundleIconDataUrl(targetPath);
    if (bundleIconDataUrl) return bundleIconDataUrl;

    const { app } = await import("electron");
    const icon = await app.getFileIcon(targetPath, { size: "normal" });
    if (icon.isEmpty()) return null;

    const iconDataUrl = icon.resize({ width: 32, height: 32 }).toDataURL();
    return isUsableIconDataUrl(iconDataUrl) ? iconDataUrl : null;
  } catch (error) {
    console.error("Failed to load external app icon:", error);
    return null;
  }
}

function isUsableIconDataUrl(iconDataUrl: string): boolean {
  return iconDataUrl.startsWith("data:image/") && iconDataUrl.length > 128;
}

function runCommandForOutput(
  command: string,
  args: string[],
): Promise<string | null> {
  return new Promise((resolve) => {
    const child = nodeSpawn(command, args, {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";

    child.stdout?.on("data", (chunk) => {
      output += String(chunk);
    });

    child.once("error", () => resolve(null));
    child.once("close", (code) => {
      resolve(code === 0 ? output.trim() || null : null);
    });
  });
}

async function getMacBundleIconDataUrl(
  appPath: string,
): Promise<string | null> {
  if (!appPath.endsWith(".app")) return null;

  try {
    const resourcesPath = path.join(appPath, "Contents", "Resources");
    const iconFiles = (await fs.promises.readdir(resourcesPath)).filter(
      (file) => file.toLowerCase().endsWith(".icns"),
    );

    const preferredIconFile = await getMacBundlePreferredIconFile(
      appPath,
      iconFiles,
    );
    if (!preferredIconFile) return null;

    return convertIcnsToPngDataUrl(path.join(resourcesPath, preferredIconFile));
  } catch {
    return null;
  }
}

async function getMacBundlePreferredIconFile(
  appPath: string,
  iconFiles: string[],
): Promise<string | null> {
  const bundleIconFile = await getMacBundleIconFile(appPath);
  if (bundleIconFile) {
    const normalizedBundleIconFile = ensureIcnsExtension(bundleIconFile);
    const matchedIconFile = iconFiles.find(
      (file) => file.toLowerCase() === normalizedBundleIconFile.toLowerCase(),
    );
    if (matchedIconFile) return matchedIconFile;
  }

  return selectPreferredIconFile(appPath, iconFiles);
}

async function getMacBundleIconFile(appPath: string): Promise<string | null> {
  const infoPlistPath = path.join(appPath, "Contents", "Info.plist");
  const iconFile = await runCommandForOutput("/usr/libexec/PlistBuddy", [
    "-c",
    "Print :CFBundleIconFile",
    infoPlistPath,
  ]);

  return iconFile || null;
}

function ensureIcnsExtension(iconFile: string): string {
  return iconFile.toLowerCase().endsWith(".icns")
    ? iconFile
    : `${iconFile}.icns`;
}

async function convertIcnsToPngDataUrl(
  iconPath: string,
): Promise<string | null> {
  const tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "keep-notes-icon-"),
  );
  const outputPath = path.join(tempDir, "icon.png");

  try {
    await new Promise<void>((resolve, reject) => {
      const child = nodeSpawn(
        "sips",
        [
          "-z",
          "32",
          "32",
          "-s",
          "format",
          "png",
          iconPath,
          "--out",
          outputPath,
        ],
        { stdio: "ignore" },
      );

      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`sips exited with code ${code}`));
      });
    });

    const imageBuffer = await fs.promises.readFile(outputPath);
    if (imageBuffer.byteLength === 0) return null;

    return `data:image/png;base64,${imageBuffer.toString("base64")}`;
  } catch {
    return null;
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

function selectPreferredIconFile(
  appPath: string,
  iconFiles: string[],
): string | null {
  if (iconFiles.length === 0) return null;

  const normalizedAppName = path
    .basename(appPath, ".app")
    .replace(/\s+/g, "")
    .toLowerCase();
  const preferredIconFile =
    iconFiles.find((file) =>
      file.replace(/\s+/g, "").toLowerCase().includes(normalizedAppName),
    ) ??
    iconFiles.find((file) => !file.toLowerCase().includes("document")) ??
    iconFiles[0];

  return preferredIconFile ?? null;
}

function resolveDeps(deps?: ExternalOpenDeps) {
  const platform = deps?.platform ?? process.platform;
  const hasInjectedDeps = deps !== undefined;

  return {
    platform,
    spawn: deps?.spawn ?? defaultSpawn,
    pathExists: deps?.pathExists ?? defaultPathExists,
    resolveCommandPath:
      deps?.resolveCommandPath ??
      (hasInjectedDeps
        ? async () => null
        : (command: string) => defaultResolveCommandPath(command, platform)),
    commandExists:
      deps?.commandExists ??
      (hasInjectedDeps
        ? async () => false
        : async (command: string) =>
            Boolean(await defaultResolveCommandPath(command, platform))),
    stat: deps?.stat ?? fs.promises.stat,
    getFileIconDataUrl:
      deps?.getFileIconDataUrl ??
      (hasInjectedDeps ? async () => null : defaultGetFileIconDataUrl),
    macApplicationRoots:
      deps?.macApplicationRoots ?? getDefaultMacApplicationRoots(),
    allowFilesystemSearch:
      !hasInjectedDeps || deps?.macApplicationRoots !== undefined,
    shell: deps?.shell,
  };
}

function getMacAppPaths(appName: string): string[] {
  return [
    path.posix.join("/Applications", `${appName}.app`),
    path.posix.join(os.homedir(), "Applications", `${appName}.app`),
  ];
}

function getDefaultMacApplicationRoots(): string[] {
  return ["/Applications", path.join(os.homedir(), "Applications")];
}

async function resolveMacAppPath(
  appName: string,
  deps: ReturnType<typeof resolveDeps>,
): Promise<string | null> {
  const directAppPath = await resolveFirstExistingPath(
    getMacAppPaths(appName),
    deps.pathExists,
  );
  if (directAppPath) return directAppPath;

  if (!deps.allowFilesystemSearch) return null;

  return findMacAppInApplicationSubfolders(appName, deps.macApplicationRoots);
}

async function findMacAppInApplicationSubfolders(
  appName: string,
  applicationRoots: string[],
): Promise<string | null> {
  for (const applicationRoot of applicationRoots) {
    const entries = await fs.promises
      .readdir(applicationRoot, { withFileTypes: true })
      .catch(() => []);

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const candidatePath = path.join(
        applicationRoot,
        entry.name,
        `${appName}.app`,
      );
      if (await defaultPathExists(candidatePath)) return candidatePath;
    }
  }

  return null;
}

function getWindowsAppPaths(windowsPaths: string[]): string[] {
  const roots = [
    process.env.LOCALAPPDATA,
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
  ].filter((root): root is string => Boolean(root));

  return roots.flatMap((root) =>
    windowsPaths.map((appPath) => path.win32.join(root, appPath)),
  );
}

function cleanWindowsCommandPath(commandPath: string): string {
  return commandPath.trim().replace(/^"(.*)"$/, "$1");
}

async function resolveWindowsExecutableFromCommandPath(
  commandPath: string,
  executableNames: string[],
  pathExists: PathExists,
): Promise<string | null> {
  const normalizedCommandPath = cleanWindowsCommandPath(commandPath);
  const executableNameSet = new Set(
    executableNames.map((name) => name.toLowerCase()),
  );
  const commandFileName = path.win32
    .basename(normalizedCommandPath)
    .toLowerCase();

  if (
    executableNameSet.has(commandFileName) &&
    (await pathExists(normalizedCommandPath))
  ) {
    return normalizedCommandPath;
  }

  let currentDirectory = path.win32.dirname(normalizedCommandPath);

  // Windows 的 PATH 常指向 bin 下的 CLI shim；向上查找真实 exe，图标和启动都应使用应用本体。
  for (let depth = 0; depth < 6; depth += 1) {
    for (const executableName of executableNames) {
      const candidatePath = path.win32.join(currentDirectory, executableName);
      if (await pathExists(candidatePath)) return candidatePath;
    }

    const parentDirectory = path.win32.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) break;
    currentDirectory = parentDirectory;
  }

  return null;
}

async function resolveWindowsAppExecutablePath(
  windowsPaths: string[],
  executableNames: string[],
  command: string,
  deps: ReturnType<typeof resolveDeps>,
): Promise<string | null> {
  const directPath = await resolveFirstExistingPath(
    getWindowsAppPaths(windowsPaths),
    deps.pathExists,
  );
  if (directPath) return directPath;

  const commandPath = await deps.resolveCommandPath(command);
  if (!commandPath) return null;

  return resolveWindowsExecutableFromCommandPath(
    commandPath,
    executableNames,
    deps.pathExists,
  );
}

async function resolveFirstExistingPath(
  candidatePaths: string[],
  pathExists: PathExists,
): Promise<string | null> {
  for (const candidatePath of candidatePaths) {
    if (await pathExists(candidatePath)) return candidatePath;
  }

  return null;
}

function getParentDirectory(targetPath: string, platform: Platform): string {
  return platform === "win32"
    ? path.win32.dirname(targetPath)
    : path.dirname(targetPath);
}

function getMacFileManagerIconPath(): string {
  return "/System/Library/CoreServices/Finder.app";
}

function getMacTerminalIconPath(): string {
  return "/System/Applications/Utilities/Terminal.app";
}

function getWindowsFileManagerIconPath(): string {
  return path.join(process.env.WINDIR ?? "C:\\Windows", "explorer.exe");
}

function getWindowsTerminalIconPath(): string {
  return (
    process.env.ComSpec ??
    path.win32.join(
      process.env.SystemRoot ?? "C:\\Windows",
      "System32",
      "cmd.exe",
    )
  );
}

async function resolveDetectedAppPath(
  appName: string,
  command: string,
  windowsPaths: string[],
  deps: ReturnType<typeof resolveDeps>,
): Promise<string | null> {
  const appPath =
    deps.platform === "darwin"
      ? await resolveMacAppPath(appName, deps)
      : await resolveWindowsAppExecutablePath(
          windowsPaths,
          getWindowsExecutableNames(appName),
          command,
          deps,
        );

  if (appPath) return appPath;

  return deps.platform === "darwin" ? deps.resolveCommandPath(command) : null;
}

function getWindowsExecutableNames(appName: string): string[] {
  const editor = EDITORS.find((app) => app.appName === appName);
  if (editor) return editor.windowsExecutableNames;

  return appName === WARP.appName ? WARP.windowsExecutableNames : [];
}

async function isMacEditorAvailable(
  editor: EditorDefinition,
  deps: ReturnType<typeof resolveDeps>,
): Promise<boolean> {
  if (await resolveMacAppPath(editor.appName, deps)) return true;

  return (
    Boolean(await deps.resolveCommandPath(editor.command)) ||
    deps.commandExists(editor.command)
  );
}

async function isWindowsEditorAvailable(
  editor: EditorDefinition,
  deps: ReturnType<typeof resolveDeps>,
): Promise<boolean> {
  if (
    await resolveWindowsAppExecutablePath(
      editor.windowsPaths,
      editor.windowsExecutableNames,
      editor.command,
      deps,
    )
  )
    return true;

  return (
    Boolean(await deps.resolveCommandPath(editor.command)) ||
    deps.commandExists(editor.command)
  );
}

async function withIconDataUrl(
  app: ExternalOpenApp,
  iconPath: string | null,
  deps: ReturnType<typeof resolveDeps>,
): Promise<ExternalOpenApp> {
  if (!iconPath) return app;

  const iconDataUrl = await deps.getFileIconDataUrl(iconPath);
  return iconDataUrl ? { ...app, iconDataUrl } : app;
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
    const iconPath = await resolveDetectedAppPath(
      editor.appName,
      editor.command,
      editor.windowsPaths,
      resolvedDeps,
    );
    const available =
      Boolean(iconPath) ||
      (resolvedDeps.platform === "darwin"
        ? await isMacEditorAvailable(editor, resolvedDeps)
        : await isWindowsEditorAvailable(editor, resolvedDeps));

    if (available) {
      apps.push(
        await withIconDataUrl(
          {
            id: editor.id,
            label: editor.label,
            kind: "editor",
            available: true,
          },
          iconPath,
          resolvedDeps,
        ),
      );
    }
  }

  const warpIconPath = await resolveDetectedAppPath(
    WARP.appName,
    WARP.command,
    WARP.windowsPaths,
    resolvedDeps,
  );
  if (warpIconPath || (await resolvedDeps.commandExists(WARP.command))) {
    apps.push(
      await withIconDataUrl(
        {
          id: WARP.id,
          label: WARP.label,
          kind: "terminal",
          available: true,
        },
        warpIconPath,
        resolvedDeps,
      ),
    );
  }

  apps.push(
    await withIconDataUrl(
      {
        id: "terminal",
        label: "Terminal",
        kind: "terminal",
        available: true,
      },
      resolvedDeps.platform === "darwin"
        ? getMacTerminalIconPath()
        : getWindowsTerminalIconPath(),
      resolvedDeps,
    ),
  );
  apps.push(
    await withIconDataUrl(
      {
        id: "file-manager",
        label: resolvedDeps.platform === "darwin" ? "Finder" : "File Explorer",
        kind: "file-manager",
        available: true,
      },
      resolvedDeps.platform === "darwin"
        ? getMacFileManagerIconPath()
        : getWindowsFileManagerIconPath(),
      resolvedDeps,
    ),
  );

  return apps;
}

export async function getDirectoryTargetForExternalApp(
  targetPath: string,
  stat: StatPath = fs.promises.stat,
  platform: Platform = process.platform,
): Promise<string> {
  try {
    const stats = await stat(targetPath);

    // 终端只能可靠地打开目录；文件目标统一转换为其父目录。
    if (stats.isDirectory()) return targetPath;
  } catch {
    return getParentDirectory(targetPath, platform);
  }

  return getParentDirectory(targetPath, platform);
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
  options: SpawnOptions = {},
): Promise<boolean> {
  try {
    const child = spawn(command, args, {
      ...options,
      detached: true,
      stdio: "ignore",
    });

    child?.unref?.();

    if (typeof child?.once !== "function") return Promise.resolve(true);

    return new Promise((resolve) => {
      let settled = false;
      const settle = (result: boolean) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      // 监听同步启动后的首个结果，避免把 ENOENT 等启动失败乐观地报告为成功。
      child.once?.("error", () => settle(false));
      child.once?.("spawn", () => settle(true));
    });
  } catch (error) {
    console.error("Failed to open external app:", error);
    return Promise.resolve(false);
  }
}

function openMacApp(
  spawn: SpawnCommand,
  appName: string,
  targetPath: string,
): Promise<boolean> {
  return spawnDetached(spawn, "open", ["-a", appName, targetPath]);
}

async function getWindowsEditorCommand(
  editor: EditorDefinition,
  deps: ReturnType<typeof resolveDeps>,
): Promise<string | null> {
  const executablePath = await resolveWindowsAppExecutablePath(
    editor.windowsPaths,
    editor.windowsExecutableNames,
    editor.command,
    deps,
  );
  if (executablePath) return executablePath;

  const commandPath = await deps.resolveCommandPath(editor.command);
  if (commandPath) return cleanWindowsCommandPath(commandPath);

  if (await deps.commandExists(editor.command)) return editor.command;

  return null;
}

async function getWindowsTerminalAppCommand(
  terminalApp: TerminalAppDefinition,
  deps: ReturnType<typeof resolveDeps>,
): Promise<string | null> {
  const executablePath = await resolveWindowsAppExecutablePath(
    terminalApp.windowsPaths,
    terminalApp.windowsExecutableNames,
    terminalApp.command,
    deps,
  );
  if (executablePath) return executablePath;

  const commandPath = await deps.resolveCommandPath(terminalApp.command);
  if (commandPath) return cleanWindowsCommandPath(commandPath);

  if (await deps.commandExists(terminalApp.command)) return terminalApp.command;

  return null;
}

function shouldUseWindowsShell(command: string): boolean {
  const extension = path.win32.extname(command).toLowerCase();
  return extension === ".cmd" || extension === ".bat" || extension === "";
}

function openWindowsCommandPrompt(
  spawn: SpawnCommand,
  directoryPath: string,
): Promise<boolean> {
  return spawnDetached(
    spawn,
    "cmd.exe",
    ["/c", "start", '""', "cmd.exe", "/k"],
    {
      cwd: directoryPath,
      windowsVerbatimArguments: true,
    },
  );
}

async function openWindowsTerminal(
  directoryPath: string,
  deps: ReturnType<typeof resolveDeps>,
): Promise<boolean> {
  const windowsTerminalPath = await deps.resolveCommandPath("wt");
  if (windowsTerminalPath) {
    return spawnDetached(
      deps.spawn,
      cleanWindowsCommandPath(windowsTerminalPath),
      ["-d", directoryPath],
      { cwd: directoryPath },
    );
  }

  return openWindowsCommandPrompt(deps.spawn, directoryPath);
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

    return spawnDetached(
      deps.spawn,
      command,
      [targetPath],
      shouldUseWindowsShell(command) ? { shell: true } : {},
    );
  }

  return false;
}

async function openWarp(
  targetPath: string,
  deps: ReturnType<typeof resolveDeps>,
): Promise<boolean> {
  const directoryPath = await getDirectoryTargetForExternalApp(
    targetPath,
    deps.stat,
    deps.platform,
  );

  if (deps.platform === "darwin") {
    const warpAppPath = await resolveMacAppPath(WARP.appName, deps);
    return openMacApp(deps.spawn, warpAppPath ?? WARP.appName, directoryPath);
  }

  if (deps.platform === "win32") {
    const command = await getWindowsTerminalAppCommand(WARP, deps);
    if (!command) return false;

    return spawnDetached(deps.spawn, command, [], {
      cwd: directoryPath,
      ...(shouldUseWindowsShell(command) ? { shell: true } : {}),
    });
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
    deps.platform,
  );

  if (deps.platform === "darwin") {
    return openMacApp(deps.spawn, "Terminal", directoryPath);
  }

  if (deps.platform === "win32") {
    return openWindowsTerminal(directoryPath, deps);
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

  if (appId === "warp") {
    return openWarp(targetPath, resolvedDeps);
  }

  if (appId === "file-manager") {
    return openFileManager(targetPath, resolvedDeps);
  }

  return false;
}
