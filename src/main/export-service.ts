import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { shell } from "electron";
import type {
  ExportConfig,
  ExportFileResult,
  ExportFormat,
} from "../shared/types";

const EXPORT_EXTENSIONS: Record<ExportFormat, string> = {
  pdf: ".pdf",
  word: ".doc",
  md: ".md",
  html: ".html",
  image: ".svg",
};

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

function createHtmlDocument(markdown: string, title: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 40px; font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    pre { white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <pre>${escapeHtml(markdown)}</pre>
</body>
</html>
`;
}

function escapePdfText(value: string): string {
  return value
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function createPdfDocument(markdown: string): string {
  const lines = markdown.split(/\r?\n/).slice(0, 48);
  const textCommands = lines
    .map((line, index) => {
      const escapedLine = escapePdfText(line);
      return index === 0
        ? `50 780 Td (${escapedLine}) Tj`
        : `0 -16 Td (${escapedLine}) Tj`;
    })
    .join("\n");
  const stream = `BT
/F1 12 Tf
${textCommands}
ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref
0 ${objects.length + 1}
0000000000 65535 f 
${offsets
  .slice(1)
  .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)
  .join("\n")}
trailer
<< /Size ${objects.length + 1} /Root 1 0 R >>
startxref
${xrefOffset}
%%EOF
`;
  return pdf;
}

function createSvgDocument(markdown: string, title: string): string {
  const lines = markdown.split(/\r?\n/).slice(0, 36);
  const width = 960;
  const height = Math.max(240, lines.length * 24 + 96);
  const text = lines
    .map((line, index) => {
      return `<text x="48" y="${80 + index * 24}">${escapeHtml(line)}</text>`;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="48" y="42" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="20" font-weight="600" fill="#111827">${escapeHtml(title)}</text>
  <g font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="16" fill="#1f2937">
  ${text}
  </g>
</svg>
`;
}

function createExportContent(
  format: ExportFormat,
  markdown: string,
  title: string,
): string {
  switch (format) {
    case "html":
    case "word":
      return createHtmlDocument(markdown, title);
    case "pdf":
      return createPdfDocument(markdown);
    case "image":
      return createSvgDocument(markdown, title);
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

  // 按用户配置的格式逐个落盘，确保右键导出产生真实文件。
  for (const format of config.enabledFormats) {
    const outputPath = join(
      outputDirectory,
      `${baseName}${EXPORT_EXTENSIONS[format]}`,
    );
    await writeFile(
      outputPath,
      createExportContent(format, markdown, baseName),
      "utf8",
    );
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
