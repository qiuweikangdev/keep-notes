import { describe, expect, it, vi } from "vitest";
import { prepareMacUpdatePackage } from "./update-installer";

describe("prepareMacUpdatePackage", () => {
  it("extracts a downloaded macOS zip and repairs the app with a local ad-hoc signature", async () => {
    const appPath = "/tmp/keep-notes-update/Keep Notes.app";
    let verifyCount = 0;
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      if (command === "codesign" && args[0] === "--verify") {
        verifyCount += 1;
        if (verifyCount > 1) return;

        throw new Error(
          "code has no resources but signature indicates they must be present",
        );
      }
    });
    const writeFile = vi.fn();

    const result = await prepareMacUpdatePackage({
      downloadedFiles: ["/cache/keep-notes-2.7.1-arm64-mac.zip"],
      tempRoot: "/tmp",
      makeTempDir: () => "/tmp/keep-notes-update",
      findAppBundle: () => appPath,
      runCommand,
      writeFile,
    });

    expect(result).toBe(appPath);
    expect(runCommand).toHaveBeenCalledWith("ditto", [
      "-x",
      "-k",
      "/cache/keep-notes-2.7.1-arm64-mac.zip",
      "/tmp/keep-notes-update",
    ]);
    expect(runCommand).toHaveBeenCalledWith("codesign", [
      "--verify",
      "--deep",
      "--strict",
      appPath,
    ]);
    expect(runCommand).toHaveBeenCalledWith("codesign", [
      "--force",
      "--deep",
      "--sign",
      "-",
      "--entitlements",
      "/tmp/keep-notes-update/entitlements.mac.plist",
      appPath,
    ]);
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/keep-notes-update/entitlements.mac.plist",
      expect.stringContaining("com.apple.security.cs.allow-jit"),
    );
  });

  it("uses a downloaded app path directly without extracting a zip", async () => {
    const runCommand = vi.fn(async () => undefined);

    const result = await prepareMacUpdatePackage({
      downloadedFiles: ["/cache/Keep Notes.app"],
      tempRoot: "/tmp",
      makeTempDir: () => "/tmp/keep-notes-update",
      findAppBundle: () => null,
      runCommand,
      writeFile: vi.fn(),
    });

    expect(result).toBe("/cache/Keep Notes.app");
    expect(runCommand).not.toHaveBeenCalledWith(
      "ditto",
      expect.arrayContaining(["/cache/Keep Notes.app"]),
    );
  });
});
