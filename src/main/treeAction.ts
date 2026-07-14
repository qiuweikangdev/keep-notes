import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, normalize, sep } from "node:path";
import { dialog } from "electron";
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
      ...(isFolder ? { children: [] } : {}),
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
    if (isFile) {
      await fsPromises.unlink(pathStr);
    } else {
      await fsPromises.rmdir(pathStr, { recursive: true });
    }

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
      message: isFile ? "文件删除成功" : "文件夹删除成功",
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
  title: string,
  treeData: any[],
) {
  const result = await fsPromises.stat(pathStr);
  const { response } = await dialog.showMessageBox({
    title: "警告",
    message: `是否要删除 ${title}`,
    type: "warning",
    buttons: ["确定", "取消"],
  });

  if (response === 0) {
    return await deleteItem(pathStr, treeData, result.isFile());
  }
  return { code: CodeResult.Fail };
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

    const { response } = await dialog.showMessageBox({
      type: "warning",
      buttons: ["确定", "取消"],
      title: "确认移动",
      message: `确认将 ${basename(sourcePath)} 移动到 ${basename(targetPath)} 吗？`,
      cancelId: -1,
    });

    if ([1, -1].includes(response)) {
      return { code: CodeResult.Fail };
    }

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

    const treeDataResult = deleteTreeNode(treeData, sourcePath);
    const targetNode = findNodeByKey(treeDataResult, newTargetPath);

    if (targetNode) {
      if (!targetNode.children) targetNode.children = [];
      targetNode.children.push({
        key: newPath,
        title: basename(newPath),
      });
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
