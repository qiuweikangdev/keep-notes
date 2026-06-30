import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExportConfig } from "../shared/types";

vi.mock("electron", () => ({
  shell: {
    openPath: vi.fn(async () => ""),
  },
}));

describe("exportFile", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    for (const root of tempRoots.splice(0)) {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("exports a markdown file to the configured formats and directory", async () => {
    const { exportFile } = await import("./export-service");
    const root = await mkdtemp(join(tmpdir(), "keep-notes-export-file-"));
    tempRoots.push(root);
    const sourcePath = join(root, "notes", "daily.md");
    const outputDirectory = join(root, "exports");
    await mkdir(dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, "# Daily\n\nHello export", "utf8");
    const config: ExportConfig = {
      enabledFormats: ["md", "html", "pdf"],
      defaultDirectoryMode: "custom",
      customDirectoryPath: outputDirectory,
      openDirectoryAfterExport: false,
    };

    const result = await exportFile(sourcePath, config);

    expect(result.directoryPath).toBe(outputDirectory);
    expect(result.filePaths).toEqual([
      join(outputDirectory, "daily.md"),
      join(outputDirectory, "daily.html"),
      join(outputDirectory, "daily.pdf"),
    ]);
    await expect(readFile(result.filePaths[0], "utf8")).resolves.toBe(
      "# Daily\n\nHello export",
    );
    await expect(readFile(result.filePaths[1], "utf8")).resolves.toContain(
      "<pre># Daily",
    );
    const pdfContent = await readFile(result.filePaths[2], "utf8");
    expect(pdfContent).toContain("%PDF-1.4");
  });
});
