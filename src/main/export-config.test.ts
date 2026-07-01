import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExportConfig } from "../shared/types";
import { DEFAULT_EXPORT_CONFIG } from "../shared/types";

let userDataPath = "";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn((name: string) =>
      name === "downloads" ? "/Users/test/Downloads" : userDataPath,
    ),
  },
}));

describe("ExportConfigManager", () => {
  beforeEach(async () => {
    vi.resetModules();
    userDataPath = await mkdtemp(join(tmpdir(), "keep-notes-export-config-"));
  });

  afterEach(async () => {
    await rm(userDataPath, { recursive: true, force: true });
  });

  it("uses the default export config when no config file exists", async () => {
    const { ExportConfigManager } = await import("./export-config");
    const manager = new ExportConfigManager();
    const expectedConfig = {
      ...DEFAULT_EXPORT_CONFIG,
      customDirectoryPath: "/Users/test/Downloads",
    };

    await expect(manager.loadConfig()).resolves.toEqual(expectedConfig);
    expect(manager.getConfig()).toEqual(expectedConfig);
    expect(manager.getConfig().enabledFormats).toEqual(["pdf"]);
  });

  it("normalizes and persists partial export config", async () => {
    const { ExportConfigManager } = await import("./export-config");
    const manager = new ExportConfigManager();
    const config: ExportConfig = {
      ...DEFAULT_EXPORT_CONFIG,
      enabledFormats: ["pdf", "html"],
      defaultDirectoryMode: "custom",
      customDirectoryPath: "/Users/test/Documents",
      openDirectoryAfterExport: true,
    };

    await manager.saveConfig(config);

    const nextManager = new ExportConfigManager();
    await expect(nextManager.loadConfig()).resolves.toEqual(config);
  });
});
