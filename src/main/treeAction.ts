import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, normalize, sep } from "node:path";
import { shell } from "electron";
import { CodeResult } from "../shared/types";
import {
  deleteTreeNode,
  findNodeByKey,
  treeDataSort,
  updateFilePaths,
} from "./utils";

const fsPromises = fs.promises;

function getNameExistsMessage(targetPath: string) {
  return `“${basename(targetPath)}”已存在，请使用其他名称`;
}

function isFileExistsError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EEXIST"
  );
}

async function renamePath(
  sourcePath: string,
  targetPath: string,
  isCaseOnlyRename: boolean,
) {
  if (!isCaseOnlyRename) {
    await fsPromises.rename(sourcePath, targetPath);
    return;
  }

  // 大小写不敏感的文件系统需要经过临时路径，确保仅修改名称大小写也能落盘。
  const temporaryPath = join(
    dirname(sourcePath),
    `.tolaria-rename-txn-${randomUUID()}`,
  );
  await fsPromises.rename(sourcePath, temporaryPath);
  try {
    await fsPromises.rename(temporaryPath, targetPath);
  } catch (error) {
    await fsPromises.rename(temporaryPath, sourcePath).catch(() => undefined);
    throw error;
  }
}

async function createItem(
  pathStr: string,
  title: string,
  treeData: any[],
  isFolder = false,
) {
  const result = await fsPromises.stat(pathStr);
  const dealPath = result.isFile() ? dirname(pathStr) : pathStr;
  const newPath = isFolder
    ? `${dealPath}${sep}${title}`
    : `${dealPath}${sep}${title}.md`;
  const isExists = fs.existsSync(newPath);

  if (isExists) {
    return {
      code: CodeResult.Fail,
      message: getNameExistsMessage(newPath),
    };
  }

  try {
    if (isFolder) {
      await fsPromises.mkdir(newPath);
    } else {
      await fsPromises.writeFile(newPath, "", {
        encoding: "utf-8",
        flag: "wx",
      });
    }

    const targetNode = findNodeByKey(treeData, dealPath);
    const newItem = {
      title: isFolder ? title : `${title}.md`,
      key: newPath,
      ...(isFolder ? { children: [], isLoaded: false } : {}),
    };

    if (targetNode) {
      if (targetNode.children) {
        targetNode.children.push(newItem);
      } else {
        treeData.push(newItem);
      }
    } else {
      treeData.push(newItem);
    }

    const newTreeData = await treeDataSort(treeData);

    return {
      code: CodeResult.Success,
      message: isFolder ? "文件夹创建成功" : "文件创建成功",
      data: { treeData: newTreeData },
    };
  } catch (e) {
    return {
      code: CodeResult.Fail,
      message: isFileExistsError(e) ? getNameExistsMessage(newPath) : String(e),
    };
  }
}

export async function createFile(
  pathStr: string,
  title: string,
  treeData: any[],
) {
  return createItem(pathStr, title, treeData, false);
}

export async function createFolder(
  pathStr: string,
  title: string,
  treeData: any[],
) {
  return createItem(pathStr, title, treeData, true);
}

export async function rename(pathStr: string, title: string, treeData: any[]) {
  const result = await fsPromises.stat(pathStr);
  const parentPath = dirname(pathStr);
  const curTitle = result.isFile() ? `${title}.md` : title;
  const newPath = `${parentPath}${sep}${curTitle}`;
  const currentTitle = basename(pathStr);
  if (currentTitle === curTitle) {
    return {
      code: CodeResult.Success,
      message: "名称未发生变化",
      data: { treeData },
    };
  }

  const siblingNames = await fsPromises.readdir(parentPath);
  const hasExactNameConflict = siblingNames.includes(curTitle);
  const isCaseOnlyRename =
    currentTitle !== curTitle &&
    currentTitle.toLocaleLowerCase() === curTitle.toLocaleLowerCase();
  const isExists = fs.existsSync(newPath);

  if (hasExactNameConflict || (isExists && !isCaseOnlyRename)) {
    return {
      code: CodeResult.Fail,
      message: getNameExistsMessage(newPath),
    };
  }

  try {
    await renamePath(pathStr, newPath, isCaseOnlyRename);
    const targetNode = findNodeByKey(treeData, pathStr);
    if (targetNode) {
      updateFilePaths(targetNode, newPath);
      targetNode.title = curTitle;
      targetNode.key = newPath;
    }

    const newTreeData = await treeDataSort(treeData);
    return {
      code: CodeResult.Success,
      message: "重命名成功",
      data: { treeData: newTreeData },
    };
  } catch (e) {
    return {
      code: CodeResult.Fail,
      message: String(e),
    };
  }
}

async function deleteItem(pathStr: string, treeData: any[], isFile = false) {
  try {
    // 交由系统回收站处理，Windows 可在回收站、macOS 可在废纸篓中恢复。
    await shell.trashItem(pathStr);

    const parentPath = dirname(pathStr);
    const targetNode = findNodeByKey(treeData, parentPath);
    if (targetNode) {
      targetNode.children = targetNode.children?.filter(
        (node: any) => normalize(node.key) !== normalize(pathStr),
      );
    } else {
      treeData = treeData.filter(
        (node: any) => normalize(node.key) !== normalize(pathStr),
      );
    }

    return {
      code: CodeResult.Success,
      message: isFile ? "文件已移至回收站" : "文件夹已移至回收站",
      data: { treeData },
    };
  } catch (e) {
    return {
      code: CodeResult.Fail,
      message: String(e),
    };
  }
}

export async function deleteFileOrFolder(
  pathStr: string,
  _title: string,
  treeData: any[],
) {
  const result = await fsPromises.stat(pathStr);
  // 渲染进程已通过应用内对话框完成确认，主进程只负责执行删除。
  return deleteItem(pathStr, treeData, result.isFile());
}

export async function moveFileOrFolder(
  sourcePath: string,
  targetPath: string,
  treeData: any[],
) {
  try {
    const sourceResult = await fsPromises.stat(sourcePath);
    const targetResult = await fsPromises.stat(targetPath);
    const isFile = sourceResult.isFile();
    const isTargetFile = targetResult.isFile();

    // 渲染进程已通过应用内对话框完成确认，主进程只负责执行移动。
    const newPath = isTargetFile
      ? join(dirname(targetPath), basename(sourcePath))
      : join(targetPath, basename(sourcePath));

    const newTargetPath = isTargetFile ? dirname(targetPath) : targetPath;
    const targetPathResult = await fsPromises.readdir(newTargetPath);
    if (targetPathResult.includes(basename(sourcePath))) {
      return {
        code: CodeResult.Fail,
        message: `目标路径(${basename(targetPath)}) 已存在 ${basename(sourcePath)} ${isFile ? "文件" : "目录"}`,
      };
    }

    await fsPromises.rename(sourcePath, newPath);

    const sourceNode = findNodeByKey(treeData, sourcePath);
    const treeDataResult = deleteTreeNode(treeData, sourcePath);
    const targetNode = findNodeByKey(treeDataResult, newTargetPath);

    if (targetNode) {
      if (!targetNode.children) targetNode.children = [];
      const movedNode = sourceNode ?? {
        key: sourcePath,
        title: basename(sourcePath),
        ...(isFile ? {} : { children: [], isLoaded: false }),
      };
      // 已加载目录移动后继续复用子树，并同步所有后代路径，避免暂时退化成文件节点。
      updateFilePaths(movedNode, newPath);
      movedNode.key = newPath;
      movedNode.title = basename(newPath);
      targetNode.children.push(movedNode);
    }

    const newTreeData = await treeDataSort(treeDataResult);

    return {
      code: CodeResult.Success,
      data: { treeData: newTreeData },
    };
  } catch (e) {
    return {
      code: CodeResult.Fail,
      message: String(e),
    };
  }
}
