import {
  ArrowLeftRight,
  FolderSearch,
  GitCompare,
  MoreHorizontal,
  PictureInPicture2,
  Plus,
  SplitSquareHorizontal,
  SplitSquareVertical,
  Undo2,
} from "lucide-react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { useEditorTabActions } from "../lib/use-editor-tab-actions";

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
  const {
    confirmDiscard,
    handleDiff,
    handleDiscard,
    handleModeToggle,
    handleOpenFloatingWindow,
    handleRevealInFileManager,
    revealInFileManagerLabel,
    setConfirmDiscard,
    showGitActions,
    tab,
  } = useEditorTabActions({
    groupId,
    onNewTab,
    onSplitRight,
    onSplitDown,
  });

  return (
    <>
      <DropdownMenu.Root modal={false}>
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
            {tab ? (
              <EditorActionMenuItem
                icon={<PictureInPicture2 className="h-3.5 w-3.5" />}
                onSelect={() => void handleOpenFloatingWindow()}
              >
                浮动窗口
              </EditorActionMenuItem>
            ) : null}
            {tab?.filePath && !tab.pendingFilePath ? (
              <EditorActionMenuItem
                icon={<FolderSearch className="h-3.5 w-3.5" />}
                onSelect={handleRevealInFileManager}
              >
                {revealInFileManagerLabel}
              </EditorActionMenuItem>
            ) : null}
            {tab ? (
              <>
                <DropdownMenu.Separator className="my-1 h-px bg-[var(--border-color)]" />
                <EditorActionMenuItem
                  icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
                  onSelect={handleModeToggle}
                >
                  编辑模式切换
                </EditorActionMenuItem>
              </>
            ) : null}
            <DropdownMenu.Separator className="my-1 h-px bg-[var(--border-color)]" />
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
        description={`确定要放弃 "${tab?.filePath?.split(/[\\/]/).pop() ?? "当前文件"}" 的更改吗？`}
        variant="warning"
        confirmText="确定"
        onConfirm={handleDiscard}
      />
    </>
  );
}

function EditorActionMenuItem({
  icon,
  disabled = false,
  title,
  onSelect,
  children,
}: {
  icon: React.ReactNode;
  disabled?: boolean;
  title?: string;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      title={title}
      className="flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none data-[disabled]:opacity-45 data-[highlighted]:bg-[var(--selection-row-hover)]"
      style={{ color: "var(--text-primary)" }}
      onSelect={onSelect}
    >
      <span className="flex h-4 w-4 items-center justify-center">{icon}</span>
      <span>{children}</span>
    </DropdownMenu.Item>
  );
}
