import { access, mkdir, readFile, writeFile } from "node:fs/promises";
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

interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

async function getUniqueExportBaseName(
  outputDirectory: string,
  baseName: string,
  formats: ExportFormat[],
): Promise<string> {
  let copyIndex = 0;

  while (true) {
    const candidateBaseName =
      copyIndex === 0 ? baseName : `${baseName}-副本${copyIndex}`;
    const hasConflict = await Promise.all(
      formats.map((format) =>
        pathExists(
          join(
            outputDirectory,
            `${candidateBaseName}${EXPORT_EXTENSIONS[format]}`,
          ),
        ),
      ),
    ).then((results) => results.some(Boolean));

    if (!hasConflict) {
      return candidateBaseName;
    }

    copyIndex += 1;
  }
}

function removeEmptyTableHeaders(html: string): string {
  return html.replace(
    /<thead>\s*<tr>\s*((?:<th(?:\s[^>]*)?>\s*<\/th>\s*)+)<\/tr>\s*<\/thead>\s*/g,
    "",
  );
}

function createDocumentStyles(): string {
  return `
    @page { margin: 0; }
    :root { color-scheme: light; }
    body {
      box-sizing: border-box;
      margin: 0;
      padding: 24px;
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
    body > :first-child { margin-top: 0; }
    body > :last-child { margin-bottom: 0; }
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
  const bodyContent = removeEmptyTableHeaders(
    markdownRenderer.render(markdown),
  );

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
        marginType: "none",
      },
    });
  });
}

async function getDocumentCaptureRect(
  window: BrowserWindow,
): Promise<CaptureRect> {
  const rect = await window.webContents.executeJavaScript(
    `(() => {
      const elements = Array.from(document.body.children);
      if (elements.length === 0) {
        return { x: 0, y: 0, width: 960, height: 320 };
      }
      const bounds = elements.reduce((current, element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: Math.min(current.left, rect.left),
          top: Math.min(current.top, rect.top),
          right: Math.max(current.right, rect.right),
          bottom: Math.max(current.bottom, rect.bottom),
        };
      }, {
        left: Number.POSITIVE_INFINITY,
        top: Number.POSITIVE_INFINITY,
        right: 0,
        bottom: 0,
      });
      return {
        x: Math.max(0, Math.floor(bounds.left)),
        y: Math.max(0, Math.floor(bounds.top)),
        width: Math.ceil(bounds.right - bounds.left),
        height: Math.ceil(bounds.bottom - bounds.top),
      };
    })()`,
    true,
  );

  if (!isCaptureRect(rect)) {
    return { height: 1200, width: 960, x: 0, y: 0 };
  }

  return {
    height: Math.min(Math.max(rect.height, 320), 12000),
    width: Math.min(Math.max(rect.width, 320), 12000),
    x: Math.max(rect.x, 0),
    y: Math.max(rect.y, 0),
  };
}

function isCaptureRect(value: unknown): value is CaptureRect {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const rect = value as Record<string, unknown>;
  return ["height", "width", "x", "y"].every(
    (key) => typeof rect[key] === "number" && Number.isFinite(rect[key]),
  );
}

async function createPngDocument(html: string): Promise<Buffer> {
  return withRenderedWindow(html, 960, 1200, async (window) => {
    // 截图前按真实内容边界裁剪，避免把页面留白一起导出。
    const rect = await getDocumentCaptureRect(window);
    window.setContentSize(rect.x + rect.width, rect.y + rect.height);
    const image = await window.capturePage(rect);
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
  const exportBaseName = await getUniqueExportBaseName(
    outputDirectory,
    baseName,
    config.enabledFormats,
  );

  // 按用户配置的格式逐个落盘，确保每种格式都基于同一份渲染后的文档内容。
  for (const format of config.enabledFormats) {
    const outputPath = join(
      outputDirectory,
      `${exportBaseName}${EXPORT_EXTENSIONS[format]}`,
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
