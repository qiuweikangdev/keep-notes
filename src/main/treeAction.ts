import fs from "node:fs";
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
      message: isFolder ? "该文件夹已存在" : "该文件已存在",
    };
  }

  try {
    if (isFolder) {
      await fsPromises.mkdir(newPath, { recursive: true });
    } else {
      await fsPromises.writeFile(newPath, "", { encoding: "utf-8" });
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
      message: String(e),
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
  const isExists = fs.existsSync(newPath);

  if (isExists) {
    return {
      code: CodeResult.Fail,
      message: "已存在文件/文件夹",
    };
  }

  try {
    await fsPromises.rename(pathStr, newPath);
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
