import type { TreeNode } from "@/types";

export interface FlatNode {
  key: string;
  title: string;
  level: number;
  isFolder: boolean;
  hasChildren: boolean;
}

export function normalizeTreePath(path: string) {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function canMoveNodeToFolder(
  sourcePath: string,
  targetFolderPath: string,
) {
  const normalizedSource = normalizeTreePath(sourcePath);
  const normalizedTarget = normalizeTreePath(targetFolderPath);

  return (
    normalizedSource !== normalizedTarget &&
    !normalizedTarget.startsWith(`${normalizedSource}/`)
  );
}

/**
 * 将树结构展平为列表，只包含可见节点（展开的文件夹的子节点会显示）
 */
export function flattenTree(
  nodes: TreeNode[],
  expandedKeys: Set<string>,
  level: number = 0,
): FlatNode[] {
  const result: FlatNode[] = [];

  for (const node of nodes) {
    const isFolder = Array.isArray(node.children);
    const hasChildren = Boolean(node.children?.length);

    result.push({
      key: node.key,
      title: node.title,
      level,
      isFolder,
      hasChildren,
    });

    // 如果是展开的文件夹，递归添加子节点
    if (isFolder && expandedKeys.has(node.key) && node.children) {
      result.push(...flattenTree(node.children, expandedKeys, level + 1));
    }
  }

  return result;
}

/**
 * 根据 key 查找节点
 */
export function findNodeByKey(nodes: TreeNode[], key: string): TreeNode | null {
  for (const node of nodes) {
    if (node.key === key) return node;
    if (node.children) {
      const found = findNodeByKey(node.children, key);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 统一“在系统文件管理器中显示”的跨平台文案，避免各入口出现不一致。
 */
export function getRevealInFileManagerLabel(platform?: string): string {
  return platform === "darwin" ? "在 Finder 中显示" : "在资源管理器中显示";
}
