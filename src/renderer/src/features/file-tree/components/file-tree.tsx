import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  memo,
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
  Pencil,
  Trash2,
  GitCompare,
} from "lucide-react";
import { useEditorStore } from "@/store/editor.store";
import { OutlinePanel } from "./outline-panel";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "@/hooks/use-electron";
import { QuickActionsPanel } from "./quick-actions-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContextMenu } from "@/components/ui/context-menu";
import { Tooltip } from "@/components/ui/tooltip";
import type { TreeNode as TreeNodeType } from "@/types";
import { CodeResult } from "@/types";
import { cn } from "@/lib/cn";
import {
  flattenTree,
  getRevealInFileManagerLabel,
  type FlatNode,
} from "../utils";

const MENU_CONTENT_CLASS =
  "z-[9999] min-w-[180px] rounded-md border p-1 shadow-lg bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-primary)]";
const MENU_ITEM_CLASS =
  "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-[var(--hover-bg)]";
const MENU_SEPARATOR_CLASS = "my-1 h-px bg-[var(--border-color)]";
const TOOL_BUTTON_CLASS =
  "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors";
const ROW_HEIGHT = 28; // 7 * 4 = 28px (h-7)

interface CreatingInfo {
  type: "file" | "folder";
  parentKey: string;
  level: number;
}

export function FileTree() {
  const treeData = useTreeStore((state) => state.treeData);
  const treeRoot = useTreeStore((state) => state.treeRoot);
  const setTreeData = useTreeStore((state) => state.setTreeData);
  const expandedKeys = useTreeStore((state) => state.expandedKeys);
  const selectedKey = useTreeStore((state) => state.selectedKey);
  const toggleExpandedKey = useTreeStore((state) => state.toggleExpandedKey);
  const setSelectedKey = useTreeStore((state) => state.setSelectedKey);
  const { openFolder, openInExplorer, openFile, createFile, createFolder } =
    useElectron();

  const appearance = useEditorStore((s) => s.appearance);
  const setSidebarView = useEditorStore((s) => s.setSidebarView);
  const sidebarView = appearance.sidebarView;

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [creatingInfo, setCreatingInfo] = useState<CreatingInfo | null>(null);
  const [createValue, setCreateValue] = useState("");
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const createInputRef = useRef<HTMLInputElement>(null);
  const confirmedRef = useRef(false);
  const isRootCreating = creatingInfo?.parentKey === treeRoot?.key;
  const revealInFileManagerLabel = getRevealInFileManagerLabel(
    window.electronAPI?.getPlatform(),
  );

  const isRootSelected = selectedKey === treeRoot?.key;
  const isRootExpanded = treeRoot ? expandedKeys.has(treeRoot.key) : false;

  // 从 store 获取大纲标题列表和活跃标题 ID
  const headings = useEditorStore((state) => state.outlineHeadings);
  const activeHeadingId = useEditorStore((state) => state.activeHeadingId);
  const setActiveHeadingId = useEditorStore(
    (state) => state.setActiveHeadingId,
  );

  // 处理大纲标题点击，滚动到对应位置
  const handleHeadingClick = useCallback(
    (id: string) => {
      setActiveHeadingId(id);
      window.__scrollToBlock?.(id);
    },
    [setActiveHeadingId],
  );

  useEffect(() => {
    if (isRootCreating && createInputRef.current) {
      requestAnimationFrame(() => createInputRef.current?.focus());
    }
  }, [isRootCreating]);

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
      setTreeData(r.data.treeData);
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
    return flattenTree(filteredTreeData, expandedKeys, 1);
  }, [filteredTreeData, expandedKeys, isRootExpanded]);

  // 处理节点点击
  const handleNodeClick = useCallback(
    (flatNode: FlatNode) => {
      setSelectedKey(flatNode.key);
      if (flatNode.isFolder) {
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
        setCreatingInfo({ type, parentKey, level });
      }
    },
    [],
  );

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

          <div className="flex-1 overflow-auto py-2 pb-12">
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
                        className="tree-node-root relative flex h-7 cursor-pointer select-none items-center rounded-md"
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
                    creatingInfo={creatingInfo}
                    isRootCreating={isRootCreating}
                    onClick={handleNodeClick}
                    onCreateInFolder={handleCreateInFolder}
                    openFile={openFile}
                    openInExplorer={openInExplorer}
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
            onClick={() => void openInExplorer(treeRoot.key)}
          >
            <ExternalLink className="h-4 w-4" /> {revealInFileManagerLabel}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

interface VirtualizedTreeListProps {
  flatNodes: FlatNode[];
  selectedKey: string | null;
  creatingInfo: CreatingInfo | null;
  isRootCreating: boolean;
  onClick: (flatNode: FlatNode) => void;
  onCreateInFolder: (
    parentKey: string,
    type: "file" | "folder",
    level: number,
  ) => void;
  openFile: (filePath: string) => Promise<void>;
  openInExplorer: (targetPath: string) => Promise<boolean>;
}

const VirtualizedTreeList = memo(function VirtualizedTreeList({
  flatNodes,
  selectedKey,
  creatingInfo,
  isRootCreating,
  onClick,
  onCreateInFolder,
  openFile,
  openInExplorer,
}: VirtualizedTreeListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const getItemKey = useCallback(
    (index: number) => flatNodes[index]?.key ?? index,
    [flatNodes],
  );

  // 虚拟滚动状态隔离在列表组件内，避免滚动时带动整个侧边栏重渲。
  const virtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey,
    overscan: 6,
  });

  return (
    <div
      ref={parentRef}
      className="overflow-auto"
      style={{
        height: `calc(100% - ${isRootCreating ? 36 : 0}px - 28px)`,
        contain: "strict",
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
          const flatNode = flatNodes[virtualItem.index];
          if (!flatNode) return null;
          const isCreatingHere = creatingInfo?.parentKey === flatNode.key;

          return (
            <VirtualTreeNode
              key={flatNode.key}
              flatNode={flatNode}
              size={virtualItem.size}
              start={virtualItem.start}
              isSelected={selectedKey === flatNode.key}
              isCreatingHere={isCreatingHere}
              creatingInfo={isCreatingHere ? creatingInfo : null}
              onClick={onClick}
              onCreateInFolder={onCreateInFolder}
              openFile={openFile}
              openInExplorer={openInExplorer}
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
  isCreatingHere: boolean;
  creatingInfo: CreatingInfo | null;
  onClick: (flatNode: FlatNode) => void;
  onCreateInFolder: (
    parentKey: string,
    type: "file" | "folder",
    level: number,
  ) => void;
  openFile: (filePath: string) => Promise<void>;
  openInExplorer: (targetPath: string) => Promise<boolean>;
}

const VirtualTreeNode = memo(function VirtualTreeNode({
  flatNode,
  size,
  start,
  isSelected,
  isCreatingHere,
  creatingInfo,
  onClick,
  onCreateInFolder,
  openFile,
  openInExplorer,
}: VirtualTreeNodeProps) {
  const revealInFileManagerLabel = getRevealInFileManagerLabel(
    window.electronAPI?.getPlatform(),
  );

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
              className="tree-node-row relative flex h-7 cursor-pointer select-none items-center rounded-md"
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
                onClick={() => {
                  // diff 功能保持原有逻辑
                }}
              >
                <GitCompare className="h-4 w-4" /> 比较差异
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
            <ContextMenu.Separator className={MENU_SEPARATOR_CLASS} />
            <ContextMenu.Item
              className={MENU_ITEM_CLASS}
              onClick={() => {
                // 重命名功能需要额外状态管理
              }}
            >
              <Pencil className="h-4 w-4" /> 重命名
            </ContextMenu.Item>
            <ContextMenu.Item
              className={MENU_ITEM_CLASS}
              onClick={() => {
                // 删除功能需要额外状态管理
              }}
            >
              <Trash2 className="h-4 w-4" /> 删除
            </ContextMenu.Item>
            <ContextMenu.Separator className={MENU_SEPARATOR_CLASS} />
            <ContextMenu.Item
              className={MENU_ITEM_CLASS}
              onClick={() => void openInExplorer(flatNode.key)}
            >
              <ExternalLink className="h-4 w-4" /> {revealInFileManagerLabel}
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {/* 创建输入框 */}
      {isCreatingHere ? (
        <CreateInput
          creatingInfo={creatingInfo}
          onCancel={() => onCreateInFolder("", "file", 0)}
        />
      ) : null}
    </div>
  );
});

// 创建输入框组件
function CreateInput({
  creatingInfo,
  onCancel,
}: {
  creatingInfo: CreatingInfo;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmedRef = useRef(false);

  useEffect(() => {
    if (inputRef.current) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmedRef.current = true;
        // 创建逻辑
        onCancel();
      }
      if (e.key === "Escape") {
        confirmedRef.current = true;
        onCancel();
      }
    },
    [onCancel],
  );

  return (
    <div
      className="mx-2 mb-1 flex h-7 animate-fade-in items-center rounded-md"
      style={{
        paddingLeft: `${creatingInfo.level * 14 + 8}px`,
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
          setTimeout(() => onCancel(), 100);
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder={
          creatingInfo.type === "file" ? "输入文件名称" : "输入文件夹名称"
        }
        className="h-[22px] flex-1 rounded-[3px] px-[6px] text-[13px] outline-none"
        style={{
          backgroundColor: "transparent",
          border: "1px solid transparent",
          color: "var(--text-primary)",
        }}
      />
    </div>
  );
}
