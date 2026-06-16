import fs from "node:fs";
import path, { basename } from "node:path";
import { dialog, shell } from "electron";
import { CodeResult } from "../shared/types";
import { shouldIgnoreFsWatchPath } from "./file-watch";

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

    directories.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    markdownFiles.sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    );

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
