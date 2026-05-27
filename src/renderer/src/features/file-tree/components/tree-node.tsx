import { useState, useCallback, memo } from "react";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Plus,
  FolderPlus,
  Pencil,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "@/hooks/use-electron";
import { cn } from "@/lib/cn";
import type { TreeNode as TreeNodeType } from "@/types";
import { ContextMenu } from "@/components/ui/context-menu";
import { Button } from "@/components/ui/button";
import { CodeResult } from "@/types";

interface TreeNodeProps {
  node: TreeNodeType;
  level: number;
}

export const TreeNode = memo(function TreeNode({ node, level }: TreeNodeProps) {
  const {
    selectedKey,
    expandedKeys,
    setSelectedKey,
    toggleExpandedKey,
    setTreeData,
    treeData,
  } = useTreeStore();
  const { openFile, createFile, createFolder, renameItem, deleteItem } =
    useElectron();
  const [isHovered, setIsHovered] = useState(false);
  const isExpanded = expandedKeys.includes(node.key);
  const isSelected = selectedKey === node.key;
  const hasChildren = node.children && node.children.length > 0;
  const isMarkdown = node.title.endsWith(".md");
  const isFolder = hasChildren || !isMarkdown;

  const handleClick = useCallback(() => {
    setSelectedKey(node.key);
    if (hasChildren) {
      toggleExpandedKey(node.key);
    } else if (isMarkdown) {
      openFile(node.key);
    }
  }, [
    node.key,
    hasChildren,
    isMarkdown,
    setSelectedKey,
    toggleExpandedKey,
    openFile,
  ]);

  const handleCreateFile = useCallback(async () => {
    const title = prompt("请输入文件名:");
    if (title) {
      const result = await createFile(node.key, title, treeData);
      if (result.code === CodeResult.Success && result.data) {
        setTreeData(result.data.treeData);
      }
    }
  }, [node.key, treeData, createFile, setTreeData]);

  const handleCreateFolder = useCallback(async () => {
    const title = prompt("请输入文件夹名:");
    if (title) {
      const result = await createFolder(node.key, title, treeData);
      if (result.code === CodeResult.Success && result.data) {
        setTreeData(result.data.treeData);
      }
    }
  }, [node.key, treeData, createFolder, setTreeData]);

  const handleRename = useCallback(async () => {
    const title = prompt("请输入新名称:", node.title.replace(".md", ""));
    if (title) {
      const result = await renameItem(node.key, title, treeData);
      if (result.code === CodeResult.Success && result.data) {
        setTreeData(result.data.treeData);
      }
    }
  }, [node.key, node.title, treeData, renameItem, setTreeData]);

  const handleDelete = useCallback(async () => {
    if (confirm(`确定要删除 ${node.title} 吗？`)) {
      const result = await deleteItem(node.key, node.title, treeData);
      if (result.code === CodeResult.Success && result.data) {
        setTreeData(result.data.treeData);
      }
    }
  }, [node.key, node.title, treeData, deleteItem, setTreeData]);

  // 获取文件图标颜色
  const getFileIconColor = () => {
    if (isFolder) return "text-yellow-500";
    if (isMarkdown) return "text-blue-500";
    return "text-gray-500";
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <div
          className={cn(
            "group flex items-center gap-1.5 px-2 py-1 cursor-pointer transition-colors",
            "hover:bg-accent/50",
            isSelected && "bg-accent text-accent-foreground",
          )}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={handleClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* 展开/折叠图标 */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpandedKey(node.key);
              }}
              className="flex items-center justify-center w-4 h-4 hover:bg-accent-foreground/10 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          ) : (
            <div className="w-4" />
          )}

          {/* 文件/文件夹图标 */}
          <div className={cn("flex-shrink-0", getFileIconColor())}>
            {isFolder ? (
              isExpanded ? (
                <FolderOpen className="h-4 w-4" />
              ) : (
                <Folder className="h-4 w-4" />
              )
            ) : (
              <File className="h-4 w-4" />
            )}
          </div>

          {/* 文件名 */}
          <span className="flex-1 truncate text-sm">{node.title}</span>

          {/* 操作按钮 */}
          {isHovered && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {isFolder && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreateFile();
                    }}
                    title="新建文件"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Content className="w-48">
        {isFolder && (
          <>
            <ContextMenu.Item onClick={handleCreateFile}>
              <Plus className="mr-2 h-4 w-4" />
              新建文件
            </ContextMenu.Item>
            <ContextMenu.Item onClick={handleCreateFolder}>
              <FolderPlus className="mr-2 h-4 w-4" />
              新建文件夹
            </ContextMenu.Item>
            <ContextMenu.Separator />
          </>
        )}
        <ContextMenu.Item onClick={handleRename}>
          <Pencil className="mr-2 h-4 w-4" />
          重命名
        </ContextMenu.Item>
        <ContextMenu.Item onClick={handleDelete} className="text-destructive">
          <Trash2 className="mr-2 h-4 w-4" />
          删除
        </ContextMenu.Item>
      </ContextMenu.Content>
      {isExpanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode key={child.key} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </ContextMenu.Root>
  );
});
