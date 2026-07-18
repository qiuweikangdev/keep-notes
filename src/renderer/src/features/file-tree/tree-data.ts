import type { TreeNode } from "@/types";
import type { WorkspaceChangeBatch } from "@shared/types";

function normalizePath(value: string) {
  return value.replaceAll("\\", "/").replace(/\/+$/u, "");
}

function mergeFreshChildren(
  previousChildren: TreeNode[],
  freshChildren: TreeNode[],
) {
  const previousByKey = new Map(
    previousChildren.map((node) => [normalizePath(node.key), node]),
  );

  return freshChildren.map((freshNode) => {
    const previousNode = previousByKey.get(normalizePath(freshNode.key));
    if (!freshNode.children || !previousNode?.children) return freshNode;
    if (!previousNode.isLoaded) return freshNode;

    return {
      ...freshNode,
      children: previousNode.children,
      isLoaded: true,
    };
  });
}

export function replaceDirectoryChildren(
  treeData: TreeNode[],
  rootPath: string,
  directoryPath: string,
  freshChildren: TreeNode[],
): TreeNode[] {
  const normalizedDirectory = normalizePath(directoryPath);
  if (normalizedDirectory === normalizePath(rootPath)) {
    return mergeFreshChildren(treeData, freshChildren);
  }

  let changed = false;
  const nextTree = treeData.map((node) => {
    if (normalizePath(node.key) === normalizedDirectory && node.children) {
      changed = true;
      return {
        ...node,
        children: mergeFreshChildren(node.children, freshChildren),
        isLoaded: true,
      };
    }
    if (!node.children?.length) return node;

    const nextChildren = replaceDirectoryChildren(
      node.children,
      rootPath,
      directoryPath,
      freshChildren,
    );
    if (nextChildren === node.children) return node;
    changed = true;
    return { ...node, children: nextChildren };
  });

  return changed ? nextTree : treeData;
}

export function getLoadedDirectoryKeys(treeData: TreeNode[], rootPath: string) {
  const keys = [rootPath];

  const visit = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (!node.children) continue;
      if (node.isLoaded) keys.push(node.key);
      if (node.children.length > 0) visit(node.children);
    }
  };

  visit(treeData);
  return keys;
}

function getParentPath(value: string) {
  const normalized = normalizePath(value);
  const separatorIndex = normalized.lastIndexOf("/");
  if (separatorIndex < 0) return "";
  const normalizedParent = normalized.slice(0, separatorIndex);
  return value.includes("\\")
    ? normalizedParent.replaceAll("/", "\\")
    : normalizedParent;
}

export function getDirectoriesToRefresh(
  batch: WorkspaceChangeBatch,
  treeData: TreeNode[],
) {
  const loadedDirectories = getLoadedDirectoryKeys(treeData, batch.rootPath);
  if (batch.hasUnknownPath) return loadedDirectories;

  const loadedByNormalizedPath = new Map(
    loadedDirectories.map((directoryPath) => [
      normalizePath(directoryPath),
      directoryPath,
    ]),
  );
  const directoriesToRefresh = new Set<string>();

  for (const event of batch.events) {
    if (event.eventType !== "rename") continue;
    const parentPath = getParentPath(event.path);
    const loadedPath = loadedByNormalizedPath.get(normalizePath(parentPath));
    if (loadedPath) directoriesToRefresh.add(loadedPath);
  }

  return [...directoriesToRefresh];
}

export function getTreePathDirectories(rootPath: string, targetPath: string) {
  const normalizedRoot = normalizePath(rootPath);
  const normalizedTarget = normalizePath(targetPath);
  if (!normalizedTarget.startsWith(`${normalizedRoot}/`)) return [];

  const relativeSegments = normalizedTarget
    .slice(normalizedRoot.length + 1)
    .split("/")
    .filter(Boolean);
  const directorySegments = relativeSegments.slice(0, -1);
  const separator = rootPath.includes("\\") ? "\\" : "/";
  const cleanRoot = rootPath.replace(/[\\/]+$/u, "");

  return directorySegments.map((_, index) =>
    [cleanRoot, ...directorySegments.slice(0, index + 1)].join(separator),
  );
}
