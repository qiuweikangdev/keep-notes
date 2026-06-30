import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { BrowserWindow, shell } from "electron";
import htmlToDocx from "html-to-docx";
import MarkdownIt from "markdown-it";
import type {
  ExportConfig,
  ExportFileResult,
  ExportFormat,
} from "../shared/types";

const EXPORT_EXTENSIONS: Record<ExportFormat, string> = {
  pdf: ".pdf",
  word: ".docx",
  md: ".md",
  html: ".html",
  image: ".png",
};

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getExportBaseName(filePath: string): string {
  const fileName = basename(filePath);
  const extension = extname(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

function getExportDirectory(filePath: string, config: ExportConfig): string {
  if (config.defaultDirectoryMode === "custom" && config.customDirectoryPath) {
    return config.customDirectoryPath;
  }
  return dirname(filePath);
}

function createDocumentStyles(): string {
  return `
    :root { color-scheme: light; }
    body {
      box-sizing: border-box;
      margin: 0 auto;
      max-width: 900px;
      padding: 40px;
      color: #1f2328;
      background: #ffffff;
      font: 14px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    h1, h2, h3, h4, h5, h6 {
      margin: 1.35em 0 0.65em;
      line-height: 1.25;
      color: #111827;
    }
    h1 { font-size: 28px; border-bottom: 1px solid #d8dee4; padding-bottom: 0.35em; }
    h2 { font-size: 22px; border-bottom: 1px solid #d8dee4; padding-bottom: 0.25em; }
    h3 { font-size: 18px; }
    p, blockquote, ul, ol, table, pre { margin: 0 0 16px; }
    ul, ol { padding-left: 1.5em; }
    li + li { margin-top: 0.25em; }
    blockquote {
      padding: 0 1em;
      color: #57606a;
      border-left: 4px solid #d0d7de;
    }
    table {
      display: table;
      width: 100%;
      border-spacing: 0;
      border-collapse: collapse;
      overflow: visible;
    }
    th, td {
      padding: 6px 13px;
      border: 1px solid #d0d7de;
      vertical-align: top;
    }
    th { font-weight: 600; background: #f6f8fa; }
    tr:nth-child(2n) td { background: #f6f8fa; }
    code {
      padding: 0.2em 0.4em;
      border-radius: 6px;
      background: rgba(175, 184, 193, 0.2);
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 85%;
    }
    pre {
      overflow: auto;
      padding: 16px;
      border-radius: 6px;
      background: #f6f8fa;
    }
    pre code { padding: 0; background: transparent; font-size: 100%; }
    img { max-width: 100%; height: auto; }
    a { color: #0969da; text-decoration: none; }
    hr { height: 0.25em; padding: 0; margin: 24px 0; background: #d0d7de; border: 0; }
  `;
}

export function createHtmlDocument(markdown: string, title: string): string {
  const bodyContent = markdownRenderer.render(markdown);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${createDocumentStyles()}</style>
</head>
<body>
${bodyContent}
</body>
</html>
`;
}

function createRendererDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

async function withRenderedWindow<T>(
  html: string,
  width: number,
  height: number,
  render: (window: BrowserWindow) => Promise<T>,
): Promise<T> {
  const window = new BrowserWindow({
    show: false,
    width,
    height,
    webPreferences: {
      offscreen: true,
    },
  });

  try {
    await window.loadURL(createRendererDataUrl(html));
    return await render(window);
  } finally {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  }
}

async function createPdfDocument(html: string): Promise<Buffer> {
  return withRenderedWindow(html, 960, 1200, (window) => {
    // 通过 Chromium 打印管线生成 PDF，避免手写 PDF 导致中文编码和表格布局问题。
    return window.webContents.printToPDF({
      printBackground: true,
      margins: {
        marginType: "default",
      },
    });
  });
}

async function getDocumentHeight(window: BrowserWindow): Promise<number> {
  const height = await window.webContents.executeJavaScript(
    `Math.ceil(Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.clientHeight,
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight
    ))`,
    true,
  );

  if (typeof height !== "number" || !Number.isFinite(height)) {
    return 1200;
  }

  return Math.min(Math.max(height, 320), 12000);
}

async function createPngDocument(html: string): Promise<Buffer> {
  return withRenderedWindow(html, 960, 1200, async (window) => {
    // 截图前按页面实际高度调整窗口，避免长表格只导出首屏。
    const documentHeight = await getDocumentHeight(window);
    window.setContentSize(960, documentHeight);
    const image = await window.capturePage();
    return image.toPNG();
  });
}

async function createWordDocument(
  html: string,
  title: string,
): Promise<Buffer> {
  const output = await htmlToDocx(html, undefined, {
    title,
    lang: "zh-CN",
    font: "Microsoft YaHei",
    table: {
      row: {
        cantSplit: true,
      },
    },
  });

  return Buffer.isBuffer(output) ? output : Buffer.from(output);
}

async function createExportContent(
  format: ExportFormat,
  markdown: string,
  title: string,
): Promise<string | Buffer> {
  if (format === "md") {
    return markdown;
  }

  const html = createHtmlDocument(markdown, title);

  switch (format) {
    case "html":
      return html;
    case "word":
      return createWordDocument(html, title);
    case "pdf":
      return createPdfDocument(html);
    case "image":
      return createPngDocument(html);
    case "md":
    default:
      return markdown;
  }
}

export async function exportFile(
  filePath: string,
  config: ExportConfig,
): Promise<ExportFileResult> {
  const markdown = await readFile(filePath, "utf8");
  const outputDirectory = getExportDirectory(filePath, config);
  const baseName = getExportBaseName(filePath);
  const filePaths: string[] = [];

  await mkdir(outputDirectory, { recursive: true });

  // 按用户配置的格式逐个落盘，确保每种格式都基于同一份渲染后的文档内容。
  for (const format of config.enabledFormats) {
    const outputPath = join(
      outputDirectory,
      `${baseName}${EXPORT_EXTENSIONS[format]}`,
    );
    const content = await createExportContent(format, markdown, baseName);

    if (typeof content === "string") {
      await writeFile(outputPath, content, "utf8");
    } else {
      await writeFile(outputPath, content);
    }

    filePaths.push(outputPath);
  }

  if (config.openDirectoryAfterExport) {
    const errorMessage = await shell.openPath(outputDirectory);
    if (errorMessage) {
      console.error("Failed to open export directory:", errorMessage);
    }
  }

  return {
    directoryPath: outputDirectory,
    filePaths,
  };
}
