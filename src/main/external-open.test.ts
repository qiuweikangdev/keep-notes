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
