import { useCallback, useEffect, useState } from "react";
import { Code2, FileText, GitCompare, Undo2 } from "lucide-react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useElectron } from "@/hooks/use-electron";
import { useDiffStore } from "@/store/diff.store";
import { useEditorStore, type EditorMode } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import { CodeResult } from "@/types";
import { toGitRelativePath } from "../lib/editor-git-actions";
import {
  cancelEditorChange,
  editorCache,
  editorSaveCoordinator,
  flushEditorChange,
} from "../lib/editor-runtime";

interface EditorToolbarProps {
  groupId: string;
}

export function EditorToolbar({ groupId }: EditorToolbarProps) {
  const tab = useEditorStore((state) => {
    const group = state.panelGroups.find((item) => item.id === groupId);
    return group?.tabs.find((item) => item.id === group.activeTabId);
  });
  const repositoryRoot = useTreeStore((state) => state.treeRoot?.key ?? null);
  const setTabMode = useEditorStore((state) => state.setTabMode);
  const setTabParseError = useEditorStore((state) => state.setTabParseError);
  const openDiff = useDiffStore((state) => state.openDiff);
  const { detectGitRepo, discardChanges, getFileHeadContent, loadTree } =
    useElectron();
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    let active = true;
    if (!repositoryRoot) {
      setIsGitRepo(false);
      return;
    }

    void detectGitRepo(repositoryRoot).then((result) => {
      if (active) {
        setIsGitRepo(
          result.code === CodeResult.Success && result.data?.isGitRepo === true,
        );
      }
    });
    return () => {
      active = false;
    };
  }, [detectGitRepo, repositoryRoot]);

  const handleModeChange = useCallback(
    async (mode: EditorMode) => {
      if (!tab || tab.mode === mode) return;
      if (tab.mode === "rich" && mode === "source") {
        await flushEditorChange(groupId, tab.id);
      }
      if (mode === "rich") {
        setTabParseError(groupId, tab.id, null);
      }
      setTabMode(groupId, tab.id, mode);
    },
    [groupId, setTabMode, setTabParseError, tab],
  );

  const handleDiff = useCallback(async () => {
    if (!tab?.filePath || !repositoryRoot) return;
    await flushEditorChange(groupId, tab.id);

    const currentTab = useEditorStore
      .getState()
      .panelGroups.find((group) => group.id === groupId)
      ?.tabs.find((item) => item.id === tab.id);
    const relativePath = toGitRelativePath(repositoryRoot, tab.filePath);
    const result = await getFileHeadContent(repositoryRoot, relativePath);
    if (result.code !== CodeResult.Success) return;

    openDiff(
      tab.filePath,
      result.data ?? "",
      currentTab?.content ?? tab.content,
    );
  }, [getFileHeadContent, groupId, openDiff, repositoryRoot, tab]);

  const handleDiscard = useCallback(async () => {
    if (!tab?.filePath || !repositoryRoot) return;
    const path = tab.filePath;
    const relativePath = toGitRelativePath(repositoryRoot, path);

    // 放弃更改必须先停止编辑器序列化与自动保存，防止恢复后的文件再次被旧内容覆盖。
    cancelEditorChange(groupId, tab.id);
    editorSaveCoordinator.cancel(path);
    const result = await discardChanges(repositoryRoot, relativePath);
    if (result.code !== CodeResult.Success) return;

    editorSaveCoordinator.cancel(path);
    editorCache.delete(path);
    try {
      const content = await window.electronAPI.readFile(path);
      editorCache.setContent(path, content);
      const state = useEditorStore.getState();
      state.panelGroups.forEach((group) => {
        group.tabs.forEach((item) => {
          if (item.filePath === path) {
            state.completeTabLoad(group.id, item.id, path, content);
          }
        });
      });
      useTreeStore.getState().updateNodeContent(path, content);
    } catch {
      // 未跟踪文件会被 Git 操作删除，此时将相关标签恢复为空白状态。
      const state = useEditorStore.getState();
      state.panelGroups.forEach((group) => {
        group.tabs.forEach((item) => {
          if (item.filePath === path) {
            state.resetTab(group.id, item.id);
          }
        });
      });
    }
    await loadTree(repositoryRoot);
  }, [discardChanges, groupId, loadTree, repositoryRoot, tab]);

  if (!tab) return null;

  return (
    <>
      <div className="flex rounded-md bg-[var(--bg-tertiary)] p-0.5">
        <ModeButton
          active={tab.mode === "rich"}
          icon={<FileText className="h-3.5 w-3.5" />}
          onClick={() => void handleModeChange("rich")}
        >
          富文本
        </ModeButton>
        <ModeButton
          active={tab.mode === "source"}
          icon={<Code2 className="h-3.5 w-3.5" />}
          onClick={() => void handleModeChange("source")}
        >
          源码
        </ModeButton>
      </div>
      {isGitRepo && tab.filePath ? (
        <div className="ml-1 flex items-center">
          <ToolbarIconButton
            label="比较当前文件差异"
            onClick={() => void handleDiff()}
          >
            <GitCompare className="h-3.5 w-3.5" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label="放弃当前文件更改"
            danger
            onClick={() => setConfirmDiscard(true)}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </ToolbarIconButton>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="放弃文件更改"
        description={`将恢复“${tab.filePath?.split(/[\\/]/).pop() ?? "当前文件"}”到 Git 中的版本，此操作无法撤销。`}
        confirmText="放弃更改"
        variant="danger"
        onConfirm={handleDiscard}
      />
    </>
  );
}

function ModeButton({
  active,
  icon,
  children,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px]"
      aria-pressed={active}
      style={{
        backgroundColor: active ? "var(--bg-primary)" : "transparent",
        color: active ? "var(--text-primary)" : "var(--text-muted)",
        boxShadow: active ? "0 1px 2px rgba(0, 0, 0, 0.08)" : "none",
      }}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}

function ToolbarIconButton({
  label,
  danger = false,
  children,
  onClick,
}: {
  label: string;
  danger?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
      style={danger ? { color: "var(--danger-color)" } : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
