import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExportConfig } from "../shared/types";

const electronMocks = vi.hoisted(() => {
  const printToPDF = vi.fn(async () => Buffer.from("%PDF mocked 中文"));
  const executeJavaScript = vi.fn(async () => ({
    height: 720,
    width: 840,
    x: 24,
    y: 24,
  }));
  const loadURL = vi.fn(async () => undefined);
  const setContentSize = vi.fn();
  const capturePage = vi.fn(async () => ({
    toPNG: () => Buffer.from("PNG mocked 中文"),
  }));
  const destroy = vi.fn();
  const isDestroyed = vi.fn(() => false);
  const BrowserWindow = vi.fn(() => ({
    loadURL,
    webContents: {
      executeJavaScript,
      printToPDF,
    },
    setContentSize,
    capturePage,
    destroy,
    isDestroyed,
  }));

  return {
    BrowserWindow,
    capturePage,
    destroy,
    executeJavaScript,
    isDestroyed,
    loadURL,
    printToPDF,
    setContentSize,
  };
});

vi.mock("electron", () => ({
  BrowserWindow: electronMocks.BrowserWindow,
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
    const markdown = [
      "# 导出标题",
      "",
      "中文 **加粗**",
      "",
      "| 名称 | 数量 |",
      "| --- | ---: |",
      "| 苹果 | 3 |",
      "",
      "- first item",
    ].join("\n");
    await writeFile(sourcePath, markdown, "utf8");
    const config: ExportConfig = {
      enabledFormats: ["md", "html", "pdf", "word", "image"],
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
      join(outputDirectory, "daily.docx"),
      join(outputDirectory, "daily.png"),
    ]);
    await expect(readFile(result.filePaths[0], "utf8")).resolves.toBe(markdown);
    const htmlContent = await readFile(result.filePaths[1], "utf8");
    expect(htmlContent).toContain("<h1>导出标题</h1>");
    expect(htmlContent).toContain("中文 <strong>加粗</strong>");
    expect(htmlContent).toContain("<table>");
    expect(htmlContent).toContain("<th>名称</th>");
    expect(htmlContent).toContain("<td>苹果</td>");
    expect(htmlContent).toContain("<li>first item</li>");
    expect(htmlContent).not.toContain("| 名称 | 数量 |");
    expect(htmlContent).not.toContain("<pre># Daily");
    const pdfContent = await readFile(result.filePaths[2], "utf8");
    expect(pdfContent).toContain("%PDF mocked 中文");
    expect(pdfContent).not.toContain("# Daily");
    const wordContent = await readFile(result.filePaths[3]);
    expect(wordContent.subarray(0, 2).toString("utf8")).toBe("PK");
    const imageContent = await readFile(result.filePaths[4], "utf8");
    expect(imageContent).toContain("PNG mocked 中文");
    expect(electronMocks.printToPDF).toHaveBeenCalledWith(
      expect.objectContaining({
        printBackground: true,
      }),
    );
    expect(electronMocks.setContentSize).toHaveBeenCalledWith(864, 744);

    const copiedResult = await exportFile(sourcePath, config);

    expect(copiedResult.filePaths).toEqual([
      join(outputDirectory, "daily-副本1.md"),
      join(outputDirectory, "daily-副本1.html"),
      join(outputDirectory, "daily-副本1.pdf"),
      join(outputDirectory, "daily-副本1.docx"),
      join(outputDirectory, "daily-副本1.png"),
    ]);
  });

  it("removes empty table headers from rendered markdown exports", async () => {
    const { createHtmlDocument } = await import("./export-service");

    const htmlContent = createHtmlDocument(
      [
        "# 导出表格",
        "",
        "| | | | |",
        "| --- | --- | --- | --- |",
        "| 1 | 2 | 3 | 4 |",
        "| 11 | 22 | 33 | 44 |",
      ].join("\n"),
      "table",
    );

    expect(htmlContent).toContain("<table>");
    expect(htmlContent).toContain("<tbody>");
    expect(htmlContent).not.toContain("<thead>");
    expect(htmlContent).not.toContain("<th></th>");
    expect(htmlContent).toContain("<td>1</td>");
    expect(htmlContent).toContain("<td>44</td>");
  });
});
