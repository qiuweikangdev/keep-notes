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
import { useElectron } from "@/hooks/use-electron";
import { cn } from "@/lib/cn";
import type { TreeNode as TreeNodeType } from "@/types";
import { ContextMenu } from "@/components/ui/context-menu";
import { CodeResult } from "@/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface CreatingInfo {
  type: "file" | "folder";
  parentKey: string;
  level: number;
}

interface TreeNodeProps {
  node: TreeNodeType;
  level: number;
  creatingInfo?: CreatingInfo | null;
  onCreateInFolder?: (
    parentKey: string,
    type: "file" | "folder",
    level: number,
  ) => void;
}

const MENU_CONTENT_CLASS =
  "z-[9999] min-w-[180px] rounded-md border p-1 shadow-lg bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-primary)]";
const MENU_ITEM_CLASS =
  "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-[var(--hover-bg)]";
const MENU_SEPARATOR_CLASS = "my-1 h-px bg-[var(--border-color)]";

const normalizePath = (path: string) =>
  path.replace(/\\/g, "/").replace(/\/+$/, "");

export const TreeNode = memo(function TreeNode({
  node,
  level,
  creatingInfo,
  onCreateInFolder,
}: TreeNodeProps) {
  const {
    selectedKey,
    setSelectedKey,
    expandedKeys,
    toggleExpandedKey,
    setTreeData,
    treeData,
  } = useTreeStore();
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
  const [createValue, setCreateValue] = useState("");
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [dragCounter, setDragCounter] = useState(0);
  const confirmedRef = useRef(false);
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
  const isSelected = selectedKey === node.key;
  const isFolder = Array.isArray(node.children);
  const hasChildren = Boolean(node.children?.length);
  const isMarkdown = node.title.endsWith(".md");

  const isCreatingHere = creatingInfo?.parentKey === node.key;

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  useEffect(() => {
    if (isCreatingHere && createInputRef.current) {
      requestAnimationFrame(() => {
        createInputRef.current?.focus();
      });
    }
  }, [isCreatingHere]);

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
    if (isFolder) {
      onCreateInFolder?.(node.key, "file", level + 1);
    } else {
      const parentKey = node.key.substring(0, node.key.lastIndexOf("/"));
      onCreateInFolder?.(parentKey, "file", level);
    }
  }, [isFolder, node.key, level, onCreateInFolder]);

  const handleStartCreateFolder = useCallback(() => {
    if (isFolder) {
      onCreateInFolder?.(node.key, "folder", level + 1);
    } else {
      const parentKey = node.key.substring(0, node.key.lastIndexOf("/"));
      onCreateInFolder?.(parentKey, "folder", level);
    }
  }, [isFolder, node.key, level, onCreateInFolder]);

  const doCreate = useCallback(async () => {
    const title = createValue.trim();
    if (!title || !creatingInfo) {
      setCreateValue("");
      onCreateInFolder?.("", "file", 0);
      return;
    }

    const fn = creatingInfo.type === "file" ? createFile : createFolder;
    const result = await fn(node.key, title, treeData);
    if (result.code === CodeResult.Success && result.data) {
      setTreeData(result.data.treeData);
      if (!isExpanded) {
        toggleExpandedKey(node.key);
      }
      const newKey =
        creatingInfo.type === "file"
          ? `${node.key}/${title}.md`
          : `${node.key}/${title}`;
      setSelectedKey(newKey);
    }

    setCreateValue("");
    onCreateInFolder?.("", creatingInfo.type, creatingInfo.level);
  }, [
    createValue,
    creatingInfo,
    createFile,
    createFolder,
    node.key,
    treeData,
    setTreeData,
    setSelectedKey,
    isExpanded,
    toggleExpandedKey,
    onCreateInFolder,
  ]);

  const handleCreateKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmedRef.current = true;
        void doCreate();
      }
      if (e.key === "Escape") {
        confirmedRef.current = true;
        setCreateValue("");
        onCreateInFolder?.("", "file", 0);
      }
    },
    [doCreate, onCreateInFolder],
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
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setIsDropTarget(true);
    },
    [isFolder],
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!isFolder) return;
      e.preventDefault();
      setDragCounter((c) => c + 1);
      setIsDropTarget(true);
    },
    [isFolder],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!isFolder) return;
      e.preventDefault();
      setDragCounter((c) => {
        const next = c - 1;
        if (next === 0) {
          setIsDropTarget(false);
        }
        return next;
      });
    },
    [isFolder],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!isFolder) return;
      e.preventDefault();
      setDragCounter(0);
      setIsDropTarget(false);

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
      <FolderOpen className="h-[14px] w-[14px]" style={{ color: "#c9a227" }} />
    ) : (
      <Folder className="h-[14px] w-[14px]" style={{ color: "#c9a227" }} />
    )
  ) : (
    <File className="h-[14px] w-[14px]" style={{ color: "#519aba" }} />
  );

  const createInputRow = isCreatingHere ? (
    <div
      className="flex h-[26px] items-center animate-fade-in"
      style={{
        paddingLeft: `${creatingInfo!.level * 16 + 12}px`,
        paddingRight: "12px",
      }}
    >
      <div className="flex h-[26px] w-[12px] flex-shrink-0 items-center justify-center" />
      <div className="mr-[6px] flex h-[26px] w-[16px] flex-shrink-0 items-center justify-center">
        {creatingInfo!.type === "file" ? (
          <File className="h-[14px] w-[14px]" style={{ color: "#519aba" }} />
        ) : (
          <Folder className="h-[14px] w-[14px]" style={{ color: "#c9a227" }} />
        )}
      </div>
      <input
        ref={createInputRef}
        autoFocus
        value={createValue}
        onChange={(e) => setCreateValue(e.target.value)}
        onKeyDown={handleCreateKeyDown}
        onBlur={() => {
          if (confirmedRef.current) {
            confirmedRef.current = false;
            return;
          }
          setTimeout(() => void doCreate(), 100);
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder={
          creatingInfo!.type === "file" ? "输入文件名称" : "输入文件夹名称"
        }
        className="h-[22px] flex-1 rounded-[3px] px-[6px] text-[13px] outline-none"
        style={{
          backgroundColor: "var(--bg-tertiary)",
          border: "1px solid var(--accent-color)",
          color: "var(--text-primary)",
        }}
      />
    </div>
  ) : null;

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div ref={rowRef}>
            <div
              className={cn(
                "relative flex h-[26px] cursor-pointer select-none items-center transition-colors duration-75",
                isDropTarget &&
                  isFolder &&
                  "outline outline-1 outline-[var(--accent-color)]/40",
              )}
              style={{
                paddingLeft: `${level * 16 + 12}px`,
                paddingRight: "12px",
                backgroundColor: isSelected
                  ? "var(--active-bg)"
                  : isHovered
                    ? "var(--hover-bg)"
                    : "transparent",
              }}
              onClick={handleClick}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => {
                setIsHovered(false);
              }}
              draggable={!isRenaming && !isCreatingHere}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="flex h-[26px] w-[12px] flex-shrink-0 items-center justify-center">
                {isFolder ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpandedKey(node.key);
                    }}
                    className="flex h-[14px] w-[14px] items-center justify-center rounded-sm hover:bg-[var(--hover-bg)]"
                  >
                    <ChevronRight
                      className={cn(
                        "h-3 w-3 transition-transform duration-100",
                        isExpanded && "rotate-90",
                      )}
                      style={{ color: "var(--text-muted)" }}
                    />
                  </button>
                ) : null}
              </div>

              <div className="mr-[6px] flex h-[26px] w-[16px] flex-shrink-0 items-center justify-center">
                {icon}
              </div>

              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  onBlur={() =>
                    setTimeout(() => void handleRenameConfirm(), 100)
                  }
                  onClick={(e) => e.stopPropagation()}
                  className="h-[22px] flex-1 rounded-[3px] px-[6px] text-[13px] outline-none"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    border: "1px solid var(--accent-color)",
                    color: "var(--text-primary)",
                  }}
                />
              ) : (
                <span
                  className="flex-1 truncate text-[13px] leading-[26px]"
                  style={{ color: "var(--text-primary)" }}
                >
                  {node.title}
                </span>
              )}
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
              <TreeNode
                key={child.key}
                node={child}
                level={level + 1}
                creatingInfo={creatingInfo}
                onCreateInFolder={onCreateInFolder}
              />
            ))}
          </div>
        ) : null}

        {isCreatingHere ? createInputRow : null}
      </ContextMenu.Root>

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((prev) => ({ ...prev, open }))}
        title={confirmState.type === "delete" ? "确认删除" : "确认移动"}
        description={
          confirmState.type === "delete"
            ? "确定要删除「" +
              (confirmState.data?.title ?? "") +
              "」吗？此操作不可撤销。"
            : "确定要将「" +
              (confirmState.data?.title ?? "") +
              "」移动到「" +
              node.title +
              "」文件夹中吗？"
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
