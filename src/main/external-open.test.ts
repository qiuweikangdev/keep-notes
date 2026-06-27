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

  it("opens Windows terminal with cwd instead of reparsing the target path through cmd start", async () => {
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
    expect(spawn).toHaveBeenCalledWith("cmd.exe", ["/k"], {
      cwd: "C:/workspace/notes",
      detached: true,
      stdio: "ignore",
    });

    const [, args] = spawn.mock.calls[0];
    expect(args).not.toContain("/c");
    expect(args).not.toContain("start");
    expect(args).not.toContain(targetPath);
  });

  it("opens a detected Windows editor exe directly with target path as an argument", async () => {
    const previousLocalAppData = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = "C:/Users/Alice/AppData/Local";

    try {
      const spawn = vi.fn(() => ({ unref: vi.fn() }));
      const targetPath = "C:/workspace/notes/daily&today.md";
      const codePath =
        "C:/Users/Alice/AppData/Local/Programs/Microsoft VS Code/Code.exe";

      const result = await openWithExternalApp(targetPath, "vscode", {
        platform: "win32",
        spawn,
        pathExists: async (path) => path === codePath,
        commandExists: async () => false,
        stat: async () =>
          ({ isDirectory: () => false, isFile: () => true }) as never,
      });

      expect(result).toBe(true);
      expect(spawn).toHaveBeenCalledWith(codePath, [targetPath], {
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
});
