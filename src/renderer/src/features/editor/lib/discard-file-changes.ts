import { useElectron } from "@/hooks/use-electron";
import { useEditorStore } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import { CodeResult } from "@/types";
import {
  editorCache,
  editorSaveCoordinator,
  cancelEditorChange,
} from "./editor-runtime";
import { toGitRelativePath } from "./editor-git-actions";

// 放弃某个文件的全部编辑器内更改与磁盘工作区修改。
// 用于工具栏、diff 弹窗等多入口的"放弃更改"操作。
export async function discardFileChanges(
  repositoryRoot: string,
  filePath: string,
  electron: ReturnType<typeof useElectron>,
): Promise<{ success: boolean }> {
  const relativePath = toGitRelativePath(repositoryRoot, filePath);

  // 取消所有匹配标签的编辑器变更与待保存任务，避免恢复后被旧内容覆盖。
  const editorState = useEditorStore.getState();
  for (const group of editorState.panelGroups) {
    for (const tab of group.tabs) {
      if (tab.filePath === filePath) {
        cancelEditorChange(group.id, tab.id);
      }
    }
  }
  editorSaveCoordinator.cancel(filePath);

  const result = await electron.discardChanges(repositoryRoot, relativePath);
  if (result.code !== CodeResult.Success) {
    return { success: false };
  }

  editorSaveCoordinator.cancel(filePath);
  editorCache.delete(filePath);

  try {
    const content = await window.electronAPI.readFile(filePath);
    editorCache.setContent(filePath, content);

    const latest = useEditorStore.getState();
    for (const group of latest.panelGroups) {
      for (const tab of group.tabs) {
        if (tab.filePath === filePath) {
          latest.completeTabLoad(group.id, tab.id, filePath, content);
        }
      }
    }
    useTreeStore.getState().updateNodeContent(filePath, content);
  } catch {
    // 未跟踪文件会被 Git 操作删除，此时将相关标签恢复为空白状态。
    const latest = useEditorStore.getState();
    for (const group of latest.panelGroups) {
      for (const tab of group.tabs) {
        if (tab.filePath === filePath) {
          latest.resetTab(group.id, tab.id);
        }
      }
    }
  }

  await electron.loadTree(repositoryRoot);
  return { success: true };
}
