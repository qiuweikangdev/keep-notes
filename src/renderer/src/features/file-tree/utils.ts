import type { TreeNode } from "@/types";

export interface FlatNode {
  key: string;
  title: string;
  level: number;
  isFolder: boolean;
  hasChildren: boolean;
  parentKey: string | null;
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
  parentKey: string | null = null,
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
      parentKey,
    });

    // 如果是展开的文件夹，递归添加子节点
    if (isFolder && expandedKeys.has(node.key) && node.children) {
      result.push(
        ...flattenTree(node.children, expandedKeys, level + 1, node.key),
      );
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
 * 查找目标节点的祖先文件夹 key，用于在文件树中自动展开当前文件路径。
 */
export function findAncestorKeys(nodes: TreeNode[], targetKey: string) {
  const visit = (items: TreeNode[], ancestors: string[]): string[] | null => {
    for (const item of items) {
      if (item.key === targetKey) {
        return ancestors;
      }

      if (!item.children) {
        continue;
      }

      const found = visit(item.children, [...ancestors, item.key]);
      if (found) {
        return found;
      }
    }

    return null;
  };

  return visit(nodes, []) ?? [];
}

export function shouldRevealFileTreeOnViewChange(
  previousView: "file" | "outline",
  nextView: "file" | "outline",
) {
  return previousView !== "file" && nextView === "file";
}

/**
 * 统一“在系统文件管理器中显示”的跨平台文案，避免各入口出现不一致。
 */
export function getRevealInFileManagerLabel(platform?: string): string {
  return platform === "darwin" ? "在 Finder 中显示" : "在资源管理器中显示";
}
