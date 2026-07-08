import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  memo,
  startTransition,
  type KeyboardEvent,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  File,
  Folder,
  FolderOpen,
  ChevronRight,
  List,
  ListTree,
  Plus,
  FolderPlus,
  Search,
  X,
  ExternalLink,
  Copy,
  Pencil,
  Trash2,
  GitCompare,
  BellPlus,
  FileOutput,
} from "lucide-react";
import { useEditorStore } from "@/store/editor.store";
import { OutlinePanel } from "./outline-panel";
import { scrollEditorOutlineBlock } from "@/features/editor/lib/editor-outline-navigation";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "@/hooks/use-electron";
import { useReminderStore } from "@/store/reminder.store";
import { useDiffStore } from "@/store/diff.store";
import { showNoDiffContentToast } from "@/features/diff/lib/diff-toast";
import { QuickActionsPanel } from "./quick-actions-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContextMenu } from "@/components/ui/context-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import type { TreeNode as TreeNodeType } from "@/types";
import { CodeResult } from "@/types";
import { cn } from "@/lib/cn";
import { KEEP_NOTES_FILE_DRAG_TYPE, setDraggedFilePath } from "@/lib/file-drag";
import {
  buildCreatedNodeKey,
  buildFileTreeRows,
  canMoveNodeToFolder,
  findAncestorKeys,
  findNodeByKey,
  flattenTree,
  getRevealInFileManagerLabel,
  normalizeTreePath,
  REVEAL_FILE_TREE_NODE_EVENT,
  shouldRevealFileTreeOnViewChange,
  shouldSyncSelectionToActiveFile,
  type FlatNode,
  type RevealFileTreeNodeEventDetail,
} from "../utils";

const MENU_CONTENT_CLASS =
  "z-[9999] min-w-[180px] rounded-md border p-1 shadow-lg bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-primary)]";
const MENU_ITEM_CLASS =
  "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-[var(--hover-bg)]";
const MENU_SEPARATOR_CLASS = "my-1 h-px bg-[var(--border-color)]";
const TOOL_BUTTON_CLASS =
  "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors";
const ROW_HEIGHT = 28; // 7 * 4 = 28px (h-7)
const DIFF_EDITOR_CONTENT_WAIT_MS = 2000;
const DIFF_EDITOR_CONTENT_POLL_MS = 50;

interface CreatingInfo {
  type: "file" | "folder";
  parentKey: string;
  level: number;
}

interface FileTreeRevealRequest {
  key: string;
  id: number;
  align?: "auto" | "center";
}

const toGitRelativePath = (rootPath: string, filePath: string) => {
  const normalizedRoot = normalizeTreePath(rootPath);
  const normalizedFile = normalizeTreePath(filePath);
  if (normalizedFile === normalizedRoot) return "";
  if (normalizedFile.startsWith(`${normalizedRoot}/`)) {
    return normalizedFile.slice(normalizedRoot.length + 1);
  }
  return normalizedFile;
};

export function FileTree() {
  const treeData = useTreeStore((state) => state.treeData);
  const treeRoot = useTreeStore((state) => state.treeRoot);
  const setTreeData = useTreeStore((state) => state.setTreeData);
  const expandedKeys = useTreeStore((state) => state.expandedKeys);
  const selectedKey = useTreeStore((state) => state.selectedKey);
  const toggleExpandedKey = useTreeStore((state) => state.toggleExpandedKey);
  const setSelectedKey = useTreeStore((state) => state.setSelectedKey);
  const setExpandedKeys = useTreeStore((state) => state.setExpandedKeys);
  const {
    openFolder,
    openInExplorer,
    openFile,
    createFile,
    createFolder,
    deleteItem,
    copyPath,
    openInNewWindow,
    moveItem,
  } = useElectron();

  const appearance = useEditorStore((s) => s.appearance);
  const setSidebarView = useEditorStore((s) => s.setSidebarView);
  const sidebarView = appearance.sidebarView;
  const activeFilePath = useEditorStore((state) => {
    const activeGroup = state.panelGroups.find(
      (group) => group.id === state.activeGroupId,
    );
    const activeTab = activeGroup?.tabs.find(
      (tab) => tab.id === activeGroup.activeTabId,
    );
    return activeTab?.pendingFilePath ?? activeTab?.filePath ?? null;
  });
  const openCreateReminder = useReminderStore((s) => s.openCreateDialog);

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [creatingInfo, setCreatingInfo] = useState<CreatingInfo | null>(null);
  const [createValue, setCreateValue] = useState("");
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    key: string;
    title: string;
  }>({ open: false, key: "", title: "" });
  const [isRootDropTarget, setIsRootDropTarget] = useState(false);
  const createInputRef = useRef<HTMLInputElement>(null);
  const confirmedRef = useRef(false);
  const rootDragDepthRef = useRef(0);
  const previousSidebarViewRef = useRef(sidebarView);
  const lastSelectedRevealKeyRef = useRef<string | null>(null);
  const revealRequestIdRef = useRef(0);
  const [fileTreeRevealRequest, setFileTreeRevealRequest] =
    useState<FileTreeRevealRequest | null>(null);
  const isRootCreating = creatingInfo?.parentKey === treeRoot?.key;
  const revealInFileManagerLabel = getRevealInFileManagerLabel(
    window.electronAPI?.getPlatform(),
  );

  const isRootSelected = selectedKey === treeRoot?.key;
  const isRootExpanded = treeRoot ? expandedKeys.has(treeRoot.key) : false;
  const treeRootKey = treeRoot?.key ?? null;

  // 从 store 获取大纲标题列表和活跃标题 ID
  const headings = useEditorStore((state) => state.outlineHeadings);
  const activeHeadingId = useEditorStore((state) => state.activeHeadingId);
  const setActiveHeadingId = useEditorStore(
    (state) => state.setActiveHeadingId,
  );

  // 处理大纲标题点击，滚动到对应位置
  const handleHeadingClick = useCallback(
    (id: string) => {
      const state = useEditorStore.getState();
      const activeGroup = state.panelGroups.find(
        (group) => group.id === state.activeGroupId,
      );
      if (activeGroup) {
        scrollEditorOutlineBlock(activeGroup.id, activeGroup.activeTabId, id);
      }
      startTransition(() => {
        setActiveHeadingId(id);
      });
    },
    [setActiveHeadingId],
  );

  const revealCreatedNode = useCallback(
    (parentKey: string, newKey: string) => {
      const currentExpandedKeys = useTreeStore.getState().expandedKeys;
      if (!currentExpandedKeys.has(parentKey)) {
        const nextExpandedKeys = new Set(currentExpandedKeys);
        nextExpandedKeys.add(parentKey);
        setExpandedKeys(nextExpandedKeys);
      }

      setSelectedKey(newKey);
      setFileTreeRevealRequest({
        key: newKey,
        id: ++revealRequestIdRef.current,
        align: "auto",
      });
    },
    [setExpandedKeys, setSelectedKey],
  );

  const revealTreeNode = useCallback(
    (revealKey: string, align: "auto" | "center" = "center") => {
      if (!treeRootKey || revealKey === treeRootKey) {
        return false;
      }

      const targetNode = findNodeByKey(treeData, revealKey);
      if (!targetNode) {
        return false;
      }

      const nextExpandedKeys = new Set(useTreeStore.getState().expandedKeys);
      let shouldUpdateExpandedKeys = false;

      // 定位外部打开的文件时，先展开根节点和所有祖先目录，确保虚拟列表能渲染目标行。
      for (const key of [
        treeRootKey,
        ...findAncestorKeys(treeData, revealKey),
      ]) {
        if (!nextExpandedKeys.has(key)) {
          nextExpandedKeys.add(key);
          shouldUpdateExpandedKeys = true;
        }
      }

      if (shouldUpdateExpandedKeys) {
        setExpandedKeys(nextExpandedKeys);
      }

      setFileTreeRevealRequest({
        key: revealKey,
        id: ++revealRequestIdRef.current,
        align,
      });
      return true;
    },
    [setExpandedKeys, treeData, treeRootKey],
  );

  useEffect(() => {
    const handleRevealFileTreeNode = (event: Event) => {
      const detail = (event as CustomEvent<RevealFileTreeNodeEventDetail>)
        .detail;
      if (!detail?.key) return;

      void revealTreeNode(detail.key, detail.align);
    };

    window.addEventListener(
      REVEAL_FILE_TREE_NODE_EVENT,
      handleRevealFileTreeNode,
    );

    return () => {
      window.removeEventListener(
        REVEAL_FILE_TREE_NODE_EVENT,
        handleRevealFileTreeNode,
      );
    };
  }, [revealTreeNode]);

  useEffect(() => {
    if (isRootCreating && createInputRef.current) {
      requestAnimationFrame(() => createInputRef.current?.focus());
    }
  }, [isRootCreating]);

  useEffect(() => {
    const previousSidebarView = previousSidebarViewRef.current;
    previousSidebarViewRef.current = sidebarView;

    if (sidebarView !== "file" || !treeRootKey) {
      return;
    }

    const revealKey = activeFilePath ?? selectedKey;
    if (!revealKey || revealKey === treeRootKey) {
      return;
    }

    const shouldReveal = shouldRevealFileTreeOnViewChange(
      previousSidebarView,
      sidebarView,
    );
    if (!shouldReveal) {
      return;
    }

    const targetNode = findNodeByKey(treeData, revealKey);
    if (!targetNode) {
      return;
    }

    if (
      activeFilePath &&
      selectedKey !== activeFilePath &&
      shouldSyncSelectionToActiveFile(previousSidebarView, sidebarView)
    ) {
      setSelectedKey(activeFilePath);
    }

    void revealTreeNode(revealKey, "center");
  }, [
    activeFilePath,
    revealTreeNode,
    selectedKey,
    setSelectedKey,
    sidebarView,
    treeData,
    treeRootKey,
  ]);

  useEffect(() => {
    if (
      sidebarView !== "file" ||
      !selectedKey ||
      selectedKey === treeRootKey ||
      lastSelectedRevealKeyRef.current === selectedKey
    ) {
      return;
    }

    if (revealTreeNode(selectedKey, "center")) {
      lastSelectedRevealKeyRef.current = selectedKey;
    }
  }, [revealTreeNode, selectedKey, sidebarView, treeRootKey]);

  const doRootCreate = useCallback(async () => {
    const title = createValue.trim();
    if (!title || !creatingInfo || !treeRoot) {
      setCreateValue("");
      setCreatingInfo(null);
      return;
    }
    const fn = creatingInfo.type === "file" ? createFile : createFolder;
    const r = await fn(treeRoot.key, title, treeData);
    if (r.code === CodeResult.Success && r.data) {
      const newKey = buildCreatedNodeKey(
        treeRoot.key,
        title,
        creatingInfo.type,
      );
      setTreeData(r.data.treeData);
      setCreateValue("");
      setCreatingInfo(null);
      revealCreatedNode(treeRoot.key, newKey);
      return;
    }
    setCreateValue("");
    setCreatingInfo(null);
  }, [
    createValue,
    creatingInfo,
    treeRoot,
    treeData,
    createFile,
    createFolder,
    setTreeData,
    revealCreatedNode,
  ]);

  const handleRootCreateKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmedRef.current = true;
        void doRootCreate();
      }
      if (e.key === "Escape") {
        confirmedRef.current = true;
        setCreateValue("");
        setCreatingInfo(null);
      }
    },
    [doRootCreate],
  );

  const handleSelectDir = useCallback(async () => {
    await openFolder();
  }, [openFolder]);

  const handleStartCreateFile = useCallback(() => {
    if (!treeRoot) return;
    setCreatingInfo({ type: "file", parentKey: treeRoot.key, level: 0 });
  }, [treeRoot]);

  const handleStartCreateFolder = useCallback(() => {
    if (!treeRoot) return;
    setCreatingInfo({ type: "folder", parentKey: treeRoot.key, level: 0 });
  }, [treeRoot]);

  const handleToggleSearch = useCallback(() => {
    setShowSearch((value) => !value);
    if (showSearch) {
      setSearchQuery("");
    }
  }, [showSearch]);

  // 根节点拖拽处理
  const isTreeFileDrag = useCallback((e: React.DragEvent) => {
    return e.dataTransfer.types.includes(KEEP_NOTES_FILE_DRAG_TYPE);
  }, []);

  const handleRootDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!treeRoot || !isTreeFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setIsRootDropTarget(true);
    },
    [treeRoot, isTreeFileDrag],
  );

  const handleRootDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!treeRoot || !isTreeFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      rootDragDepthRef.current += 1;
      setIsRootDropTarget(true);
    },
    [treeRoot, isTreeFileDrag],
  );

  const handleRootDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!treeRoot || !isTreeFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      rootDragDepthRef.current = Math.max(0, rootDragDepthRef.current - 1);
      if (rootDragDepthRef.current === 0) {
        setIsRootDropTarget(false);
      }
    },
    [treeRoot, isTreeFileDrag],
  );

  const handleRootDrop = useCallback(
    (e: React.DragEvent) => {
      if (!treeRoot || !isTreeFileDrag(e)) return;
      e.preventDefault();
      e.stopPropagation();
      rootDragDepthRef.current = 0;
      setIsRootDropTarget(false);

      const sourcePath = e.dataTransfer.getData(KEEP_NOTES_FILE_DRAG_TYPE);
      if (!sourcePath || !canMoveNodeToFolder(sourcePath, treeRoot.key)) {
        return;
      }

      // 文件已在根目录下，无需移动
      const sourceParent = sourcePath.replace(/[\\/][^\\/]+$/, "");
      if (normalizeTreePath(sourceParent) === normalizeTreePath(treeRoot.key)) {
        return;
      }

      // 直接移动到根目录，无需确认
      void (async () => {
        const currentTreeData = useTreeStore.getState().treeData;
        const result = await moveItem(
          sourcePath,
          treeRoot.key,
          currentTreeData,
        );
        if (result.code === CodeResult.Success && result.data) {
          setTreeData(result.data.treeData);
          if (!expandedKeys.has(treeRoot.key)) {
            toggleExpandedKey(treeRoot.key);
          }
        }
      })();
    },
    [
      treeRoot,
      isTreeFileDrag,
      moveItem,
      setTreeData,
      expandedKeys,
      toggleExpandedKey,
    ],
  );

  // 过滤树数据
  const filteredTreeData = useMemo(() => {
    if (!searchQuery.trim()) return treeData;

    const filterNodes = (nodes: TreeNodeType[]): TreeNodeType[] => {
      return nodes.reduce<TreeNodeType[]>((acc, node) => {
        const matchesSearch = node.title
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
        const filteredChildren = node.children
          ? filterNodes(node.children)
          : [];

        if (matchesSearch || filteredChildren.length > 0) {
          acc.push({
            ...node,
            children:
              filteredChildren.length > 0 ? filteredChildren : node.children,
          });
        }
        return acc;
      }, []);
    };

    return filterNodes(treeData);
  }, [treeData, searchQuery]);

  // 展平树结构
  const flatNodes = useMemo(() => {
    if (!isRootExpanded) return [];
    return flattenTree(
      filteredTreeData,
      expandedKeys,
      1,
      treeRoot?.key ?? null,
    );
  }, [filteredTreeData, expandedKeys, isRootExpanded, treeRoot?.key]);

  // 处理节点点击
  const handleNodeClick = useCallback(
    (flatNode: FlatNode) => {
      setSelectedKey(flatNode.key);
      if (flatNode.isFolder) {
        setFileTreeRevealRequest({
          key: flatNode.key,
          id: ++revealRequestIdRef.current,
          align: "auto",
        });
        toggleExpandedKey(flatNode.key);
      } else if (flatNode.title.endsWith(".md")) {
        // 调用标题栏的 addToHistory
        window.__addFileToHistory?.(flatNode.key);
        void openFile(flatNode.key);
      }
    },
    [setSelectedKey, toggleExpandedKey, openFile],
  );

  // 处理创建
  const handleCreateInFolder = useCallback(
    (parentKey: string, type: "file" | "folder", level: number) => {
      if (!parentKey) {
        setCreatingInfo(null);
      } else {
        // 使用 startTransition 批量更新状态，避免多次渲染导致闪烁
        startTransition(() => {
          // 先展开文件夹（直接从 store 获取最新的 expandedKeys）
          const currentExpandedKeys = useTreeStore.getState().expandedKeys;
          if (!currentExpandedKeys.has(parentKey)) {
            toggleExpandedKey(parentKey);
          }
          // 再设置创建信息
          setCreatingInfo({ type, parentKey, level });
        });
      }
    },
    [toggleExpandedKey],
  );

  // 触发删除确认对话框
  const handleDeleteNode = useCallback((key: string, title: string) => {
    setConfirmState({ open: true, key, title });
  }, []);

  // 确认删除
  const handleDeleteConfirm = useCallback(async () => {
    const { key, title } = confirmState;
    if (!key) return;

    const currentTreeData = useTreeStore.getState().treeData;
    const result = await deleteItem(key, title, currentTreeData);
    if (result.code === CodeResult.Success && result.data) {
      setTreeData(result.data.treeData);
    }
    setConfirmState({ open: false, key: "", title: "" });
  }, [confirmState, deleteItem, setTreeData]);

  if (!treeRoot) {
    return (
      <div
        className="relative h-full flex-col"
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
      >
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            没有打开的文件夹
          </p>
        </div>

        <div
          className="absolute bottom-0 left-0 right-0 z-10 transition-opacity duration-200"
          style={{
            opacity: appearance.showBottomBarOnHover
              ? isSidebarHovered
                ? 1
                : 0
              : 1,
            pointerEvents: appearance.showBottomBarOnHover
              ? isSidebarHovered
                ? "auto"
                : "none"
              : "auto",
          }}
        >
          <QuickActionsPanel />
        </div>
      </div>
    );
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          className="relative flex h-full flex-col"
          onMouseEnter={() => setIsSidebarHovered(true)}
          onMouseLeave={() => setIsSidebarHovered(false)}
        >
          <div
            className="flex h-[42px] flex-shrink-0 items-center gap-1 px-2"
            style={{
              borderBottom: "1px solid var(--border-color)",
              backgroundColor: "var(--bg-secondary)",
            }}
          >
            <Tooltip.Provider>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    type="button"
                    className={TOOL_BUTTON_CLASS}
                    style={{ color: "var(--text-muted)" }}
                    onClick={() =>
                      setSidebarView(
                        sidebarView === "file" ? "outline" : "file",
                      )
                    }
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                      e.currentTarget.style.color = "var(--text-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }}
                  >
                    {sidebarView === "file" ? (
                      <List className="h-3.5 w-3.5" />
                    ) : (
                      <ListTree className="h-3.5 w-3.5" />
                    )}
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="z-50 rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
                    side="bottom"
                    sideOffset={5}
                  >
                    {sidebarView === "file"
                      ? "切换到大纲视图"
                      : "切换到文件树视图"}
                    <Tooltip.Arrow className="fill-popover" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
            <div className="flex min-w-0 flex-1 items-center justify-center">
              <span
                className="truncate text-[13px] font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {sidebarView === "file" ? "文件" : "大纲"}
              </span>
            </div>
            <Tooltip.Provider>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    type="button"
                    className={TOOL_BUTTON_CLASS}
                    style={{ color: "var(--text-muted)" }}
                    onClick={handleToggleSearch}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                      e.currentTarget.style.color = "var(--text-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }}
                  >
                    {showSearch ? (
                      <X className="h-3.5 w-3.5" />
                    ) : (
                      <Search className="h-3.5 w-3.5" />
                    )}
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="z-50 rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
                    side="bottom"
                    sideOffset={5}
                  >
                    {showSearch ? "关闭搜索" : "搜索文件"}
                    <Tooltip.Arrow className="fill-popover" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          </div>

          <div
            className={cn(
              "flex-1 py-2 pb-12",
              sidebarView === "file"
                ? "flex min-h-0 flex-col overflow-hidden"
                : "overflow-auto",
            )}
          >
            {sidebarView === "file" ? (
              <>
                {showSearch ? (
                  <div className="px-2 pb-2">
                    <div className="relative">
                      <Search
                        className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                        style={{ color: "var(--text-muted)" }}
                      />
                      <Input
                        placeholder="搜索文件..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8 rounded-md pl-7 pr-7 text-[12px]"
                        autoFocus
                      />
                      {searchQuery ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 h-5 w-5 -translate-y-1/2"
                          onClick={() => setSearchQuery("")}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {isRootCreating ? (
                  <div
                    className="mx-2 mb-1 flex h-7 items-center rounded-md"
                    style={{
                      paddingLeft: "8px",
                      paddingRight: "8px",
                      backgroundColor: "var(--bg-tertiary)",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <div className="flex h-[26px] w-[12px] flex-shrink-0 items-center justify-center" />
                    <div className="mr-[6px] flex h-[26px] w-[16px] flex-shrink-0 items-center justify-center">
                      {creatingInfo.type === "file" ? (
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
                      onKeyDown={handleRootCreateKeyDown}
                      onBlur={() => {
                        if (confirmedRef.current) {
                          confirmedRef.current = false;
                          return;
                        }
                        setTimeout(() => void doRootCreate(), 100);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      placeholder={
                        creatingInfo.type === "file"
                          ? "输入文件名称"
                          : "输入文件夹名称"
                      }
                      className="h-[22px] flex-1 rounded-[3px] px-[6px] text-[13px] outline-none"
                      style={{
                        backgroundColor: "transparent",
                        border: "1px solid transparent",
                        color: "var(--text-primary)",
                      }}
                    />
                  </div>
                ) : null}

                {/* 根节点 */}
                <ContextMenu.Root>
                  <ContextMenu.Trigger asChild>
                    <div className="px-2">
                      <div
                        className={cn(
                          "tree-node-root relative flex h-7 cursor-pointer select-none items-center rounded-md",
                          isRootDropTarget &&
                            "outline outline-1 outline-[var(--accent-color)]/40",
                        )}
                        style={{
                          paddingLeft: "8px",
                          paddingRight: "8px",
                          backgroundColor: isRootSelected
                            ? "var(--active-bg)"
                            : "transparent",
                          boxShadow: isRootSelected
                            ? "inset 0 0 0 1px var(--border-color)"
                            : "none",
                        }}
                        onClick={() => {
                          setSelectedKey(treeRoot!.key);
                          toggleExpandedKey(treeRoot!.key);
                        }}
                        onDragOver={handleRootDragOver}
                        onDragEnter={handleRootDragEnter}
                        onDragLeave={handleRootDragLeave}
                        onDrop={handleRootDrop}
                      >
                        <div className="flex h-[26px] w-[12px] flex-shrink-0 items-center justify-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpandedKey(treeRoot!.key);
                            }}
                            className="flex h-[16px] w-[16px] items-center justify-center rounded-sm hover:bg-[var(--hover-bg)]"
                          >
                            <ChevronRight
                              className={cn(
                                "h-3 w-3 transition-transform duration-100",
                                isRootExpanded && "rotate-90",
                              )}
                              style={{ color: "var(--text-muted)" }}
                            />
                          </button>
                        </div>

                        <div className="mr-[6px] flex h-[26px] w-[16px] flex-shrink-0 items-center justify-center">
                          {isRootExpanded ? (
                            <FolderOpen
                              className="h-[14px] w-[14px]"
                              style={{ color: "var(--text-secondary)" }}
                            />
                          ) : (
                            <Folder
                              className="h-[14px] w-[14px]"
                              style={{ color: "var(--text-secondary)" }}
                            />
                          )}
                        </div>

                        <span
                          className="flex-1 truncate text-[13px] leading-7 font-medium"
                          style={{
                            color: isRootSelected
                              ? "var(--text-primary)"
                              : "var(--text-secondary)",
                          }}
                        >
                          {treeRoot!.title}
                        </span>
                      </div>
                    </div>
                  </ContextMenu.Trigger>

                  <ContextMenu.Portal>
                    <ContextMenu.Content className={MENU_CONTENT_CLASS}>
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
                        onClick={handleSelectDir}
                      >
                        <FolderOpen className="h-4 w-4" /> 打开文件夹
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className={MENU_ITEM_CLASS}
                        onClick={() => void copyPath(treeRoot!.key)}
                      >
                        <Copy className="h-4 w-4" /> 复制路径
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className={MENU_ITEM_CLASS}
                        onClick={() => void openInNewWindow(treeRoot!.key)}
                      >
                        <ExternalLink className="h-4 w-4" /> 在新窗口中打开
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className={MENU_ITEM_CLASS}
                        onClick={() => void openInExplorer(treeRoot!.key)}
                      >
                        <ExternalLink className="h-4 w-4" />{" "}
                        {revealInFileManagerLabel}
                      </ContextMenu.Item>
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                </ContextMenu.Root>

                {/* 虚拟化子节点列表 */}
                {isRootExpanded && flatNodes.length > 0 ? (
                  <VirtualizedTreeList
                    flatNodes={flatNodes}
                    selectedKey={selectedKey}
                    revealRequest={fileTreeRevealRequest}
                    creatingInfo={creatingInfo}
                    onClick={handleNodeClick}
                    onCreateInFolder={handleCreateInFolder}
                    onNodeCreated={revealCreatedNode}
                    onDeleteNode={handleDeleteNode}
                    openFile={openFile}
                    openInExplorer={openInExplorer}
                    copyPath={copyPath}
                    openInNewWindow={openInNewWindow}
                    openCreateReminder={openCreateReminder}
                  />
                ) : isRootExpanded ? (
                  <div
                    className="flex h-28 items-center justify-center text-[12px]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {searchQuery ? "没有匹配的文件" : "文件夹为空"}
                  </div>
                ) : null}
              </>
            ) : (
              <OutlinePanel
                headings={headings}
                activeHeadingId={activeHeadingId}
                resetKey={activeFilePath}
                onHeadingClick={handleHeadingClick}
              />
            )}
          </div>

          <div
            className="absolute bottom-0 left-0 right-0 z-10 transition-opacity duration-200"
            style={{
              opacity: appearance.showBottomBarOnHover
                ? isSidebarHovered
                  ? 1
                  : 0
                : 1,
              pointerEvents: appearance.showBottomBarOnHover
                ? isSidebarHovered
                  ? "auto"
                  : "none"
                : "auto",
            }}
          >
            <QuickActionsPanel />
          </div>
        </div>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className={MENU_CONTENT_CLASS}>
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
            onClick={handleSelectDir}
          >
            <FolderOpen className="h-4 w-4" /> 打开文件夹
          </ContextMenu.Item>
          <ContextMenu.Item
            className={MENU_ITEM_CLASS}
            onClick={() => void copyPath(treeRoot.key)}
          >
            <Copy className="h-4 w-4" /> 复制路径
          </ContextMenu.Item>
          <ContextMenu.Item
            className={MENU_ITEM_CLASS}
            onClick={() => void openInNewWindow(treeRoot.key)}
          >
            <ExternalLink className="h-4 w-4" /> 在新窗口中打开
          </ContextMenu.Item>
          <ContextMenu.Item
            className={MENU_ITEM_CLASS}
            onClick={() => void openInExplorer(treeRoot.key)}
          >
            <ExternalLink className="h-4 w-4" /> {revealInFileManagerLabel}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>

      <ConfirmDialog
        open={confirmState.open}
        onOpenChange={(open) => setConfirmState((prev) => ({ ...prev, open }))}
        title="确认删除"
        description={`确定要删除「${confirmState.title}」吗？此操作不可撤销。`}
        confirmText="删除"
        variant="danger"
        onConfirm={handleDeleteConfirm}
      />
    </ContextMenu.Root>
  );
}

interface VirtualizedTreeListProps {
  flatNodes: FlatNode[];
  selectedKey: string | null;
  revealRequest: FileTreeRevealRequest | null;
  creatingInfo: CreatingInfo | null;
  onClick: (flatNode: FlatNode) => void;
  onCreateInFolder: (
    parentKey: string,
    type: "file" | "folder",
    level: number,
  ) => void;
  onNodeCreated: (parentKey: string, newKey: string) => void;
  onDeleteNode: (key: string, title: string) => void;
  openFile: (filePath: string) => Promise<void>;
  openInExplorer: (targetPath: string) => Promise<boolean>;
  copyPath: (targetPath: string) => Promise<boolean>;
  openInNewWindow: (targetPath: string) => Promise<boolean>;
  openCreateReminder: (filePath: string) => void;
}

const VirtualizedTreeList = memo(function VirtualizedTreeList({
  flatNodes,
  selectedKey,
  revealRequest,
  creatingInfo,
  onClick,
  onCreateInFolder,
  onNodeCreated,
  onDeleteNode,
  openFile,
  openInExplorer,
  copyPath,
  openInNewWindow,
  openCreateReminder,
}: VirtualizedTreeListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(
    () => buildFileTreeRows(flatNodes, creatingInfo?.parentKey),
    [creatingInfo?.parentKey, flatNodes],
  );

  const getItemKey = useCallback(
    (index: number) => rows[index]?.key ?? index,
    [rows],
  );

  // 虚拟滚动状态隔离在列表组件内，避免滚动时带动整个侧边栏重渲。
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey,
    overscan: 6,
  });

  const revealIndex = useMemo(() => {
    if (!revealRequest) return -1;
    return rows.findIndex(
      (row) => row.type === "node" && row.key === revealRequest.key,
    );
  }, [revealRequest, rows]);

  const creatingRowIndex = useMemo(() => {
    if (!creatingInfo) return -1;
    return rows.findIndex(
      (row) =>
        row.type === "create" && row.parentKey === creatingInfo.parentKey,
    );
  }, [creatingInfo, rows]);

  useEffect(() => {
    if (!revealRequest || revealIndex < 0) return;

    const frame = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(revealIndex, {
        align: revealRequest.align ?? "center",
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [revealIndex, revealRequest, virtualizer]);

  useEffect(() => {
    if (creatingRowIndex < 0) return;

    const frame = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(creatingRowIndex, { align: "auto" });
    });

    return () => cancelAnimationFrame(frame);
  }, [creatingRowIndex, virtualizer]);

  return (
    <div
      ref={parentRef}
      className="min-h-0 flex-1 overflow-auto"
      style={{
        contain: "layout paint style",
        overflowAnchor: "none",
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const row = rows[virtualItem.index];
          if (!row) return null;

          if (row.type === "create") {
            if (!creatingInfo || row.parentKey !== creatingInfo.parentKey) {
              return null;
            }

            return (
              <CreateInput
                key={row.key}
                creatingInfo={creatingInfo}
                parentKey={row.parentKey}
                top={virtualItem.start}
                onCreated={onNodeCreated}
                onCancel={() => onCreateInFolder("", "file", 0)}
              />
            );
          }

          const flatNode = row.node;

          return (
            <VirtualTreeNode
              key={flatNode.key}
              flatNode={flatNode}
              size={virtualItem.size}
              start={virtualItem.start}
              isSelected={selectedKey === flatNode.key}
              onClick={onClick}
              onCreateInFolder={onCreateInFolder}
              onDeleteNode={onDeleteNode}
              openFile={openFile}
              openInExplorer={openInExplorer}
              copyPath={copyPath}
              openInNewWindow={openInNewWindow}
              openCreateReminder={openCreateReminder}
            />
          );
        })}
      </div>
    </div>
  );
});

// 虚拟节点组件
interface VirtualTreeNodeProps {
  flatNode: FlatNode;
  size: number;
  start: number;
  isSelected: boolean;
  onClick: (flatNode: FlatNode) => void;
  onCreateInFolder: (
    parentKey: string,
    type: "file" | "folder",
    level: number,
  ) => void;
  onDeleteNode: (key: string, title: string) => void;
  openFile: (filePath: string) => Promise<void>;
  openInExplorer: (targetPath: string) => Promise<boolean>;
  copyPath: (targetPath: string) => Promise<boolean>;
  openInNewWindow: (targetPath: string) => Promise<boolean>;
  openCreateReminder: (filePath: string) => void;
}

const VirtualTreeNode = memo(function VirtualTreeNode({
  flatNode,
  size,
  start,
  isSelected,
  onClick,
  onCreateInFolder,
  onDeleteNode,
  openFile,
  openInExplorer,
  copyPath,
  openInNewWindow,
  openCreateReminder,
}: VirtualTreeNodeProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [moveConfirm, setMoveConfirm] = useState<{
    open: boolean;
    sourcePath: string;
    targetPath: string;
    title: string;
  }>({ open: false, sourcePath: "", targetPath: "", title: "" });
  const renameInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const setTreeData = useTreeStore((state) => state.setTreeData);
  const expandedKeys = useTreeStore((state) => state.expandedKeys);
  const toggleExpandedKey = useTreeStore((state) => state.toggleExpandedKey);
  const isExpanded = useTreeStore((state) =>
    state.expandedKeys.has(flatNode.key),
  );
  const { renameItem, moveItem, getFileHeadContent } = useElectron();
  const { openDiff, closeDiff, updateContent } = useDiffStore();
  const dropTargetFolderPath = flatNode.isFolder
    ? flatNode.key
    : flatNode.parentKey;
  const dropTargetFolderTitle =
    dropTargetFolderPath?.split(/[\\/]/).pop() ?? flatNode.title;

  const revealInFileManagerLabel = getRevealInFileManagerLabel(
    window.electronAPI?.getPlatform(),
  );

  // 重命名输入框自动聚焦
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  // 开始重命名
  const handleStartRename = useCallback(() => {
    setRenameValue(flatNode.title.replace(/\.md$/, ""));
    setIsRenaming(true);
  }, [flatNode.title]);

  // 确认重命名
  const handleRenameConfirm = useCallback(async () => {
    const title = renameValue.trim();
    const current = flatNode.title.replace(/\.md$/, "");
    if (!title || title === current) {
      setIsRenaming(false);
      return;
    }

    const treeData = useTreeStore.getState().treeData;
    const result = await renameItem(flatNode.key, title, treeData);
    if (result.code === CodeResult.Success && result.data) {
      setTreeData(result.data.treeData);
    }
    setIsRenaming(false);
  }, [renameValue, flatNode.title, flatNode.key, renameItem, setTreeData]);

  // 重命名键盘事件
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

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      setDraggedFilePath(e.dataTransfer, flatNode.key);
      e.dataTransfer.effectAllowed = "copyMove";
    },
    [flatNode.key],
  );

  const handleDragEnd = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDropTarget(false);
  }, []);

  const isTreeFileDrag = useCallback((e: React.DragEvent) => {
    return e.dataTransfer.types.includes(KEEP_NOTES_FILE_DRAG_TYPE);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!dropTargetFolderPath || !isTreeFileDrag(e)) return;

      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setIsDropTarget(true);
    },
    [dropTargetFolderPath, isTreeFileDrag],
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!dropTargetFolderPath || !isTreeFileDrag(e)) return;

      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current += 1;
      setIsDropTarget(true);
    },
    [dropTargetFolderPath, isTreeFileDrag],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!dropTargetFolderPath || !isTreeFileDrag(e)) return;

      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDropTarget(false);
      }
    },
    [dropTargetFolderPath, isTreeFileDrag],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!dropTargetFolderPath || !isTreeFileDrag(e)) return;

      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setIsDropTarget(false);

      const sourcePath = e.dataTransfer.getData(KEEP_NOTES_FILE_DRAG_TYPE);
      if (
        !sourcePath ||
        !canMoveNodeToFolder(sourcePath, dropTargetFolderPath)
      ) {
        return;
      }

      // 文件已在目标目录下，无需移动
      const sourceParent = sourcePath.replace(/[\\/][^\\/]+$/, "");
      if (
        normalizeTreePath(sourceParent) ===
        normalizeTreePath(dropTargetFolderPath)
      ) {
        return;
      }

      setMoveConfirm({
        open: true,
        sourcePath,
        targetPath: dropTargetFolderPath,
        title: sourcePath.split(/[\\/]/).pop() || sourcePath,
      });
    },
    [dropTargetFolderPath, isTreeFileDrag],
  );

  const readEditorContentForDiff = useCallback(async () => {
    const startTime = Date.now();

    while (Date.now() - startTime < DIFF_EDITOR_CONTENT_WAIT_MS) {
      const matchedTab = useEditorStore
        .getState()
        .panelGroups.flatMap((group) => group.tabs)
        .find(
          (tab) =>
            tab.filePath === flatNode.key ||
            (tab.filePath &&
              normalizeTreePath(tab.filePath) ===
                normalizeTreePath(flatNode.key)),
        );

      if (!matchedTab) {
        break;
      }

      if (matchedTab.content) {
        return matchedTab.content;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, DIFF_EDITOR_CONTENT_POLL_MS),
      );
    }

    return window.electronAPI.readFile(flatNode.key);
  }, [flatNode.key]);

  // 打开文件差异弹窗，并用 HEAD 版本与当前工作区内容填充对比数据。
  const handleDiff = useCallback(async () => {
    try {
      const editorContent = await readEditorContentForDiff();
      let baseContent = "";
      const treeRoot = useTreeStore.getState().treeRoot;

      if (treeRoot?.key) {
        const relativePath = toGitRelativePath(treeRoot.key, flatNode.key);
        const headResult = await getFileHeadContent(treeRoot.key, relativePath);
        if (headResult.code === CodeResult.Success) {
          baseContent = headResult.data ?? "";
        }
      } else {
        baseContent = await window.electronAPI.readFile(flatNode.key);
      }

      if (baseContent === editorContent) {
        showNoDiffContentToast();
        return;
      }

      openDiff(flatNode.key, baseContent, editorContent);
      updateContent(baseContent, editorContent);
    } catch (error) {
      console.error("Failed to read file for diff:", error);
      closeDiff();
    }
  }, [
    closeDiff,
    flatNode.key,
    getFileHeadContent,
    openDiff,
    readEditorContentForDiff,
    updateContent,
  ]);

  /** 触发文件导出入口，后续导出流程监听该事件继续处理 */
  const handleExport = useCallback(() => {
    window.dispatchEvent(
      new CustomEvent("keep-notes:export-file", {
        detail: { filePath: flatNode.key },
      }),
    );
  }, [flatNode.key]);

  const handleMoveConfirm = useCallback(async () => {
    if (!moveConfirm.sourcePath || !moveConfirm.targetPath) return;

    const treeData = useTreeStore.getState().treeData;
    const result = await moveItem(
      moveConfirm.sourcePath,
      moveConfirm.targetPath,
      treeData,
    );
    if (result.code === CodeResult.Success && result.data) {
      setTreeData(result.data.treeData);
      if (!expandedKeys.has(moveConfirm.targetPath)) {
        toggleExpandedKey(moveConfirm.targetPath);
      }
    }
  }, [
    expandedKeys,
    moveConfirm.sourcePath,
    moveConfirm.targetPath,
    moveItem,
    setTreeData,
    toggleExpandedKey,
  ]);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: `${size}px`,
        transform: `translateY(${start}px)`,
        willChange: "transform",
      }}
    >
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div className="px-2">
            <div
              className={cn(
                "tree-node-row relative flex h-7 cursor-pointer select-none items-center rounded-md",
                isDropTarget &&
                  dropTargetFolderPath &&
                  "outline outline-1 outline-[var(--accent-color)]/40",
              )}
              style={{
                paddingLeft: `${flatNode.level * 14 + 8}px`,
                paddingRight: "8px",
                backgroundColor: isSelected
                  ? "var(--active-bg)"
                  : "transparent",
                boxShadow: isSelected
                  ? "inset 0 0 0 1px var(--border-color)"
                  : "none",
              }}
              onClick={() => onClick(flatNode)}
              draggable={!isRenaming}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="flex h-[26px] w-[12px] flex-shrink-0 items-center justify-center">
                {flatNode.isFolder ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClick(flatNode);
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
                {flatNode.isFolder ? (
                  <Folder
                    className="h-[14px] w-[14px]"
                    style={{ color: "var(--text-secondary)" }}
                  />
                ) : (
                  <File
                    className="h-[14px] w-[14px]"
                    style={{ color: "var(--text-muted)" }}
                  />
                )}
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
                  {flatNode.title}
                </span>
              )}
            </div>
          </div>
        </ContextMenu.Trigger>

        <ContextMenu.Portal>
          <ContextMenu.Content className={MENU_CONTENT_CLASS}>
            {flatNode.title.endsWith(".md") ? (
              <ContextMenu.Item
                className={MENU_ITEM_CLASS}
                onClick={() => {
                  void openFile(flatNode.key);
                }}
              >
                <File className="h-4 w-4" /> 打开
              </ContextMenu.Item>
            ) : null}

            {flatNode.title.endsWith(".md") ? (
              <ContextMenu.Item
                className={MENU_ITEM_CLASS}
                onClick={() => openCreateReminder(flatNode.key)}
              >
                <BellPlus className="h-4 w-4" /> 新建提醒事项
              </ContextMenu.Item>
            ) : null}

            <ContextMenu.Item
              className={MENU_ITEM_CLASS}
              onClick={() => {
                if (flatNode.isFolder) {
                  onCreateInFolder(flatNode.key, "file", flatNode.level + 1);
                } else {
                  const lastSep = Math.max(
                    flatNode.key.lastIndexOf("/"),
                    flatNode.key.lastIndexOf("\\"),
                  );
                  const parentKey =
                    lastSep > 0
                      ? flatNode.key.substring(0, lastSep)
                      : flatNode.key;
                  onCreateInFolder(parentKey, "file", flatNode.level);
                }
              }}
            >
              <Plus className="h-4 w-4" /> 新建文件
            </ContextMenu.Item>
            <ContextMenu.Item
              className={MENU_ITEM_CLASS}
              onClick={() => {
                if (flatNode.isFolder) {
                  onCreateInFolder(flatNode.key, "folder", flatNode.level + 1);
                } else {
                  const lastSep = Math.max(
                    flatNode.key.lastIndexOf("/"),
                    flatNode.key.lastIndexOf("\\"),
                  );
                  const parentKey =
                    lastSep > 0
                      ? flatNode.key.substring(0, lastSep)
                      : flatNode.key;
                  onCreateInFolder(parentKey, "folder", flatNode.level);
                }
              }}
            >
              <FolderPlus className="h-4 w-4" /> 新建文件夹
            </ContextMenu.Item>

            {!flatNode.isFolder ? (
              <ContextMenu.Item
                className={MENU_ITEM_CLASS}
                onClick={handleExport}
              >
                <FileOutput className="h-4 w-4" /> 导出
              </ContextMenu.Item>
            ) : null}

            {flatNode.title.endsWith(".md") ? (
              <ContextMenu.Item
                className={MENU_ITEM_CLASS}
                onClick={() => {
                  setTimeout(() => void handleDiff(), 0);
                }}
              >
                <GitCompare className="h-4 w-4" /> 比较差异
              </ContextMenu.Item>
            ) : null}

            <ContextMenu.Separator className={MENU_SEPARATOR_CLASS} />
            <ContextMenu.Item
              className={MENU_ITEM_CLASS}
              onClick={handleStartRename}
            >
              <Pencil className="h-4 w-4" /> 重命名
            </ContextMenu.Item>
            <ContextMenu.Item
              className={MENU_ITEM_CLASS}
              onClick={() => onDeleteNode(flatNode.key, flatNode.title)}
            >
              <Trash2 className="h-4 w-4" /> 删除
            </ContextMenu.Item>
            <ContextMenu.Separator className={MENU_SEPARATOR_CLASS} />
            <ContextMenu.Item
              className={MENU_ITEM_CLASS}
              onClick={() => void copyPath(flatNode.key)}
            >
              <Copy className="h-4 w-4" /> 复制路径
            </ContextMenu.Item>
            <ContextMenu.Item
              className={MENU_ITEM_CLASS}
              onClick={() => void openInNewWindow(flatNode.key)}
            >
              <ExternalLink className="h-4 w-4" /> 在新窗口中打开
            </ContextMenu.Item>
            <ContextMenu.Item
              className={MENU_ITEM_CLASS}
              onClick={() => void openInExplorer(flatNode.key)}
            >
              <ExternalLink className="h-4 w-4" /> {revealInFileManagerLabel}
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      <ConfirmDialog
        open={moveConfirm.open}
        onOpenChange={(open) => setMoveConfirm((prev) => ({ ...prev, open }))}
        title="确认移动"
        description={`确定要将「${moveConfirm.title}」移动到「${dropTargetFolderTitle}」文件夹中吗？`}
        confirmText="移动"
        onConfirm={handleMoveConfirm}
      />
    </div>
  );
});

// 创建输入框组件
function CreateInput({
  creatingInfo,
  parentKey,
  top,
  onCancel,
  onCreated,
}: {
  creatingInfo: CreatingInfo;
  parentKey: string;
  top: number;
  onCreated: (parentKey: string, newKey: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmedRef = useRef(false);
  const setTreeData = useTreeStore((state) => state.setTreeData);
  const { createFile, createFolder } = useElectron();

  useEffect(() => {
    if (inputRef.current) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, []);

  // 执行创建
  const doCreate = useCallback(async () => {
    const title = value.trim();
    if (!title) {
      onCancel();
      return;
    }

    const fn = creatingInfo.type === "file" ? createFile : createFolder;
    const treeData = useTreeStore.getState().treeData;
    const result = await fn(parentKey, title, treeData);
    if (result.code === CodeResult.Success && result.data) {
      const newKey = buildCreatedNodeKey(parentKey, title, creatingInfo.type);
      setTreeData(result.data.treeData);
      onCancel();
      onCreated(parentKey, newKey);
      return;
    }
    onCancel();
  }, [
    value,
    creatingInfo,
    parentKey,
    createFile,
    createFolder,
    setTreeData,
    onCreated,
    onCancel,
  ]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmedRef.current = true;
        void doCreate();
      }
      if (e.key === "Escape") {
        confirmedRef.current = true;
        onCancel();
      }
    },
    [doCreate, onCancel],
  );

  return (
    <div
      className="flex h-7 items-center rounded-md"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "calc(100% - 16px)",
        height: `${ROW_HEIGHT}px`,
        transform: `translateY(${top}px)`,
        paddingLeft: `${creatingInfo.level * 14 + 8}px`,
        paddingRight: "8px",
        marginLeft: "8px",
        zIndex: 10,
      }}
    >
      <div className="flex h-[26px] w-[12px] flex-shrink-0 items-center justify-center" />
      <div className="mr-[6px] flex h-[26px] w-[16px] flex-shrink-0 items-center justify-center">
        {creatingInfo.type === "file" ? (
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
        ref={inputRef}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (confirmedRef.current) {
            confirmedRef.current = false;
            return;
          }
          setTimeout(() => void doCreate(), 100);
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder={
          creatingInfo.type === "file" ? "输入文件名称" : "输入文件夹名称"
        }
        className="h-[22px] flex-1 rounded-[3px] px-[6px] text-[13px] outline-none focus:ring-1 focus:ring-[var(--border-color)]"
        style={{
          backgroundColor: "transparent",
          color: "var(--text-primary)",
        }}
      />
    </div>
  );
}
