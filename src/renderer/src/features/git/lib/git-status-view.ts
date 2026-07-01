import type { GitStatus } from "@/types";

export type GitStatusKind =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "unmerged";

export interface GitStatusBadge {
  kind: GitStatusKind;
  label: "M" | "A" | "D" | "R" | "C" | "U";
  title: string;
  color: string;
}

export interface GitFileTreeNode {
  name: string;
  path: string;
  isFile: boolean;
  children: GitFileTreeNode[];
}

const STATUS_BADGES: Record<GitStatusKind, GitStatusBadge> = {
  modified: {
    kind: "modified",
    label: "M",
    title: "文件被修改",
    color: "#3794ff",
  },
  added: {
    kind: "added",
    label: "A",
    title: "新增文件",
    color: "#73c991",
  },
  deleted: {
    kind: "deleted",
    label: "D",
    title: "文件被删除",
    color: "#f85149",
  },
  renamed: {
    kind: "renamed",
    label: "R",
    title: "文件被重命名",
    color: "#c586c0",
  },
  copied: {
    kind: "copied",
    label: "C",
    title: "文件被复制",
    color: "#c586c0",
  },
  unmerged: {
    kind: "unmerged",
    label: "U",
    title: "文件有冲突，尚未合并",
    color: "#e2c08d",
  },
};

function normalizeGitPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function includesPath(paths: string[], filePath: string): boolean {
  const normalized = normalizeGitPath(filePath);
  return paths.some((path) => normalizeGitPath(path) === normalized);
}

function addUniquePath(paths: string[], seen: Set<string>, filePath: string) {
  const normalized = normalizeGitPath(filePath);
  if (!normalized || seen.has(normalized)) return;

  seen.add(normalized);
  paths.push(filePath);
}

function getBadgeFromRawStatus(statusText: string): GitStatusBadge | null {
  if (!statusText.trim()) return null;
  if (statusText.includes("U")) return STATUS_BADGES.unmerged;
  if (statusText.includes("D")) return STATUS_BADGES.deleted;
  if (statusText.includes("R")) return STATUS_BADGES.renamed;
  if (statusText.includes("C")) return STATUS_BADGES.copied;
  if (statusText.includes("A") || statusText.includes("?")) {
    return STATUS_BADGES.added;
  }
  if (statusText.includes("M")) return STATUS_BADGES.modified;

  return null;
}

export function getVisibleGitFilePaths(status: GitStatus): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  // 保持 Git 返回的主顺序，补齐新增、重命名和冲突等状态，避免状态列表漏项。
  [
    ...status.staged,
    ...status.modified,
    ...status.not_added,
    ...status.deleted,
    ...status.created,
    ...status.renamed.map((file) => file.to),
    ...status.conflicted,
    ...status.files.map((file) => file.path),
  ].forEach((filePath) => addUniquePath(paths, seen, filePath));

  return paths;
}

export function getGitStatusBadge(
  status: GitStatus,
  filePath: string,
): GitStatusBadge | null {
  if (includesPath(status.conflicted, filePath)) return STATUS_BADGES.unmerged;
  if (includesPath(status.deleted, filePath)) return STATUS_BADGES.deleted;

  const renamed = status.renamed.some(
    (file) =>
      normalizeGitPath(file.from) === normalizeGitPath(filePath) ||
      normalizeGitPath(file.to) === normalizeGitPath(filePath),
  );
  if (renamed) return STATUS_BADGES.renamed;

  if (
    includesPath(status.created, filePath) ||
    includesPath(status.not_added, filePath)
  ) {
    return STATUS_BADGES.added;
  }

  if (includesPath(status.modified, filePath)) return STATUS_BADGES.modified;

  const file = status.files.find(
    (item) => normalizeGitPath(item.path) === normalizeGitPath(filePath),
  );
  if (!file) return null;

  return getBadgeFromRawStatus(`${file.index}${file.working_dir}`);
}

export function buildGitFileTree(filePaths: string[]): GitFileTreeNode[] {
  const root: GitFileTreeNode[] = [];

  filePaths.forEach((filePath) => {
    const normalizedPath = normalizeGitPath(filePath);
    const parts = normalizedPath.split("/");
    let current = root;

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;
      let node = current.find((item) => item.name === part);

      if (!node) {
        node = {
          name: part,
          path: parts.slice(0, index + 1).join("/"),
          isFile,
          children: [],
        };
        current.push(node);
      }

      if (!isFile) current = node.children;
    });
  });

  // 文件夹优先并按名称稳定排序，让树形缩进和扫描顺序接近 VS Code。
  const sortNodes = (nodes: GitFileTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name, "zh-CN");
    });
    nodes.forEach((node) => sortNodes(node.children));
  };

  sortNodes(root);
  return root;
}
