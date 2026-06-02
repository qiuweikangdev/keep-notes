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
  Plus,
  FolderPlus,
  Search,
  X,
  ExternalLink,
} from "lucide-react";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "@/hooks/use-electron";
import { TreeNode } from "./tree-node";
import { QuickActionsPanel } from "./quick-actions-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContextMenu } from "@/components/ui/context-menu";
import type { TreeNode as TreeNodeType } from "@/types";
import { CodeResult } from "@/types";

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

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [creatingInfo, setCreatingInfo] = useState<CreatingInfo | null>(null);
  const [createValue, setCreateValue] = useState("");
  const createInputRef = useRef<HTMLInputElement>(null);
  const confirmedRef = useRef(false);
  const isRootCreating = creatingInfo?.parentKey === treeRoot?.key;

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
      <div className="flex h-full flex-col">
        <div className="flex flex-1 items-center justify-center p-4">
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            没有打开的文件夹
          </p>
        </div>

        <QuickActionsPanel
          onToggleSearch={handleToggleSearch}
          onStartCreateFile={handleStartCreateFile}
          onStartCreateFolder={handleStartCreateFolder}
        />
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
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md"
                style={{ backgroundColor: "var(--bg-tertiary)" }}
              >
                <FolderOpen
                  className="h-[14px] w-[14px] flex-shrink-0"
                  style={{ color: "var(--text-secondary)" }}
                />
              </div>
              <span
                className="truncate text-[13px] font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                {treeRoot.title}
              </span>
            </div>
            <button
              type="button"
              className={TOOL_BUTTON_CLASS}
              style={{ color: "var(--text-muted)" }}
              title={showSearch ? "关闭搜索" : "搜索文件"}
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
            <button
              type="button"
              className={TOOL_BUTTON_CLASS}
              style={{ color: "var(--text-muted)" }}
              title="新建文件"
              onClick={handleStartCreateFile}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={TOOL_BUTTON_CLASS}
              style={{ color: "var(--text-muted)" }}
              title="新建文件夹"
              onClick={handleStartCreateFolder}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-auto py-2">
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

            {filteredTreeData.length > 0 ? (
              filteredTreeData.map((node) => (
                <TreeNode
                  key={node.key}
                  node={node}
                  level={0}
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
            ) : (
              <div
                className="flex h-28 items-center justify-center text-[12px]"
                style={{ color: "var(--text-muted)" }}
              >
                {searchQuery ? "没有匹配的文件" : "文件夹为空"}
              </div>
            )}
          </div>

          <QuickActionsPanel
            onToggleSearch={handleToggleSearch}
            onStartCreateFile={handleStartCreateFile}
            onStartCreateFolder={handleStartCreateFolder}
          />
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
