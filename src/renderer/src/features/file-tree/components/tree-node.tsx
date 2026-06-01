import {
  useState,
  useCallback,
  useRef,
  useEffect,
  memo,
  type KeyboardEvent,
} from "react";
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Plus,
  FolderPlus,
  Pencil,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { useTreeStore } from "@/store/tree.store";
import { useEditorStore } from "@/store/editor.store";
import { useElectron } from "@/hooks/use-electron";
import { cn } from "@/lib/cn";
import type { TreeNode as TreeNodeType } from "@/types";
import { ContextMenu } from "@/components/ui/context-menu";
import { CodeResult } from "@/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface TreeNodeProps {
  node: TreeNodeType;
  level: number;
}

const MENU_CONTENT_CLASS =
  "z-[9999] min-w-[180px] rounded-md border p-1 shadow-lg bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-primary)]";
const MENU_ITEM_CLASS =
  "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-[var(--hover-bg)]";
const MENU_SEPARATOR_CLASS = "my-1 h-px bg-[var(--border-color)]";

const normalizePath = (path: string) =>
  path.replace(/\\/g, "/").replace(/\/+$/, "");

export const TreeNode = memo(function TreeNode({ node, level }: TreeNodeProps) {
  const {
    selectedKey,
    setSelectedKey,
    expandedKeys,
    toggleExpandedKey,
    setTreeData,
    treeData,
  } = useTreeStore();
  const { filePath } = useEditorStore();
  const {
    openFile,
    createFile,
    createFolder,
    renameItem,
    deleteItem,
    moveItem,
    openInExplorer,
  } = useElectron();

  const [isHovered, setIsHovered] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isCreating, setIsCreating] = useState<"file" | "folder" | null>(null);
  const [createValue, setCreateValue] = useState("");
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    type: "delete" | "move";
    open: boolean;
    data?: {
      key: string;
      title: string;
      sourcePath?: string;
      targetPath?: string;
    };
  }>({ type: "delete", open: false });

  const renameInputRef = useRef<HTMLInputElement>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const isExpanded = expandedKeys.includes(node.key);
  const isSelected = selectedKey === node.key || filePath === node.key;
  const isFolder = Array.isArray(node.children);
  const hasChildren = Boolean(node.children?.length);
  const isMarkdown = node.title.endsWith(".md");

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    if (isCreating && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [isCreating]);

  const handleClick = useCallback(() => {
    setSelectedKey(node.key);
    if (isFolder) {
      toggleExpandedKey(node.key);
      return;
    }
    if (isMarkdown) {
      void openFile(node.key);
    }
  }, [
    node.key,
    isFolder,
    isMarkdown,
    setSelectedKey,
    toggleExpandedKey,
    openFile,
  ]);

  const handleOpen = useCallback(() => {
    if (isMarkdown) {
      void openFile(node.key);
      setSelectedKey(node.key);
    }
  }, [isMarkdown, node.key, openFile, setSelectedKey]);

  const handleStartCreateFile = useCallback(() => {
    if (!isFolder) return;
    setIsCreating("file");
    setCreateValue("");
  }, [isFolder]);

  const handleStartCreateFolder = useCallback(() => {
    if (!isFolder) return;
    setIsCreating("folder");
    setCreateValue("");
  }, [isFolder]);

  const handleCreateConfirm = useCallback(async () => {
    if (!isFolder || !isCreating) {
      setIsCreating(null);
      return;
    }

    const title = createValue.trim();
    if (!title) {
      setIsCreating(null);
      return;
    }

    const fn = isCreating === "file" ? createFile : createFolder;
    const result = await fn(node.key, title, treeData);
    if (result.code === CodeResult.Success && result.data) {
      setTreeData(result.data.treeData);
      if (!isExpanded) {
        toggleExpandedKey(node.key);
      }
    }

    setIsCreating(null);
    setCreateValue("");
  }, [
    isFolder,
    isCreating,
    createValue,
    createFile,
    createFolder,
    node.key,
    treeData,
    setTreeData,
    isExpanded,
    toggleExpandedKey,
  ]);

  const handleCreateKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        void handleCreateConfirm();
      }
      if (e.key === "Escape") {
        setIsCreating(null);
        setCreateValue("");
      }
    },
    [handleCreateConfirm],
  );

  const handleStartRename = useCallback(() => {
    setRenameValue(node.title.replace(/\.md$/, ""));
    setIsRenaming(true);
  }, [node.title]);

  const handleRenameConfirm = useCallback(async () => {
    const title = renameValue.trim();
    const current = node.title.replace(/\.md$/, "");
    if (!title || title === current) {
      setIsRenaming(false);
      return;
    }

    const result = await renameItem(node.key, title, treeData);
    if (result.code === CodeResult.Success && result.data) {
      setTreeData(result.data.treeData);
    }
    setIsRenaming(false);
  }, [renameValue, node.title, node.key, renameItem, treeData, setTreeData]);

  const handleRenameKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        void handleRenameConfirm();
      }
      if (e.key === "Escape") {
        setIsRenaming(false);
      }
    },
    [handleRenameConfirm],
  );

  const handleDelete = useCallback(() => {
    setConfirmState({
      type: "delete",
      open: true,
      data: { key: node.key, title: node.title },
    });
  }, [node.key, node.title]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!confirmState.data) return;

    const { key, title } = confirmState.data;
    const result = await deleteItem(key, title, treeData);
    if (result.code === CodeResult.Success && result.data) {
      setTreeData(result.data.treeData);
    }
  }, [confirmState.data, deleteItem, treeData, setTreeData]);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", node.key);
      e.dataTransfer.effectAllowed = "move";
      if (rowRef.current) {
        rowRef.current.style.opacity = "0.5";
      }
    },
    [node.key],
  );

  const handleDragEnd = useCallback(() => {
    if (rowRef.current) {
      rowRef.current.style.opacity = "1";
    }
    setIsDropTarget(false);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isFolder) return;
      const sourcePath = e.dataTransfer.getData("text/plain");
      if (!sourcePath) return;

      const normalizedSource = normalizePath(sourcePath);
      const normalizedTarget = normalizePath(node.key);

      if (
        normalizedSource === normalizedTarget ||
        normalizedTarget.startsWith(`${normalizedSource}/`)
      ) {
        return;
      }

      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setIsDropTarget(true);
    },
    [isFolder, node.key],
  );

  const handleDragLeave = useCallback(() => {
    setIsDropTarget(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!isFolder) return;
      e.preventDefault();

      const sourcePath = e.dataTransfer.getData("text/plain");
      if (!sourcePath) {
        setIsDropTarget(false);
        return;
      }

      const normalizedSource = normalizePath(sourcePath);
      const normalizedTarget = normalizePath(node.key);

      if (
        normalizedSource === normalizedTarget ||
        normalizedTarget.startsWith(`${normalizedSource}/`)
      ) {
        setIsDropTarget(false);
        return;
      }

      setConfirmState({
        type: "move",
        open: true,
        data: {
          sourcePath,
          targetPath: node.key,
          key: sourcePath,
          title: sourcePath.split(/[\\/]/).pop() || sourcePath,
        },
      });
      setIsDropTarget(false);
    },
    [isFolder, node.key],
  );

  const handleDropConfirm = useCallback(async () => {
    if (!confirmState.data?.sourcePath || !confirmState.data?.targetPath)
      return;

    const result = await moveItem(
      confirmState.data.sourcePath,
      confirmState.data.targetPath,
      treeData,
    );
    if (result.code === CodeResult.Success && result.data) {
      setTreeData(result.data.treeData);
      if (!isExpanded) {
        toggleExpandedKey(node.key);
      }
    }
  }, [
    confirmState.data,
    moveItem,
    treeData,
    setTreeData,
    isExpanded,
    toggleExpandedKey,
    node.key,
  ]);

  const icon = isFolder ? (
    isExpanded ? (
      <FolderOpen className="h-[18px] w-[18px]" style={{ color: "#dcb67a" }} />
    ) : (
      <Folder className="h-[18px] w-[18px]" style={{ color: "#dcb67a" }} />
    )
  ) : (
    <File className="h-[18px] w-[18px]" style={{ color: "#519aba" }} />
  );

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div ref={rowRef}>
            <div
              className={cn(
                "relative flex h-[22px] cursor-pointer select-none items-center transition-colors duration-75",
                isSelected
                  ? "bg-[var(--active-bg)]"
                  : isHovered
                    ? "bg-[var(--hover-bg)]"
                    : "bg-transparent",
                isDropTarget && "bg-[var(--hover-bg)]",
              )}
              style={{
                paddingLeft: `${level * 16 + 4}px`,
                paddingRight: "4px",
              }}
              onClick={handleClick}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => {
                setIsHovered(false);
                setIsDropTarget(false);
              }}
              draggable={!isRenaming && !isCreating}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isSelected ? (
                <div
                  className="absolute left-0 top-0 bottom-0 w-[2px]"
                  style={{ backgroundColor: "var(--accent-color)" }}
                />
              ) : null}

              <div className="flex h-[22px] w-[16px] flex-shrink-0 items-center justify-center">
                {isFolder ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpandedKey(node.key);
                    }}
                    className="flex h-[16px] w-[16px] items-center justify-center rounded-sm hover:bg-[var(--hover-bg)]"
                  >
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 transition-transform duration-100",
                        isExpanded && "rotate-90",
                      )}
                      style={{ color: "var(--text-muted)" }}
                    />
                  </button>
                ) : null}
              </div>

              <div className="mr-[4px] flex h-[22px] w-[18px] flex-shrink-0 items-center justify-center">
                {icon}
              </div>

              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  onBlur={() => void handleRenameConfirm()}
                  onClick={(e) => e.stopPropagation()}
                  className="h-[20px] flex-1 rounded-[3px] px-[3px] text-[13px] outline-none"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    border: "1px solid var(--accent-color)",
                    color: "var(--text-primary)",
                  }}
                />
              ) : isCreating ? (
                <input
                  ref={createInputRef}
                  value={createValue}
                  onChange={(e) => setCreateValue(e.target.value)}
                  onKeyDown={handleCreateKeyDown}
                  onBlur={() => void handleCreateConfirm()}
                  onClick={(e) => e.stopPropagation()}
                  placeholder={
                    isCreating === "file" ? "新建文件" : "新建文件夹"
                  }
                  className="h-[20px] flex-1 rounded-[3px] px-[3px] text-[13px] outline-none"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    border: "1px solid var(--accent-color)",
                    color: "var(--text-primary)",
                  }}
                />
              ) : (
                <span
                  className="flex-1 truncate text-[13px] leading-[22px]"
                  style={{ color: "var(--text-primary)" }}
                >
                  {node.title}
                </span>
              )}

              {isHovered && !isRenaming && !isCreating ? (
                <div className="absolute right-[4px] top-0 bottom-0 z-10 flex items-center gap-[1px]">
                  {isFolder ? (
                    <button
                      type="button"
                      className="flex h-[20px] w-[20px] items-center justify-center rounded-[3px] hover:bg-[var(--bg-tertiary)]"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartCreateFile();
                      }}
                      title="新建文件"
                    >
                      <Plus
                        className="h-3 w-3"
                        style={{ color: "var(--text-muted)" }}
                      />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="flex h-[20px] w-[20px] items-center justify-center rounded-[3px] hover:bg-[var(--bg-tertiary)]"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartRename();
                    }}
                    title="重命名"
                  >
                    <Pencil
                      className="h-3 w-3"
                      style={{ color: "var(--text-muted)" }}
                    />
                  </button>
                  <button
                    type="button"
                    className="flex h-[20px] w-[20px] items-center justify-center rounded-[3px] hover:bg-[var(--bg-tertiary)]"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete();
                    }}
                    title="删除"
                  >
                    <Trash2
                      className="h-3 w-3"
                      style={{ color: "var(--text-muted)" }}
                    />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </ContextMenu.Trigger>

        <ContextMenu.Portal>
          <ContextMenu.Content className={MENU_CONTENT_CLASS}>
            {isMarkdown ? (
              <ContextMenu.Item
                className={MENU_ITEM_CLASS}
                onClick={handleOpen}
              >
                <File className="h-4 w-4" /> 打开
              </ContextMenu.Item>
            ) : null}

            {isFolder ? (
              <>
                <ContextMenu.Item
                  className={MENU_ITEM_CLASS}
                  onClick={handleStartCreateFile}
                >
                  <Plus className="h-4 w-4" /> 新建文件
                </ContextMenu.Item>
                <ContextMenu.Item
                  className={MENU_ITEM_CLASS}
                  onClick={handleStartCreateFolder}
                >
                  <FolderPlus className="h-4 w-4" /> 新建文件夹
                </ContextMenu.Item>
                <ContextMenu.Separator className={MENU_SEPARATOR_CLASS} />
              </>
            ) : null}

            <ContextMenu.Item
              className={MENU_ITEM_CLASS}
              onClick={handleStartRename}
            >
              <Pencil className="h-4 w-4" /> 重命名
            </ContextMenu.Item>
            <ContextMenu.Item
              className={MENU_ITEM_CLASS}
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" /> 删除
            </ContextMenu.Item>
            <ContextMenu.Separator className={MENU_SEPARATOR_CLASS} />
            <ContextMenu.Item
              className={MENU_ITEM_CLASS}
              onClick={() => void openInExplorer(node.key)}
            >
              <ExternalLink className="h-4 w-4" /> 在资源管理器中显示
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>

        {isExpanded && hasChildren ? (
          <div>
            {node.children!.map((child) => (
              <TreeNode key={child.key} node={child} level={level + 1} />
            ))}
          </div>
        ) : null}
      </ContextMenu.Root>

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((prev) => ({ ...prev, open }))}
        title={confirmState.type === "delete" ? "确认删除" : "确认移动"}
        description={
          confirmState.type === "delete"
            ? "确定要删除「" + (confirmState.data?.title ?? "") + "」吗？"
            : "确定要将「" +
              (confirmState.data?.title ?? "") +
              "」移动到「" +
              node.title +
              "」吗？"
        }
        confirmText={confirmState.type === "delete" ? "删除" : "移动"}
        variant={confirmState.type === "delete" ? "danger" : "default"}
        onConfirm={
          confirmState.type === "delete"
            ? handleDeleteConfirm
            : handleDropConfirm
        }
      />
    </>
  );
});
