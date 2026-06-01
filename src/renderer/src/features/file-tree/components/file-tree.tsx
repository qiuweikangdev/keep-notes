import { useState, useCallback, useMemo, type KeyboardEvent } from "react";
import {
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContextMenu } from "@/components/ui/context-menu";
import type { TreeNode as TreeNodeType } from "@/types";

const MENU_CONTENT_CLASS =
  "z-[9999] min-w-[180px] rounded-md border p-1 shadow-lg bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-primary)]";
const MENU_ITEM_CLASS =
  "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] outline-none data-[highlighted]:bg-[var(--hover-bg)]";
const MENU_SEPARATOR_CLASS = "my-1 h-px bg-[var(--border-color)]";

interface CreatingInfo {
  type: "file" | "folder";
  parentKey: string;
  level: number;
}

export function FileTree() {
  const { treeData, treeRoot } = useTreeStore();
  const { openFolder, openInExplorer } = useElectron();

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [creatingInfo, setCreatingInfo] = useState<CreatingInfo | null>(null);

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
          <div className="flex-1 overflow-auto pt-[6px]">
            <div className="flex h-[26px] items-center px-[12px]">
              <div className="flex flex-1 items-center gap-[6px]">
                <FolderOpen
                  className="h-[14px] w-[14px] flex-shrink-0"
                  style={{ color: "#c9a227" }}
                />
                <span
                  className="truncate text-[13px] font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {treeRoot.title}
                </span>
              </div>
            </div>

            {showSearch ? (
              <div className="px-3 py-2">
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
