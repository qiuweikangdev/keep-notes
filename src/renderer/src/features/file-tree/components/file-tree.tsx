import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type KeyboardEvent,
} from "react";
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
} from "lucide-react";
import { useEditorStore } from "@/store/editor.store";
import { OutlinePanel } from "./outline-panel";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "@/hooks/use-electron";
import { TreeNode } from "./tree-node";
import { QuickActionsPanel } from "./quick-actions-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContextMenu } from "@/components/ui/context-menu";
import { Tooltip } from "@/components/ui/tooltip";
import type { TreeNode as TreeNodeType } from "@/types";
import { CodeResult } from "@/types";
import { cn } from "@/lib/cn";

const MENU_CONTENT_CLASS =
  "z-[9999] min-w-[180px] rounded-md border p-1 shadow-lg bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-primary)]";
const MENU_ITEM_CLASS =
  "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-[var(--hover-bg)]";
const MENU_SEPARATOR_CLASS = "my-1 h-px bg-[var(--border-color)]";
const TOOL_BUTTON_CLASS =
  "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors";

interface CreatingInfo {
  type: "file" | "folder";
  parentKey: string;
  level: number;
}

export function FileTree() {
  const { treeData, treeRoot, setTreeData } = useTreeStore();
  const { openFolder, openInExplorer, createFile, createFolder } =
    useElectron();

  const appearance = useEditorStore((s) => s.appearance);
  const setSidebarView = useEditorStore((s) => s.setSidebarView);
  const sidebarView = appearance.sidebarView;

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [creatingInfo, setCreatingInfo] = useState<CreatingInfo | null>(null);
  const [createValue, setCreateValue] = useState("");
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [isRootHovered, setIsRootHovered] = useState(false);
  const createInputRef = useRef<HTMLInputElement>(null);
  const confirmedRef = useRef(false);
  const isRootCreating = creatingInfo?.parentKey === treeRoot?.key;

  const isRootSelected = useTreeStore(
    (state) => state.selectedKey === treeRoot?.key,
  );
  const isRootExpanded = useTreeStore((state) =>
    treeRoot ? state.expandedKeys.has(treeRoot.key) : false,
  );
  const toggleExpandedKey = useTreeStore((state) => state.toggleExpandedKey);
  const setSelectedKey = useTreeStore((state) => state.setSelectedKey);

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

  if (!treeRoot) {
    return (
      <div className="relative h-full flex-col">
        <div
          className="absolute inset-0 flex items-center justify-center p-4 transition-opacity duration-150"
          style={{
            opacity: isPanelExpanded ? 0 : 1,
            pointerEvents: isPanelExpanded ? "none" : "auto",
          }}
        >
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            没有打开的文件夹
          </p>
        </div>

        <div className="absolute bottom-0 left-0 right-0">
          <QuickActionsPanel onExpandedChange={setIsPanelExpanded} />
        </div>
      </div>
    );
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className="flex h-full flex-col">
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

          <div className="flex-1 overflow-auto py-2">
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
                          "relative flex h-7 cursor-pointer select-none items-center rounded-md",
                        )}
                        style={{
                          paddingLeft: "8px",
                          paddingRight: "8px",
                          backgroundColor: isRootSelected
                            ? "var(--active-bg)"
                            : isRootHovered
                              ? "var(--hover-bg)"
                              : "transparent",
                          boxShadow: isRootSelected
                            ? "inset 0 0 0 1px var(--border-color)"
                            : "none",
                        }}
                        onClick={() => {
                          setSelectedKey(treeRoot!.key);
                          toggleExpandedKey(treeRoot!.key);
                        }}
                        onMouseEnter={() => setIsRootHovered(true)}
                        onMouseLeave={() => setIsRootHovered(false)}
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
                        <ExternalLink className="h-4 w-4" /> 在资源管理器中显示
                      </ContextMenu.Item>
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                </ContextMenu.Root>

                {/* 子节点 */}
                {isRootExpanded && filteredTreeData.length > 0 ? (
                  filteredTreeData.map((node) => (
                    <TreeNode
                      key={node.key}
                      node={node}
                      level={1}
                      creatingInfo={creatingInfo}
                      onCreateInFolder={(parentKey, type, lvl) => {
                        if (!parentKey) {
                          setCreatingInfo(null);
                        } else {
                          setCreatingInfo({ type, parentKey, level: lvl });
                        }
                      }}
                    />
                  ))
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

          <QuickActionsPanel />
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
            <ExternalLink className="h-4 w-4" /> 在资源管理器中显示
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
