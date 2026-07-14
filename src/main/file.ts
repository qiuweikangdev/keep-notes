import fs from "node:fs";
import path, { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { clipboard, dialog, net, shell } from "electron";
import {
  CodeResult,
  type ExternalOpenAppId,
  type SaveImageAttachmentInput,
  type SaveImageAttachmentResult,
} from "../shared/types";
import { compareFileTreeTitles } from "../shared/file-tree-sort";
import { listExternalOpenApps, openWithExternalApp } from "./external-open";
import { shouldIgnoreFsWatchPath } from "./file-watch";

const IMAGE_MIME_BY_EXTENSION = new Map([
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ATTACHMENTS_DIR_NAME = "attachments";

interface ImageFetchResponse {
  ok: boolean;
  status: number;
  headers: {
    get: (name: string) => string | null;
  };
  arrayBuffer: () => Promise<ArrayBuffer>;
}

interface LoadImageDeps {
  fetchImage?: (url: string) => Promise<ImageFetchResponse>;
  readFile?: typeof fs.promises.readFile;
}

interface SaveImageAttachmentDeps {
  now?: () => number;
  mkdir?: typeof fs.promises.mkdir;
  writeFile?: typeof fs.promises.writeFile;
}

export async function readDirectory(directoryPath: string) {
  try {
    const files = await fs.promises.readdir(directoryPath);
    const directories: string[] = [];
    const markdownFiles: string[] = [];

    for (const file of files) {
      const filePath = path.join(directoryPath, file);
      if (shouldIgnoreFsWatchPath(filePath)) continue;

      const stats = await fs.promises.stat(filePath);

      if (stats.isDirectory() && !file.startsWith(".")) {
        directories.push(file);
      } else if ([".md"].includes(path.extname(file))) {
        markdownFiles.push(file);
      }
    }

    directories.sort(compareFileTreeTitles);
    markdownFiles.sort(compareFileTreeTitles);

    const directoryTrees = await Promise.all(
      directories.map(async (dir) => {
        const subtree = await readDirectory(path.join(directoryPath, dir));
        return {
          title: dir,
          key: path.join(directoryPath, dir),
          selectable: subtree && subtree.length > 0,
          children: subtree || [],
        };
      }),
    );

    const tree = [
      ...directoryTrees,
      ...markdownFiles.map((file) => ({
        title: file,
        key: path.join(directoryPath, file),
      })),
    ];

    return tree;
  } catch (error) {
    console.error("Error while reading directory:", error);
    return null;
  }
}

export async function readFileContent(filePath: string) {
  try {
    return await fs.promises.readFile(filePath, "utf-8");
  } catch (error) {
    console.error("Error while reading file:", error);
    // IPC 需要把真实读取失败传给渲染进程，不能与合法空文件混为一谈。
    throw error;
  }
}

export async function writeFileContent(filePath: string, content: string) {
  try {
    await fs.promises.writeFile(filePath, content, "utf-8");
  } catch (error) {
    console.error("Error while writing file:", error);
    // 保存状态由渲染进程统一管理，因此写盘异常必须继续向上抛出。
    throw error;
  }
}

function getImageMimeFromPath(sourcePath: string) {
  return IMAGE_MIME_BY_EXTENSION.get(path.extname(sourcePath).toLowerCase());
}

function getImageExtensionFromMime(mimeType: string) {
  for (const [extension, mime] of IMAGE_MIME_BY_EXTENSION) {
    if (mime === mimeType.toLowerCase()) return extension;
  }

  return ".png";
}

function getSafeImageFileName(fileName: string, mimeType: string) {
  const baseName = path.basename(fileName || "image");
  const extension = path.extname(baseName).toLowerCase();
  const imageExtension = IMAGE_MIME_BY_EXTENSION.has(extension)
    ? extension
    : getImageExtensionFromMime(mimeType);
  const stem = path
    .basename(baseName, extension)
    .trim()
    .replace(/[^\w.-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return `${stem || "image"}${imageExtension}`;
}

function isPathInsideDirectory(rootPath: string, targetPath: string) {
  const relativePath = path.relative(rootPath, targetPath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function toMarkdownRelativePath(fromFilePath: string, targetPath: string) {
  return path
    .relative(path.dirname(fromFilePath), targetPath)
    .split(path.sep)
    .join("/");
}

function getImageMimeFromResponse(source: string, contentType: string | null) {
  const mime = contentType?.split(";")[0]?.trim().toLowerCase();
  if (mime?.startsWith("image/")) return mime;

  return getImageMimeFromPath(new URL(source).pathname);
}

function bufferToDataUrl(buffer: Buffer, mime: string) {
  if (buffer.byteLength > MAX_IMAGE_BYTES) return null;

  return `data:${mime};base64,${buffer.toString("base64")}`;
}

async function loadLocalImageAsDataUrl(
  source: string,
  readFile: typeof fs.promises.readFile,
) {
  const sourcePath = source.startsWith("file://")
    ? fileURLToPath(source)
    : source;
  const mime = getImageMimeFromPath(sourcePath);
  if (!mime) return null;

  // 本地图片只按图片扩展名读取并转为 data URL，避免渲染进程直接访问 file://。
  const buffer = await readFile(sourcePath);
  return bufferToDataUrl(buffer, mime);
}

async function loadRemoteImageAsDataUrl(
  source: string,
  fetchImage: (url: string) => Promise<ImageFetchResponse>,
) {
  const url = source.startsWith("//") ? `https:${source}` : source;
  const response = await fetchImage(url);
  if (!response.ok) {
    throw new Error(`Image request failed with status ${response.status}`);
  }

  const mime = getImageMimeFromResponse(
    url,
    response.headers.get("content-type"),
  );
  if (!mime) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  return bufferToDataUrl(buffer, mime);
}

export async function loadImageAsDataUrl(
  source: string,
  deps: LoadImageDeps = {},
) {
  const trimmedSource = source.trim();
  if (!trimmedSource) return null;
  if (trimmedSource.startsWith("data:image/")) return trimmedSource;

  const fetchImage = deps.fetchImage ?? net.fetch;
  const readFile = deps.readFile ?? fs.promises.readFile;

  try {
    if (
      /^https?:\/\//iu.test(trimmedSource) ||
      trimmedSource.startsWith("//")
    ) {
      return await loadRemoteImageAsDataUrl(trimmedSource, fetchImage);
    }

    return await loadLocalImageAsDataUrl(trimmedSource, readFile);
  } catch (error) {
    console.error("Error while loading image:", error);
    return null;
  }
}

export async function saveImageAttachment(
  input: SaveImageAttachmentInput,
  deps: SaveImageAttachmentDeps = {},
): Promise<{ code: CodeResult; data?: SaveImageAttachmentResult }> {
  try {
    const workspaceRootPath = path.resolve(input.workspaceRootPath);
    const markdownFilePath = path.resolve(input.markdownFilePath);
    const mimeType = input.mimeType.toLowerCase();
    const originalExtension = path
      .extname(path.basename(input.fileName || ""))
      .toLowerCase();
    const isImageInput =
      mimeType.startsWith("image/") ||
      IMAGE_MIME_BY_EXTENSION.has(originalExtension);
    const safeFileName = getSafeImageFileName(input.fileName, mimeType);

    if (!isPathInsideDirectory(workspaceRootPath, markdownFilePath)) {
      return { code: CodeResult.Fail };
    }
    if (!isImageInput) {
      return { code: CodeResult.Fail };
    }

    const buffer = Buffer.from(input.data);
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) {
      return { code: CodeResult.Fail };
    }

    const now = deps.now ?? Date.now;
    const mkdir = deps.mkdir ?? fs.promises.mkdir;
    const writeFile = deps.writeFile ?? fs.promises.writeFile;
    const attachmentDirectory = path.join(
      workspaceRootPath,
      ATTACHMENTS_DIR_NAME,
    );
    const attachmentFilePath = path.join(
      attachmentDirectory,
      `${now()}-${safeFileName}`,
    );

    // 粘贴图片保存到工作区根目录 attachments，Markdown 中仅保留相对路径，避免写入大段 base64。
    await mkdir(attachmentDirectory, { recursive: true });
    await writeFile(attachmentFilePath, buffer);

    return {
      code: CodeResult.Success,
      data: {
        filePath: attachmentFilePath,
        url: toMarkdownRelativePath(markdownFilePath, attachmentFilePath),
      },
    };
  } catch (error) {
    console.error("Error while saving image attachment:", error);
    return { code: CodeResult.Fail };
  }
}

export async function updateLocalDirectory(treeData: any[], basePath: string) {
  for (const node of treeData) {
    const filePath = path.join(basePath, node.title);
    if (node.children) {
      await fs.promises.mkdir(filePath, { recursive: true });
      await updateLocalDirectory(node.children, filePath);
    } else {
      await fs.promises.writeFile(filePath, node.content || "");
    }
  }
}

export async function genDirTreByPath(selectedPath: string) {
  const directoryTree = await readDirectory(selectedPath);
  const treeRoot = {
    title: basename(selectedPath),
    key: selectedPath,
  };
  return {
    code: CodeResult.Success,
    data: {
      treeData: directoryTree || [],
      treeRoot,
    },
  };
}

export async function saveAsDialog(
  win: Electron.BrowserWindow,
  content: string,
) {
  try {
    const result = await dialog.showSaveDialog(win, {
      title: "保存文件",
      defaultPath: "未命名.md",
      filters: [
        { name: "Markdown", extensions: ["md"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });

    if (!result.canceled && result.filePath) {
      await fs.promises.writeFile(result.filePath, content, "utf-8");
      return {
        code: CodeResult.Success,
        data: { filePath: result.filePath },
      };
    }
    return { code: CodeResult.Fail };
  } catch (error) {
    console.error("Error while saving file:", error);
    return { code: CodeResult.Fail };
  }
}

export async function openDialog(win: Electron.BrowserWindow) {
  try {
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
    });

    if (!result.canceled) {
      const selectedPath = result.filePaths[0];
      const directoryTree = await readDirectory(selectedPath);
      const treeRoot = {
        title: basename(selectedPath),
        key: selectedPath,
      };
      return {
        code: CodeResult.Success,
        data: {
          selectedPath,
          treeData: directoryTree || [],
          treeRoot,
        },
      };
    } else {
      return { code: CodeResult.Fail };
    }
  } catch (error) {
    console.error("Error while opening dialog:", error);
    return { code: CodeResult.Fail };
  }
}

export async function getSelectedPath(win: Electron.BrowserWindow) {
  try {
    const result = await dialog.showOpenDialog(win, {
      properties: ["openDirectory"],
    });

    if (!result.canceled) {
      return result.filePaths[0];
    }
    return null;
  } catch (error) {
    console.error("Error while opening dialog:", error);
    return null;
  }
}

export function revealInSystemExplorer(targetPath: string) {
  try {
    shell.showItemInFolder(targetPath);
    return true;
  } catch (error) {
    console.error("Error while opening in explorer:", error);
    return false;
  }
}

export function copyPathToClipboard(targetPath: string) {
  try {
    clipboard.writeText(targetPath);
    return true;
  } catch (error) {
    console.error("Error while copying path:", error);
    return false;
  }
}

export function listAvailableExternalOpenApps() {
  return listExternalOpenApps();
}

export function openPathWithExternalApp(
  targetPath: string,
  appId: ExternalOpenAppId,
) {
  return openWithExternalApp(targetPath, appId);
}
