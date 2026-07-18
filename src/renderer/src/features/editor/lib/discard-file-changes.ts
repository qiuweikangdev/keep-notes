import { useElectron } from "@/hooks/use-electron";
import { useEditorStore } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import { CodeResult } from "@/types";
import { areDiffContentsEqual } from "@/features/diff/lib/diff-content";
import {
  editorCache,
  editorSaveCoordinator,
  cancelEditorChange,
} from "./editor-runtime";
import { toGitRelativePath } from "./editor-git-actions";

interface DiscardFileChangesResult {
  success: boolean;
  noChanges?: boolean;
}

interface DiscardFileChangesOptions {
  skipChangeCheck?: boolean;
}

// 放弃某个文件的全部编辑器内更改与磁盘工作区修改。
// 用于工具栏、diff 弹窗等多入口的"放弃更改"操作。
export async function discardFileChanges(
  repositoryRoot: string,
  filePath: string,
  electron: ReturnType<typeof useElectron>,
  options: DiscardFileChangesOptions = {},
): Promise<DiscardFileChangesResult> {
  const relativePath = toGitRelativePath(repositoryRoot, filePath);
  const editorFilePath = toEditorFilePath(repositoryRoot, relativePath);
  const editorState = useEditorStore.getState();
  const editorPathKeys = new Set([editorFilePath]);
  const matchingTabs = editorState.panelGroups.flatMap((group) =>
    group.tabs.filter((tab) =>
      matchesDiscardFile(tab.filePath, editorFilePath),
    ),
  );
  const hasEditorChange = matchingTabs.some((tab) => tab.isDirty);

  const statusResult = await electron.getGitStatus(repositoryRoot);
  if (
    !options.skipChangeCheck &&
    !hasEditorChange &&
    statusResult.code === CodeResult.Success &&
    statusResult.data &&
    !hasDiscardableFileChange(statusResult.data, relativePath)
  ) {
    if (matchingTabs.length === 0) {
      return { success: true, noChanges: true };
    }
    // 保存状态与 Git 状态都可能短暂为 clean，最终仍需以编辑器文本和 HEAD 的差异为准。
    const headResult = await electron.getFileHeadContent(
      repositoryRoot,
      relativePath,
    );
    const hasEditorContentChange =
      headResult.code === CodeResult.Success &&
      matchingTabs.some(
        (tab) => !areDiffContentsEqual(headResult.data ?? "", tab.content),
      );
    if (!hasEditorContentChange) {
      return { success: true, noChanges: true };
    }
  }

  // 取消所有匹配标签的编辑器变更与待保存任务，避免恢复后被旧内容覆盖。
  for (const group of editorState.panelGroups) {
    for (const tab of group.tabs) {
      if (matchesDiscardFile(tab.filePath, editorFilePath)) {
        cancelEditorChange(group.id, tab.id);
        if (tab.filePath) {
          editorPathKeys.add(tab.filePath);
        }
      }
    }
  }
  await Promise.all(
    [...editorPathKeys].map((path) =>
      editorSaveCoordinator.cancelAndWait(path),
    ),
  );

  const result = await electron.discardChanges(repositoryRoot, relativePath);
  if (result.code !== CodeResult.Success) {
    return { success: false };
  }

  editorSaveCoordinator.cancel(editorFilePath);
  editorCache.delete(editorFilePath);
  for (const group of useEditorStore.getState().panelGroups) {
    for (const tab of group.tabs) {
      if (matchesDiscardFile(tab.filePath, editorFilePath) && tab.filePath) {
        editorSaveCoordinator.cancel(tab.filePath);
        editorCache.delete(tab.filePath);
      }
    }
  }

  try {
    const content = await window.electronAPI.readFile(editorFilePath);
    editorCache.setContent(editorFilePath, content);

    const latest = useEditorStore.getState();
    for (const group of latest.panelGroups) {
      for (const tab of group.tabs) {
        if (matchesDiscardFile(tab.filePath, editorFilePath)) {
          const tabFilePath = tab.filePath ?? editorFilePath;
          editorCache.setContent(tabFilePath, content);
          latest.completeTabLoad(group.id, tab.id, tabFilePath, content);
        }
      }
    }
    useTreeStore.getState().updateNodeContent(editorFilePath, content);
  } catch {
    // 未跟踪文件会被 Git 操作删除，此时将相关标签恢复为空白状态。
    const latest = useEditorStore.getState();
    for (const group of latest.panelGroups) {
      for (const tab of group.tabs) {
        if (matchesDiscardFile(tab.filePath, editorFilePath)) {
          latest.resetTab(group.id, tab.id);
        }
      }
    }
  }

  await electron.loadTree(repositoryRoot);
  return { success: true };
}

function hasDiscardableFileChange(
  status: NonNullable<
    Awaited<ReturnType<ReturnType<typeof useElectron>["getGitStatus"]>>["data"]
  >,
  filePath: string,
): boolean {
  const normalizedPath = normalizeGitPath(filePath);
  const directPaths = [
    ...status.created,
    ...status.not_added,
    ...status.modified,
    ...status.deleted,
    ...status.staged,
    ...status.conflicted,
  ];

  return (
    directPaths.some(
      (candidate) => normalizeGitPath(candidate) === normalizedPath,
    ) ||
    status.files.some(
      (file) => normalizeGitPath(file.path) === normalizedPath,
    ) ||
    status.renamed.some(
      (file) =>
        normalizeGitPath(file.from) === normalizedPath ||
        normalizeGitPath(file.to) === normalizedPath,
    )
  );
}

function normalizeGitPath(path: string): string {
  return path.replace(/\\/g, "/").toLocaleLowerCase();
}

// diff 入口可能传入 Git 相对路径，编辑器、缓存和保存队列统一使用绝对路径。
function toEditorFilePath(
  repositoryRoot: string,
  relativePath: string,
): string {
  const separator = repositoryRoot.includes("\\") ? "\\" : "/";
  const normalizedRoot = repositoryRoot.replace(/[/\\]+$/, "");
  const normalizedRelative = relativePath
    .replace(/[/\\]/g, separator)
    .replace(/^[/\\]+/, "");
  return `${normalizedRoot}${separator}${normalizedRelative}`;
}

function matchesDiscardFile(
  candidatePath: string | null,
  editorFilePath: string,
): boolean {
  if (candidatePath === null) return false;

  const normalizedCandidate = candidatePath.replace(/\\/g, "/");
  const normalizedEditorPath = editorFilePath.replace(/\\/g, "/");
  if (/^(?:[a-z]:|\/\/)/i.test(normalizedEditorPath)) {
    return (
      normalizedCandidate.toLocaleLowerCase() ===
      normalizedEditorPath.toLocaleLowerCase()
    );
  }
  return normalizedCandidate === normalizedEditorPath;
}
