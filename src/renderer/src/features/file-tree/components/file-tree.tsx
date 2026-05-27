import { useState, useCallback, useMemo } from "react";
import {
  FolderOpen,
  Plus,
  FolderPlus,
  Search,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "@/hooks/use-electron";
import { TreeNode } from "./tree-node";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContextMenu } from "@/components/ui/context-menu";
import { CodeResult } from "@/types";
import type { TreeNode as TreeNodeType } from "@/types";

export function FileTree() {
  const { treeData, treeRoot, setTreeData } = useTreeStore();
  const { openFolder, createFile, createFolder } = useElectron();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const handleSelectDir = useCallback(async () => {
    await openFolder();
  }, [openFolder]);

  const handleCreateFile = useCallback(async () => {
    if (!treeRoot) return;
    const title = prompt("请输入文件名:");
    if (title) {
      const result = await createFile(treeRoot.key, title, treeData);
      if (result.code === CodeResult.Success && result.data) {
        setTreeData(result.data.treeData);
      }
    }
  }, [treeRoot, treeData, createFile, setTreeData]);

  const handleCreateFolder = useCallback(async () => {
    if (!treeRoot) return;
    const title = prompt("请输入文件夹名:");
    if (title) {
      const result = await createFolder(treeRoot.key, title, treeData);
      if (result.code === CodeResult.Success && result.data) {
        setTreeData(result.data.treeData);
      }
    }
  }, [treeRoot, treeData, createFolder, setTreeData]);

  // 过滤搜索结果
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
      <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground p-4">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <FolderOpen className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-sm font-medium">未打开文件夹</p>
          <p className="text-xs text-muted-foreground/70">
            打开一个文件夹开始管理你的笔记
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleSelectDir}>
          <FolderOpen className="h-4 w-4 mr-2" />
          打开文件夹
        </Button>
      </div>
    );
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <div className="h-full flex flex-col">
          {/* 文件树头部 */}
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium truncate">
                {treeRoot.title}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setShowSearch(!showSearch)}
              >
                <Search className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* 搜索框 */}
          {showSearch && (
            <div className="px-2 py-1.5 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="搜索文件..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-7 pl-7 pr-7 text-xs"
                  autoFocus
                />
                {searchQuery && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5"
                    onClick={() => setSearchQuery("")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* 文件树内容 */}
          <div className="flex-1 overflow-auto py-1">
            {filteredTreeData.length > 0 ? (
              filteredTreeData.map((node) => (
                <TreeNode key={node.key} node={node} level={0} />
              ))
            ) : (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
                {searchQuery ? "没有匹配的文件" : "文件夹为空"}
              </div>
            )}
          </div>

          {/* 底部操作栏 */}
          <div className="border-t">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs text-muted-foreground">
                {treeData.length} 个项目
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleCreateFile}
                  title="新建文件"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleCreateFolder}
                  title="新建文件夹"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Content className="w-48">
        <ContextMenu.Item onClick={handleCreateFile}>
          <Plus className="mr-2 h-4 w-4" />
          新建文件
        </ContextMenu.Item>
        <ContextMenu.Item onClick={handleCreateFolder}>
          <FolderPlus className="mr-2 h-4 w-4" />
          新建文件夹
        </ContextMenu.Item>
        <ContextMenu.Separator />
        <ContextMenu.Item onClick={handleSelectDir}>
          <FolderOpen className="mr-2 h-4 w-4" />
          打开其他文件夹
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
}
