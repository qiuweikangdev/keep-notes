import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ExternalOpenAppId } from "../shared/types";
import {
  getDirectoryTargetForExternalApp,
  listExternalOpenApps,
  openWithExternalApp,
} from "./external-open";

describe("external open apps", () => {
  const normalizeWindowsPath = (targetPath: string) =>
    path.win32.normalize(targetPath).toLowerCase();

  it("uses Finder as the macOS file-manager label", async () => {
    const apps = await listExternalOpenApps({
      platform: "darwin",
      pathExists: async (path) =>
        path === "/Applications/Visual Studio Code.app",
    });

    expect(apps).toEqual([
      { id: "vscode", label: "VS Code", kind: "editor", available: true },
      { id: "terminal", label: "Terminal", kind: "terminal", available: true },
      {
        id: "file-manager",
        label: "Finder",
        kind: "file-manager",
        available: true,
      },
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
      {
        id: "file-manager",
        label: "File Explorer",
        kind: "file-manager",
        available: true,
      },
    ]);
  });

  it("detects Warp as a terminal app when installed on macOS", async () => {
    const apps = await listExternalOpenApps({
      platform: "darwin",
      pathExists: async (path) => path === "/Applications/Warp.app",
      getFileIconDataUrl: async (path) =>
        path === "/Applications/Warp.app" ? "data:image/png;base64,warp" : null,
    });

    expect(apps).toEqual([
      {
        id: "warp",
        label: "Warp",
        kind: "terminal",
        available: true,
        iconDataUrl: "data:image/png;base64,warp",
      },
      { id: "terminal", label: "Terminal", kind: "terminal", available: true },
      {
        id: "file-manager",
        label: "Finder",
        kind: "file-manager",
        available: true,
      },
    ]);
  });

  it("detects Warp inside a macOS Applications subfolder", async () => {
    const applicationRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "keep-notes-applications-"),
    );

    try {
      const warpAppPath = path.join(applicationRoot, "tools-dev", "Warp.app");
      await fs.promises.mkdir(warpAppPath, { recursive: true });

      const apps = await listExternalOpenApps({
        platform: "darwin",
        pathExists: async () => false,
        macApplicationRoots: [applicationRoot],
        getFileIconDataUrl: async (path) =>
          path === warpAppPath ? "data:image/png;base64,warp" : null,
      });

      expect(apps).toEqual([
        {
          id: "warp",
          label: "Warp",
          kind: "terminal",
          available: true,
          iconDataUrl: "data:image/png;base64,warp",
        },
        {
          id: "terminal",
          label: "Terminal",
          kind: "terminal",
          available: true,
        },
        {
          id: "file-manager",
          label: "Finder",
          kind: "file-manager",
          available: true,
        },
      ]);
    } finally {
      await fs.promises.rm(applicationRoot, { recursive: true, force: true });
    }
  });

  it("opens terminal at the parent directory for file targets", async () => {
    const stat = vi.fn(async () => ({
      isDirectory: () => false,
      isFile: () => true,
    }));

    await expect(
      getDirectoryTargetForExternalApp(
        "/workspace/notes/daily.md",
        stat as never,
      ),
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
        stat: async () =>
          ({ isDirectory: () => true, isFile: () => false }) as never,
      },
    );

    expect(result).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("opens Warp at the parent directory for file targets on macOS", async () => {
    const spawn = vi.fn(() => ({ unref: vi.fn() }));

    const result = await openWithExternalApp(
      "/workspace/notes/daily.md",
      "warp",
      {
        platform: "darwin",
        spawn,
        pathExists: async (path) => path === "/Applications/Warp.app",
        stat: async () =>
          ({ isDirectory: () => false, isFile: () => true }) as never,
      },
    );

    expect(result).toBe(true);
    expect(spawn).toHaveBeenCalledWith(
      "open",
      ["-a", "/Applications/Warp.app", "/workspace/notes"],
      {
        detached: true,
        stdio: "ignore",
      },
    );
  });

  it("opens Windows terminal through start so a visible window is created", async () => {
    const spawn = vi.fn(() => ({ unref: vi.fn() }));
    const targetPath = "C:/workspace/notes/daily&today.md";

    const result = await openWithExternalApp(targetPath, "terminal", {
      platform: "win32",
      spawn,
      pathExists: async () => false,
      commandExists: async () => false,
      stat: async () =>
        ({ isDirectory: () => false, isFile: () => true }) as never,
    });

    expect(result).toBe(true);
    expect(spawn).toHaveBeenCalledWith(
      "cmd.exe",
      ["/c", "start", '""', "cmd.exe", "/k"],
      {
        cwd: "C:/workspace/notes",
        detached: true,
        stdio: "ignore",
        windowsVerbatimArguments: true,
      },
    );

    const [, args] = spawn.mock.calls[0];
    expect(args).not.toContain(targetPath);
  });

  it("opens Windows terminal through wt when Windows Terminal is available", async () => {
    const spawn = vi.fn(() => ({ unref: vi.fn() }));
    const targetPath = "C:/workspace/notes/daily&today.md";
    const terminalPath =
      "C:/Users/Alice/AppData/Local/Microsoft/WindowsApps/wt.exe";

    const result = await openWithExternalApp(targetPath, "terminal", {
      platform: "win32",
      spawn,
      pathExists: async () => false,
      resolveCommandPath: async (command) =>
        command === "wt" ? terminalPath : null,
      commandExists: async () => false,
      stat: async () =>
        ({ isDirectory: () => false, isFile: () => true }) as never,
    });

    expect(result).toBe(true);
    expect(spawn).toHaveBeenCalledWith(
      terminalPath,
      ["-d", "C:/workspace/notes"],
      {
        cwd: "C:/workspace/notes",
        detached: true,
        stdio: "ignore",
      },
    );
  });

  it("opens a detected Windows editor exe directly with target path as an argument", async () => {
    const previousLocalAppData = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = "C:/Users/Alice/AppData/Local";

    try {
      const spawn = vi.fn(() => ({ unref: vi.fn() }));
      const targetPath = "C:/workspace/notes/daily&today.md";
      const codePath =
        "C:/Users/Alice/AppData/Local/Programs/Microsoft VS Code/Code.exe";
      const normalizedCodePath = path.win32.normalize(codePath);

      const result = await openWithExternalApp(targetPath, "vscode", {
        platform: "win32",
        spawn,
        pathExists: async (path) =>
          normalizeWindowsPath(path) === normalizeWindowsPath(codePath),
        commandExists: async () => false,
        stat: async () =>
          ({ isDirectory: () => false, isFile: () => true }) as never,
      });

      expect(result).toBe(true);
      expect(spawn).toHaveBeenCalledWith(normalizedCodePath, [targetPath], {
        detached: true,
        stdio: "ignore",
      });

      const [command, args] = spawn.mock.calls[0];
      expect(command).not.toBe("cmd.exe");
      expect(args).not.toContain("/c");
      expect(args).not.toContain("start");
    } finally {
      process.env.LOCALAPPDATA = previousLocalAppData;
    }
  });

  it("uses real Windows executable icons when PATH resolves to CLI shims", async () => {
    const commandPaths = new Map([
      ["code", "D:/tools/Microsoft VS Code/bin/code.cmd"],
      ["zed", "D:/tools/Zed/bin/zed"],
      ["cursor", "D:/tools/cursor/resources/app/bin/cursor.cmd"],
      ["warp", "D:/tools/Warp/bin/warp.cmd"],
    ]);
    const executablePaths = new Map([
      ["vscode", "D:/tools/Microsoft VS Code/Code.exe"],
      ["zed", "D:/tools/Zed/bin/Zed.exe"],
      ["cursor", "D:/tools/cursor/Cursor.exe"],
      ["warp", "D:/tools/Warp/warp.exe"],
    ]);
    const executablePathSet = new Set(
      [...executablePaths.values()].map(normalizeWindowsPath),
    );
    const iconRequests: string[] = [];

    const apps = await listExternalOpenApps({
      platform: "win32",
      pathExists: async (targetPath) =>
        executablePathSet.has(normalizeWindowsPath(targetPath)),
      resolveCommandPath: async (command) => commandPaths.get(command) ?? null,
      commandExists: async () => false,
      getFileIconDataUrl: async (targetPath) => {
        const normalizedPath = normalizeWindowsPath(targetPath);
        iconRequests.push(normalizedPath);
        if (!executablePathSet.has(normalizedPath)) return null;

        return `data:image/png;base64,${path.win32.basename(targetPath)}`;
      },
    });

    expect(apps).toEqual([
      {
        id: "vscode",
        label: "VS Code",
        kind: "editor",
        available: true,
        iconDataUrl: "data:image/png;base64,Code.exe",
      },
      {
        id: "zed",
        label: "Zed",
        kind: "editor",
        available: true,
        iconDataUrl: "data:image/png;base64,Zed.exe",
      },
      {
        id: "cursor",
        label: "Cursor",
        kind: "editor",
        available: true,
        iconDataUrl: "data:image/png;base64,Cursor.exe",
      },
      {
        id: "warp",
        label: "Warp",
        kind: "terminal",
        available: true,
        iconDataUrl: "data:image/png;base64,warp.exe",
      },
      { id: "terminal", label: "Terminal", kind: "terminal", available: true },
      {
        id: "file-manager",
        label: "File Explorer",
        kind: "file-manager",
        available: true,
      },
    ]);
    expect(iconRequests).toEqual(
      expect.arrayContaining([...executablePathSet]),
    );
    for (const commandPath of commandPaths.values()) {
      expect(iconRequests).not.toContain(normalizeWindowsPath(commandPath));
    }
  });

  it.each([
    {
      appId: "vscode" as const,
      command: "code",
      commandPath: "D:/tools/Microsoft VS Code/bin/code.cmd",
      executablePath: path.win32.normalize(
        "D:/tools/Microsoft VS Code/Code.exe",
      ),
      targetPath: "C:/workspace/notes/daily.md",
      expectedArgs: ["C:/workspace/notes/daily.md"],
      expectedOptions: {},
    },
    {
      appId: "cursor" as const,
      command: "cursor",
      commandPath: "D:/tools/cursor/resources/app/bin/cursor.cmd",
      executablePath: path.win32.normalize("D:/tools/cursor/Cursor.exe"),
      targetPath: "C:/workspace/notes/daily.md",
      expectedArgs: ["C:/workspace/notes/daily.md"],
      expectedOptions: {},
    },
    {
      appId: "zed" as const,
      command: "zed",
      commandPath: "D:/tools/Zed/bin/zed",
      executablePath: path.win32.normalize("D:/tools/Zed/bin/Zed.exe"),
      targetPath: "C:/workspace/notes/daily.md",
      expectedArgs: ["C:/workspace/notes/daily.md"],
      expectedOptions: {},
    },
    {
      appId: "warp" as const,
      command: "warp",
      commandPath: "D:/tools/Warp/bin/warp.cmd",
      executablePath: path.win32.normalize("D:/tools/Warp/warp.exe"),
      targetPath: "C:/workspace/notes/daily.md",
      expectedArgs: [],
      expectedOptions: { cwd: "C:/workspace/notes" },
    },
  ])(
    "opens $appId through the real Windows executable discovered from its CLI shim",
    async ({
      appId,
      command,
      commandPath,
      executablePath,
      targetPath,
      expectedArgs,
      expectedOptions,
    }) => {
      const spawn = vi.fn(() => ({ unref: vi.fn() }));
      const normalizedExecutablePath = normalizeWindowsPath(executablePath);

      const result = await openWithExternalApp(targetPath, appId, {
        platform: "win32",
        spawn,
        pathExists: async (targetPath) =>
          normalizeWindowsPath(targetPath) === normalizedExecutablePath,
        resolveCommandPath: async (candidateCommand) =>
          candidateCommand === command ? commandPath : null,
        commandExists: async () => false,
        stat: async () =>
          ({ isDirectory: () => false, isFile: () => true }) as never,
      });

      expect(result).toBe(true);
      expect(spawn).toHaveBeenCalledWith(executablePath, expectedArgs, {
        ...expectedOptions,
        detached: true,
        stdio: "ignore",
      });
    },
  );
});
