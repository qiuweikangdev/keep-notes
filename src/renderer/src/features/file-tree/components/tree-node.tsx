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
  FolderInput,
  FolderOpen,
  Plus,
  FolderPlus,
  Pencil,
  Trash2,
  ExternalLink,
  Copy,
  GitCompare,
  FileOutput,
} from "lucide-react";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "@/hooks/use-electron";
import { cn } from "@/lib/cn";
import { showAppToast } from "@/lib/app-toast";
import type { TreeNode as TreeNodeType } from "@/types";
import { ContextMenu } from "@/components/ui/context-menu";
import { CodeResult } from "@/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDiffStore } from "@/store/diff.store";
import { useEditorStore } from "@/store/editor.store";
import { showNoDiffContentToast } from "@/features/diff/lib/diff-toast";
import { areDiffContentsEqual } from "@/features/diff/lib/diff-content";
import { getRevealInFileManagerLabel } from "../utils";

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

const toGitRelativePath = (rootPath: string, filePath: string) => {
  const normalizedRoot = normalizePath(rootPath);
  const normalizedFile = normalizePath(filePath);
  if (normalizedFile === normalizedRoot) return "";
  if (normalizedFile.startsWith(`${normalizedRoot}/`)) {
    return normalizedFile.slice(normalizedRoot.length + 1);
  }
  return normalizedFile;
};

export const TreeNode = memo(function TreeNode({
  node,
  level,
  creatingInfo,
  onCreateInFolder,
}: TreeNodeProps) {
  const isSelected = useTreeStore((state) => state.selectedKey === node.key);
  const isExpanded = useTreeStore((state) => state.expandedKeys.has(node.key));
  const setSelectedKey = useTreeStore((state) => state.setSelectedKey);
  const toggleExpandedKey = useTreeStore((state) => state.toggleExpandedKey);
  const setTreeData = useTreeStore((state) => state.setTreeData);
  const {
    openFile,
    createFile,
    createFolder,
    renameItem,
    deleteItem,
    moveItem,
    openInExplorer,
    copyPath,
    openInNewWindow,
    getFileHeadContent,
  } = useElectron();
  const openDiff = useDiffStore((state) => state.openDiff);
  const closeDiff = useDiffStore((state) => state.closeDiff);
  const updateContent = useDiffStore((state) => state.updateContent);

  const [isHovered, setIsHovered] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [createValue, setCreateValue] = useState("");
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [, setDragCounter] = useState(0);
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
  const isRenameComposingRef = useRef(false);
  const createInputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const isFolder = Array.isArray(node.children);
  const hasChildren = Boolean(node.children?.length);
  const isMarkdown = node.title.endsWith(".md");
  const revealInFileManagerLabel = getRevealInFileManagerLabel(
    window.electronAPI?.getPlatform(),
  );

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
      const lastSep = Math.max(
        node.key.lastIndexOf("/"),
        node.key.lastIndexOf("\\"),
      );
      const parentKey = lastSep > 0 ? node.key.substring(0, lastSep) : node.key;
      onCreateInFolder?.(parentKey, "file", level);
    }
  }, [isFolder, node.key, level, onCreateInFolder]);

  const handleStartCreateFolder = useCallback(() => {
    if (isFolder) {
      onCreateInFolder?.(node.key, "folder", level + 1);
    } else {
      const lastSep = Math.max(
        node.key.lastIndexOf("/"),
        node.key.lastIndexOf("\\"),
      );
      const parentKey = lastSep > 0 ? node.key.substring(0, lastSep) : node.key;
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
    const treeData = useTreeStore.getState().treeData;
    const result = await fn(node.key, title, treeData);
    if (result.code === CodeResult.Success && result.data) {
      setTreeData(result.data.treeData);
      if (!isExpanded) {
        toggleExpandedKey(node.key);
      }
      const sep = node.key.includes("\\") ? "\\" : "/";
      const newKey =
        creatingInfo.type === "file"
          ? `${node.key}${sep}${title}.md`
          : `${node.key}${sep}${title}`;
      setSelectedKey(newKey);
    } else if (result.message) {
      showAppToast(result.message);
    }

    setCreateValue("");
    onCreateInFolder?.("", creatingInfo.type, creatingInfo.level);
  }, [
    createValue,
    creatingInfo,
    createFile,
    createFolder,
    node.key,
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

    const treeData = useTreeStore.getState().treeData;
    const result = await renameItem(node.key, title, treeData);
    if (result.code === CodeResult.Success && result.data) {
      setTreeData(result.data.treeData);
    } else if (result.message) {
      showAppToast(result.message);
    }
    setIsRenaming(false);
  }, [renameValue, node.title, node.key, renameItem, setTreeData]);

  const handleRenameKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      const isComposing =
        isRenameComposingRef.current ||
        e.nativeEvent.isComposing ||
        e.keyCode === 229;

      // 输入法组合态下的 Enter 仅用于确认候选字，不能提交重命名。
      if (isComposing) return;

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
    const treeData = useTreeStore.getState().treeData;
    const result = await deleteItem(key, title, treeData);
    if (result.code === CodeResult.Success && result.data) {
      setTreeData(result.data.treeData);
    }
  }, [confirmState.data, deleteItem, setTreeData]);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      // 只设置自定义数据类型，避免 text/plain 导致文件路径被插入编辑器
      e.dataTransfer.setData("application/x-keep-notes-file", node.key);
      e.dataTransfer.effectAllowed = "copyMove";
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

      const sourcePath = e.dataTransfer.getData(
        "application/x-keep-notes-file",
      );
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

    const treeData = useTreeStore.getState().treeData;
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
    setTreeData,
    isExpanded,
    toggleExpandedKey,
    node.key,
  ]);

  // 处理 diff 比较
  const handleDiff = useCallback(async () => {
    const filePath = node.key;

    try {
      // 直接读取当前标签快照；没有打开时再回退到磁盘内容。
      const matchedTab = useEditorStore
        .getState()
        .panelGroups.flatMap((g) => g.tabs)
        .find((t) => t.filePath === filePath);
      let editorContent = matchedTab?.content ?? "";
      // 内存中不存在时回退到磁盘内容（已落盘版本）。
      if (!editorContent) {
        editorContent = await window.electronAPI.readFile(filePath);
      }

      let baseContent = "";
      const treeRoot = useTreeStore.getState().treeRoot;
      if (treeRoot?.key) {
        const relativePath = toGitRelativePath(treeRoot.key, filePath);
        const headResult = await getFileHeadContent(treeRoot.key, relativePath);
        if (headResult.code === CodeResult.Success) {
          baseContent = headResult.data ?? "";
        }
      } else {
        baseContent = await window.electronAPI.readFile(filePath);
      }

      if (areDiffContentsEqual(baseContent, editorContent)) {
        showNoDiffContentToast();
        return;
      }

      openDiff(filePath, baseContent, editorContent);
      updateContent(baseContent, editorContent);
    } catch (error) {
      console.error("Failed to read file for diff:", error);
      closeDiff();
    }
  }, [closeDiff, getFileHeadContent, node.key, openDiff, updateContent]);

  /** 触发文件导出入口，实际导出流程由后续导出功能监听并处理 */
  const handleExport = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("keep-notes:export-file", {
        detail: { filePath: node.key },
      }),
    );
  }, [node.key]);

  const icon = isFolder ? (
    isExpanded ? (
      <FolderOpen
        className="h-[14px] w-[14px]"
        style={{ color: "var(--text-secondary)" }}
      />
    ) : (
      <Folder
        className="h-[14px] w-[14px]"
        style={{ color: "var(--text-secondary)" }}
      />
    )
  ) : (
    <File
      className="h-[14px] w-[14px]"
      style={{ color: "var(--text-muted)" }}
    />
  );

  const createInputRow = isCreatingHere ? (
    <div
      className="mx-2 mb-1 flex h-7 animate-fade-in items-center rounded-md"
      style={{
        paddingLeft: `${creatingInfo!.level * 14 + 8}px`,
        paddingRight: "8px",
        backgroundColor: "var(--bg-tertiary)",
        border: "1px solid var(--border-color)",
      }}
    >
      <div className="flex h-[26px] w-[12px] flex-shrink-0 items-center justify-center" />
      <div className="mr-[6px] flex h-[26px] w-[16px] flex-shrink-0 items-center justify-center">
        {creatingInfo!.type === "file" ? (
          <File
            className="h-[14px] w-[14px]"
            style={{ color: "var(--text-muted)" }}
          />
        ) : (
          <Folder
            className="h-[14px] w-[14px]"
            style={{ color: "var(--text-secondary)" }}
          />
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
          backgroundColor: "transparent",
          border: "1px solid transparent",
          color: "var(--text-primary)",
        }}
      />
    </div>
  ) : null;

  return (
    <>
      <ContextMenu.Root modal={false}>
        <ContextMenu.Trigger asChild>
          <div ref={rowRef} className="px-2">
            <div
              className={cn(
                "relative flex h-7 cursor-pointer select-none items-center rounded-md",
                isDropTarget &&
                  isFolder &&
                  "outline outline-1 outline-[var(--accent-color)]/40",
              )}
              style={{
                paddingLeft: `${level * 14 + 8}px`,
                paddingRight: "8px",
                backgroundColor: isSelected
                  ? "var(--active-bg)"
                  : isHovered
                    ? "var(--hover-bg)"
                    : "transparent",
                boxShadow: isSelected
                  ? "inset 0 0 0 1px var(--border-color)"
                  : "none",
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
                    className="flex h-[16px] w-[16px] items-center justify-center rounded-sm hover:bg-[var(--hover-bg)]"
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
                  onCompositionStart={() => {
                    isRenameComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    isRenameComposingRef.current = false;
                  }}
                  onBlur={() =>
                    setTimeout(() => void handleRenameConfirm(), 100)
                  }
                  onClick={(e) => e.stopPropagation()}
                  className="h-[22px] flex-1 rounded-[3px] px-[6px] text-[13px] outline-none"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                />
              ) : (
                <span
                  className="flex-1 truncate text-[13px] leading-7"
                  style={{
                    color: isSelected
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                  }}
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

            {!isFolder ? (
              <ContextMenu.Item
                className={MENU_ITEM_CLASS}
                onClick={handleExport}
              >
                <FileOutput className="h-4 w-4" /> 导出
              </ContextMenu.Item>
            ) : null}

            {isMarkdown ? (
              <ContextMenu.Item
                className={MENU_ITEM_CLASS}
                onClick={() => {
                  // 使用 setTimeout 延迟执行，避免 ContextMenu 关闭时的事件冲突导致弹窗立即关闭
                  setTimeout(() => handleDiff(), 0);
                }}
              >
                <GitCompare className="h-4 w-4" /> 比较差异
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
              onClick={() => void copyPath(node.key)}
            >
              <Copy className="h-4 w-4" /> 复制路径
            </ContextMenu.Item>
            <ContextMenu.Item
              className={MENU_ITEM_CLASS}
              onClick={() => void openInNewWindow(node.key)}
            >
              <ExternalLink className="h-4 w-4" /> 在新窗口中打开
            </ContextMenu.Item>
            <ContextMenu.Item
              className={MENU_ITEM_CLASS}
              onClick={() => void openInExplorer(node.key)}
            >
              <ExternalLink className="h-4 w-4" /> {revealInFileManagerLabel}
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
        icon={confirmState.type === "move" ? FolderInput : undefined}
        description={
          confirmState.type === "delete"
            ? "确定要删除「" +
              (confirmState.data?.title ?? "") +
              "」并移到回收站吗？可在系统回收站中恢复。"
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
