import { useCallback } from "react";
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
} from "lucide-react";
import { useTreeStore } from "@/store/tree.store";
import { useEditorStore } from "@/store/editor.store";
import { useElectron } from "@/hooks/use-electron";
import { cn } from "@/lib/cn";
import { ContextMenu } from "@/components/ui/context-menu";
import { CodeResult } from "@/types";
import type { TreeNode as TreeNodeType } from "@/types";

export function Sidebar() {
  const {
    treeData,
    treeRoot,
    setTreeData,
    selectedKey,
    setSelectedKey,
    expandedKeys,
    toggleExpandedKey,
  } = useTreeStore();
  const { filePath } = useEditorStore();
  const {
    openFolder,
    openFile,
    createFile,
    createFolder,
    renameItem,
    deleteItem,
  } = useElectron();

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

  const renderTreeNode = (node: TreeNodeType, level: number) => {
    const isExpanded = expandedKeys.includes(node.key);
    const isSelected = selectedKey === node.key || filePath === node.key;
    const hasChildren = node.children && node.children.length > 0;
    const isMarkdown = node.title.endsWith(".md");
    const isFolder = hasChildren || (!isMarkdown && !node.title.includes("."));

    const handleClick = () => {
      setSelectedKey(node.key);
      if (hasChildren) {
        toggleExpandedKey(node.key);
      } else if (isMarkdown) {
        openFile(node.key);
      }
    };

    const handleRename = async () => {
      const title = prompt("请输入新名称:", node.title.replace(".md", ""));
      if (title) {
        const result = await renameItem(node.key, title, treeData);
        if (result.code === CodeResult.Success && result.data) {
          setTreeData(result.data.treeData);
        }
      }
    };

    const handleDelete = async () => {
      if (confirm(`确定要删除 ${node.title} 吗？`)) {
        const result = await deleteItem(node.key, node.title, treeData);
        if (result.code === CodeResult.Success && result.data) {
          setTreeData(result.data.treeData);
        }
      }
    };

    return (
      <ContextMenu.Root key={node.key}>
        <ContextMenu.Trigger>
          <div
            className={cn(
              "group flex items-center h-[28px] px-3 cursor-pointer text-[13px] rounded-md mx-1 transition-all",
            )}
            style={{
              paddingLeft: `${level * 14 + 8}px`,
              backgroundColor: isSelected ? "var(--active-bg)" : "transparent",
              color: isSelected ? "var(--accent-color)" : "var(--text-primary)",
            }}
            onClick={handleClick}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          >
            {hasChildren ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpandedKey(node.key);
                }}
                className="flex items-center justify-center w-4 h-4 mr-1 flex-shrink-0"
              >
                {isExpanded ? (
                  <ChevronDown
                    className="h-3 w-3"
                    style={{ color: "var(--text-muted)" }}
                  />
                ) : (
                  <ChevronRight
                    className="h-3 w-3"
                    style={{ color: "var(--text-muted)" }}
                  />
                )}
              </button>
            ) : (
              <div className="w-4 mr-1 flex-shrink-0" />
            )}

            {isFolder ? (
              isExpanded ? (
                <FolderOpen
                  className="h-4 w-4 mr-2 flex-shrink-0"
                  style={{ color: "#f0a020" }}
                />
              ) : (
                <Folder
                  className="h-4 w-4 mr-2 flex-shrink-0"
                  style={{ color: "#f0a020" }}
                />
              )
            ) : (
              <File
                className="h-4 w-4 mr-2 flex-shrink-0"
                style={{ color: "var(--accent-color)" }}
              />
            )}

            <span className="truncate flex-1">{node.title}</span>
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Content className="min-w-[160px] rounded-lg shadow-lg">
          {isFolder && (
            <>
              <ContextMenu.Item
                onClick={handleCreateFile}
                className="rounded-md"
              >
                <Plus className="mr-2 h-4 w-4" />
                新建文件
              </ContextMenu.Item>
              <ContextMenu.Item
                onClick={handleCreateFolder}
                className="rounded-md"
              >
                <FolderPlus className="mr-2 h-4 w-4" />
                新建文件夹
              </ContextMenu.Item>
              <ContextMenu.Separator />
            </>
          )}
          <ContextMenu.Item onClick={handleRename} className="rounded-md">
            <Pencil className="mr-2 h-4 w-4" />
            重命名
          </ContextMenu.Item>
          <ContextMenu.Item
            onClick={handleDelete}
            className="rounded-md text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            删除
          </ContextMenu.Item>
        </ContextMenu.Content>
        {isExpanded && hasChildren && (
          <div>
            {node.children!.map((child) => renderTreeNode(child, level + 1))}
          </div>
        )}
      </ContextMenu.Root>
    );
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {/* 头部 */}
      <div
        className="flex items-center justify-between h-[40px] px-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border-color)" }}
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          文件
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleCreateFile}
            className="flex items-center justify-center w-6 h-6 rounded-md transition-all"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
            title="新建文件"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handleCreateFolder}
            className="flex items-center justify-center w-6 h-6 rounded-md transition-all"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
            title="新建文件夹"
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={openFolder}
            className="flex items-center justify-center w-6 h-6 rounded-md transition-all"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
            title="打开文件夹"
          >
            <Folder className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 文件树 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {!treeRoot ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: "var(--hover-bg)" }}
            >
              <Folder
                className="h-6 w-6"
                style={{ color: "var(--text-muted)" }}
              />
            </div>
            <div className="text-center space-y-2">
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                尚未打开文件夹
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                打开一个文件夹开始管理你的笔记
              </p>
              <button
                onClick={openFolder}
                className="mt-2 px-4 py-1.5 text-xs font-medium text-white rounded-lg transition-colors"
                style={{ backgroundColor: "var(--accent-color)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "0.9";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "1";
                }}
              >
                打开文件夹
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* 根目录 */}
            <div
              className="flex items-center h-[30px] px-3 cursor-pointer text-[13px] font-medium rounded-md mx-1 transition-all"
              style={{ color: "var(--text-primary)" }}
              onClick={() => {
                if (treeRoot) {
                  toggleExpandedKey(treeRoot.key);
                }
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              {expandedKeys.includes(treeRoot.key) ? (
                <ChevronDown
                  className="h-3 w-3 mr-1"
                  style={{ color: "var(--text-muted)" }}
                />
              ) : (
                <ChevronRight
                  className="h-3 w-3 mr-1"
                  style={{ color: "var(--text-muted)" }}
                />
              )}
              <FolderOpen
                className="h-4 w-4 mr-2"
                style={{ color: "#f0a020" }}
              />
              <span className="truncate">{treeRoot.title}</span>
            </div>

            {/* 子节点 */}
            {expandedKeys.includes(treeRoot.key) && (
              <div className="mt-0.5">
                {treeData.map((node) => renderTreeNode(node, 1))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
