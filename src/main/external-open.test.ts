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
});
