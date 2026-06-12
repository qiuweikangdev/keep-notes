import { useCallback, useEffect, useState } from "react";
import { Code2, FileText, GitCompare, Undo2 } from "lucide-react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useElectron } from "@/hooks/use-electron";
import { useDiffStore } from "@/store/diff.store";
import { useEditorStore, type EditorMode } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import { CodeResult } from "@/types";
import { hasNoHeadVersion, toGitRelativePath } from "../lib/editor-git-actions";
import { flushEditorChange } from "../lib/editor-runtime";
import { discardFileChanges } from "../lib/discard-file-changes";

interface EditorToolbarProps {
  groupId: string;
}

export function EditorToolbar({ groupId }: EditorToolbarProps) {
  const tab = useEditorStore((state) => {
    const group = state.panelGroups.find((item) => item.id === groupId);
    return group?.tabs.find((item) => item.id === group.activeTabId);
  });
  const repositoryRoot = useTreeStore((state) => state.treeRoot?.key ?? null);
  const showModeSwitcher = useEditorStore(
    (state) => state.appearance.showModeSwitcher,
  );
  const setTabMode = useEditorStore((state) => state.setTabMode);
  const setTabParseError = useEditorStore((state) => state.setTabParseError);
  const openDiff = useDiffStore((state) => state.openDiff);
  const closeDiff = useDiffStore((state) => state.closeDiff);
  const updateContent = useDiffStore((state) => state.updateContent);
  const {
    detectGitRepo,
    discardChanges,
    getFileHeadContent,
    getGitStatus,
    loadTree,
  } = useElectron();
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
    const filePath = tab.filePath;
    // 立即打开弹窗并标记为加载中，避免空内容闪烁成"无差异"。
    openDiff(filePath, "", "");

    // 等待 BlockNote 组件注册的 flusher 把未落盘编辑同步到 store。
    await flushEditorChange(groupId, tab.id);

    // 条件等待：编辑器首次打开时，parseMarkdown 异步完成后才会通过 serializeChange
    // 把内容写回 store。这里轮询直到所有 group 中匹配 filePath 的 tab.content 非空为止。
    const startTime = Date.now();
    const MAX_WAIT_MS = 2000;
    let matchedTab = useEditorStore
      .getState()
      .panelGroups.flatMap((g) => g.tabs)
      .find((t) => t.filePath === filePath);
    while (Date.now() - startTime < MAX_WAIT_MS) {
      if (matchedTab && matchedTab.content !== "") break;
      await new Promise((r) => setTimeout(r, 50));
      matchedTab = useEditorStore
        .getState()
        .panelGroups.flatMap((g) => g.tabs)
        .find((t) => t.filePath === filePath);
    }
    const editorContent = matchedTab?.content ?? "";

    const relativePath = toGitRelativePath(repositoryRoot, filePath);
    const result = await getFileHeadContent(repositoryRoot, relativePath);
    let headContent = result.data ?? "";

    if (result.code !== CodeResult.Success) {
      const statusResult = await getGitStatus(repositoryRoot);
      if (
        statusResult.code !== CodeResult.Success ||
        !statusResult.data ||
        !hasNoHeadVersion(statusResult.data, relativePath)
      ) {
        closeDiff();
        return;
      }
      // 未跟踪或首次新增的文件在 HEAD 中没有内容，以空文件作为差异基线。
      headContent = "";
    }

    updateContent(headContent, editorContent);
  }, [
    closeDiff,
    getFileHeadContent,
    getGitStatus,
    groupId,
    openDiff,
    repositoryRoot,
    tab,
    updateContent,
  ]);

  const handleDiscard = useCallback(async () => {
    if (!tab?.filePath || !repositoryRoot) return;
    await discardFileChanges(repositoryRoot, tab.filePath, {
      detectGitRepo,
      discardChanges,
      getFileHeadContent,
      getGitStatus,
      loadTree,
    });
  }, [
    detectGitRepo,
    discardChanges,
    getFileHeadContent,
    getGitStatus,
    loadTree,
    repositoryRoot,
    tab,
  ]);

  if (!tab) return null;

  return (
    <>
      {showModeSwitcher ? (
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
      ) : null}
      {isGitRepo && tab.filePath && !tab.pendingFilePath ? (
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
        title="确认放弃更改"
        description={`确定要放弃 "${tab.filePath?.split(/[\\/]/).pop() ?? "当前文件"}" 的更改吗？`}
        confirmText="确定"
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
