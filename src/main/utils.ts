import { dirname, normalize } from "node:path";
import fs from "node:fs";
import { BrowserWindow } from "electron/main";
import { compareFileTreeTitles } from "../shared/file-tree-sort";

const fsPromises = fs.promises;

export function getBrowserWindow(
  event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
): BrowserWindow {
  return BrowserWindow.fromWebContents(event.sender);
}

export function findNodeByKey(treeData: any[], key: string): any | null {
  for (const node of treeData) {
    if (node.key === key) {
      return node;
    }
    if (Array.isArray(node.children)) {
      const foundNode = findNodeByKey(node.children, key);
      if (foundNode) return foundNode;
    }
  }
  return null;
}

export async function treeDataSort(
  treeData: any[],
  isHandlerChildren = true,
): Promise<any[]> {
  const newTreeData = [...treeData];

  const statsPromises = newTreeData.map(async (node) => {
    const stat = await fsPromises.stat(node.key);
    const isDirectory = stat.isDirectory();

    if (isHandlerChildren && node.children) {
      node.children = await treeDataSort(node.children);
    }

    return { ...node, isDirectory };
  });

  const nodesWithStats = await Promise.all(statsPromises);

  nodesWithStats.sort((a, b) => {
    const isDirA = a.isDirectory;
    const isDirB = b.isDirectory;

    if (isDirA && !isDirB) return -1;
    if (!isDirA && isDirB) return 1;
    return compareFileTreeTitles(a.title, b.title);
  });

  return nodesWithStats;
}

export function updateFilePaths(node: any, newPath: string): void {
  if (node.children && node.children.length > 0) {
    node.children.forEach((child: any) => {
      child.key = child.key.replace(node.key, newPath);
      updateFilePaths(child, newPath);
    });
  }
}

export function deleteTreeNode(treeData: any[], deleteNodePath: string): any[] {
  let newTreeData = [...treeData];
  const parentPath = dirname(deleteNodePath);
  const targetNode = findNodeByKey(newTreeData, parentPath);

  if (targetNode) {
    targetNode.children = targetNode.children?.filter(
      (node: any) => normalize(node.key) !== normalize(deleteNodePath),
    );
  } else {
    newTreeData = newTreeData.filter(
      (node) => normalize(node.key) !== normalize(deleteNodePath),
    );
  }

  return newTreeData;
}
