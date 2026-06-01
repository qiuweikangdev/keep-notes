import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type KeyboardEvent,
} from "react";
import {
  FolderOpen,
  Plus,
  FolderPlus,
  Search,
  X,
  File,
  Folder,
  ExternalLink,
} from "lucide-react";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "@/hooks/use-electron";
import { TreeNode } from "./tree-node";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContextMenu } from "@/components/ui/context-menu";
import { CodeResult } from "@/types";
import type { TreeNode as TreeNodeType } from "@/types";

const MENU_CONTENT_CLASS =
  "z-[9999] min-w-[180px] rounded-md border p-1 shadow-lg bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-primary)]";
const MENU_ITEM_CLASS =
  "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-[var(--hover-bg)]";
const MENU_SEPARATOR_CLASS = "my-1 h-px bg-[var(--border-color)]";

export function FileTree() {
  const { treeData, treeRoot, setTreeData } = useTreeStore();
  const { openFolder, createFile, createFolder, openInExplorer } =
    useElectron();

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [isCreating, setIsCreating] = useState<"file" | "folder" | null>(null);
  const [createValue, setCreateValue] = useState("");
  const createInputRef = useRef<HTMLInputElement>(null);

  const handleSelectDir = useCallback(async () => {
    await openFolder();
  }, [openFolder]);

  const handleStartCreateFile = useCallback(() => {
    setIsCreating("file");
    setCreateValue("");
  }, []);

  const handleStartCreateFolder = useCallback(() => {
    setIsCreating("folder");
    setCreateValue("");
  }, []);

  useEffect(() => {
    if (isCreating && createInputRef.current) {
      createInputRef.current.focus();
    }
  }, [isCreating]);

  const handleCreateConfirm = useCallback(async () => {
    if (!treeRoot || !isCreating) {
      setIsCreating(null);
      return;
    }

    const title = createValue.trim();
    if (!title) {
      setIsCreating(null);
      return;
    }

    const fn = isCreating === "file" ? createFile : createFolder;
    const result = await fn(treeRoot.key, title, treeData);
    if (result.code === CodeResult.Success && result.data) {
      setTreeData(result.data.treeData);
    }

    setIsCreating(null);
    setCreateValue("");
  }, [
    createValue,
    isCreating,
    treeRoot,
    treeData,
    createFile,
    createFolder,
    setTreeData,
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
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-xl"
          style={{ backgroundColor: "var(--bg-secondary)" }}
        >
          <FolderOpen
            className="h-7 w-7"
            style={{ color: "var(--text-muted)" }}
          />
        </div>
        <div className="space-y-1 text-center">
          <p
            className="text-[13px] font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            未打开文件夹
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            打开一个文件夹开始管理你的笔记
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleSelectDir}>
          <FolderOpen className="mr-2 h-4 w-4" />
          打开文件夹
        </Button>
      </div>
    );
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className="flex h-full flex-col">
          <div
            className="flex h-[35px] flex-shrink-0 items-center justify-between px-3"
            style={{ borderBottom: "1px solid var(--border-color)" }}
          >
            <span
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              资源管理器
            </span>
            <div className="flex items-center gap-[2px]">
              <button
                className="flex h-[22px] w-[22px] items-center justify-center rounded-[3px] hover:bg-[var(--hover-bg)]"
                onClick={() => setShowSearch((prev) => !prev)}
                title="搜索"
              >
                <Search
                  className="h-3.5 w-3.5"
                  style={{ color: "var(--text-muted)" }}
                />
              </button>
            </div>
          </div>

          <div
            className="flex h-[22px] items-center px-[4px]"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            <div className="flex flex-1 items-center gap-[2px] px-[4px]">
              <FolderOpen
                className="h-[18px] w-[18px] flex-shrink-0"
                style={{ color: "#dcb67a" }}
              />
              <span
                className="truncate text-[13px] font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {treeRoot.title}
              </span>
            </div>
          </div>

          {showSearch ? (
            <div
              className="px-2 py-1.5"
              style={{ borderBottom: "1px solid var(--border-color)" }}
            >
              <div className="relative">
                <Search
                  className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
                  style={{ color: "var(--text-muted)" }}
                />
                <Input
                  placeholder="搜索文件..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 pl-7 pr-7 text-[12px]"
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

          <div className="flex-1 overflow-auto">
            {filteredTreeData.length > 0 ? (
              filteredTreeData.map((node) => (
                <TreeNode key={node.key} node={node} level={0} />
              ))
            ) : (
              <div
                className="flex h-28 items-center justify-center text-[12px]"
                style={{ color: "var(--text-muted)" }}
              >
                {searchQuery ? "没有匹配的文件" : "文件夹为空"}
              </div>
            )}

            {isCreating ? (
              <div
                className="flex h-[22px] items-center"
                style={{ paddingLeft: "20px", paddingRight: "4px" }}
              >
                <div className="h-[22px] w-[16px] flex-shrink-0" />
                <div className="mr-[4px] flex h-[22px] w-[18px] flex-shrink-0 items-center justify-center">
                  {isCreating === "file" ? (
                    <File
                      className="h-[18px] w-[18px]"
                      style={{ color: "#519aba" }}
                    />
                  ) : (
                    <Folder
                      className="h-[18px] w-[18px]"
                      style={{ color: "#dcb67a" }}
                    />
                  )}
                </div>
                <input
                  ref={createInputRef}
                  value={createValue}
                  onChange={(e) => setCreateValue(e.target.value)}
                  onKeyDown={handleCreateKeyDown}
                  onBlur={() => void handleCreateConfirm()}
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
              </div>
            ) : null}
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
            <ExternalLink className="h-4 w-4" /> 在资源管理器中显示
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
