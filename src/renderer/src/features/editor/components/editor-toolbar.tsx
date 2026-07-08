import { useCallback, useEffect, useState } from "react";
import {
  Code2,
  FileText,
  GitCompare,
  MoreHorizontal,
  Plus,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Undo2,
} from "lucide-react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { useElectron } from "@/hooks/use-electron";
import { useDiffStore } from "@/store/diff.store";
import { useEditorStore, type EditorMode } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import { CodeResult } from "@/types";
import {
  showNoDiffChangesToast,
  showNoDiffContentToast,
} from "@/features/diff/lib/diff-toast";
import { areDiffContentsEqual } from "@/features/diff/lib/diff-content";
import { hasNoHeadVersion, toGitRelativePath } from "../lib/editor-git-actions";
import { flushEditorChange } from "../lib/editor-runtime";
import { discardFileChanges } from "../lib/discard-file-changes";

interface EditorToolbarProps {
  groupId: string;
  onNewTab: () => void;
  onSplitRight: () => void;
  onSplitDown: () => void;
}

export function EditorToolbar({
  groupId,
  onNewTab,
  onSplitRight,
  onSplitDown,
}: EditorToolbarProps) {
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

    if (areDiffContentsEqual(headContent, editorContent)) {
      showNoDiffContentToast();
      return;
    }

    openDiff(filePath, headContent, editorContent);
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
    const result = await discardFileChanges(repositoryRoot, tab.filePath, {
      detectGitRepo,
      discardChanges,
      getFileHeadContent,
      getGitStatus,
      loadTree,
    });
    if (result.noChanges) {
      showNoDiffChangesToast();
    }
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

  const showGitActions =
    isGitRepo && Boolean(tab.filePath && !tab.pendingFilePath);

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
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label="标签页操作"
            title="标签页操作"
            className="flex h-full w-9 items-center justify-center text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] data-[state=open]:bg-[var(--hover-bg)] data-[state=open]:text-[var(--text-primary)]"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-[9999] min-w-[176px] rounded-lg border p-1 shadow-lg"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-color)",
            }}
          >
            <EditorActionMenuItem
              icon={<Plus className="h-3.5 w-3.5" />}
              onSelect={onNewTab}
            >
              新建标签页
            </EditorActionMenuItem>
            <EditorActionMenuItem
              icon={<SplitSquareHorizontal className="h-3.5 w-3.5" />}
              onSelect={onSplitRight}
            >
              向右拆分面板
            </EditorActionMenuItem>
            <EditorActionMenuItem
              icon={<SplitSquareVertical className="h-3.5 w-3.5" />}
              onSelect={onSplitDown}
            >
              向下拆分面板
            </EditorActionMenuItem>
            {showGitActions ? (
              <>
                <DropdownMenu.Separator className="my-1 h-px bg-[var(--border-color)]" />
                <EditorActionMenuItem
                  icon={<GitCompare className="h-3.5 w-3.5" />}
                  onSelect={() => void handleDiff()}
                >
                  比较差异
                </EditorActionMenuItem>
                <EditorActionMenuItem
                  icon={<Undo2 className="h-3.5 w-3.5" />}
                  onSelect={() => setConfirmDiscard(true)}
                >
                  放弃更改
                </EditorActionMenuItem>
              </>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
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

function EditorActionMenuItem({
  icon,
  disabled = false,
  onSelect,
  children,
}: {
  icon: React.ReactNode;
  disabled?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      className="flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none data-[disabled]:opacity-45 data-[highlighted]:bg-[var(--hover-bg)]"
      style={{ color: "var(--text-primary)" }}
      onSelect={onSelect}
    >
      <span className="flex h-4 w-4 items-center justify-center">{icon}</span>
      <span>{children}</span>
    </DropdownMenu.Item>
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
