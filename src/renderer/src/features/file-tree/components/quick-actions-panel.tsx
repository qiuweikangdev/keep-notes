import { useState, useCallback } from "react";
import {
  Plus,
  Search,
  FolderOpen,
  RefreshCw,
  ExternalLink,
  FolderMinus,
  ChevronUp,
  ChevronDown,
  FileText,
  FolderPlus,
  File,
  X,
} from "lucide-react";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "@/hooks/use-electron";

interface QuickActionsPanelProps {
  onToggleSearch: () => void;
  onStartCreateFile: () => void;
  onStartCreateFolder: () => void;
}

export function QuickActionsPanel({
  onToggleSearch,
  onStartCreateFile,
  onStartCreateFolder,
}: QuickActionsPanelProps) {
  const {
    treeRoot,
    recentFolders,
    recentFiles,
    removeRecentFolder,
    removeRecentFile,
  } = useTreeStore();
  const { openFolder, loadTree, openInExplorer, openFile } = useElectron();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"folders" | "files">("folders");

  const handleOpenFolder = useCallback(async () => {
    await openFolder();
  }, [openFolder]);

  const handleOpenInExplorer = useCallback(() => {
    if (treeRoot) {
      void openInExplorer(treeRoot.key);
    }
  }, [treeRoot, openInExplorer]);

  const handleRefresh = useCallback(() => {
    if (treeRoot) {
      void loadTree(treeRoot.key);
    }
  }, [treeRoot, loadTree]);

  const handleOpenRecentFolder = useCallback(
    (path: string) => {
      void loadTree(path);
    },
    [loadTree],
  );

  const handleOpenRecentFile = useCallback(
    (path: string) => {
      void openFile(path);
    },
    [openFile],
  );

  const handleRemoveRecentFolder = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      removeRecentFolder(path);
    },
    [removeRecentFolder],
  );

  const handleRemoveRecentFile = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      removeRecentFile(path);
    },
    [removeRecentFile],
  );

  // 是否有最近内容可显示
  const hasRecentContent = recentFolders.length > 0 || recentFiles.length > 0;

  return (
    <div
      className="flex-shrink-0"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {/* 主工具栏 - 图标按钮 */}
      <div
        className="flex items-center justify-between px-1 py-1"
        style={{ borderTop: "1px solid var(--border-color)" }}
      >
        <div className="flex items-center gap-0.5">
          {treeRoot && (
            <>
              <ToolButton
                icon={<FileText className="h-3.5 w-3.5" />}
                tooltip="新建文件"
                onClick={onStartCreateFile}
              />
              <ToolButton
                icon={<FolderPlus className="h-3.5 w-3.5" />}
                tooltip="新建文件夹"
                onClick={onStartCreateFolder}
              />
              <ToolButton
                icon={<Search className="h-3.5 w-3.5" />}
                tooltip="搜索"
                onClick={onToggleSearch}
              />
              <div
                className="mx-1 h-3.5 w-px"
                style={{ backgroundColor: "var(--border-color)" }}
              />
            </>
          )}
          <ToolButton
            icon={<FolderOpen className="h-3.5 w-3.5" />}
            tooltip="打开文件夹"
            onClick={handleOpenFolder}
          />
          {treeRoot && (
            <>
              <ToolButton
                icon={<ExternalLink className="h-3.5 w-3.5" />}
                tooltip="在资源管理器中显示"
                onClick={handleOpenInExplorer}
              />
              <ToolButton
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                tooltip="刷新"
                onClick={handleRefresh}
              />
            </>
          )}
        </div>
        {hasRecentContent && (
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded transition-colors"
            style={{ color: "var(--text-muted)" }}
            onClick={() => setIsExpanded(!isExpanded)}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {/* 最近使用面板 */}
      {isExpanded && hasRecentContent && (
        <div
          className="px-2 pb-2"
          style={{ borderTop: "1px solid var(--border-color)" }}
        >
          <div className="pt-2">
            {/* 标签切换 */}
            <div className="mb-2 flex gap-1">
              {recentFolders.length > 0 && (
                <button
                  type="button"
                  className="rounded px-2 py-0.5 text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor:
                      activeTab === "folders"
                        ? "var(--bg-tertiary)"
                        : "transparent",
                    color:
                      activeTab === "folders"
                        ? "var(--text-primary)"
                        : "var(--text-muted)",
                  }}
                  onClick={() => setActiveTab("folders")}
                >
                  最近目录 ({recentFolders.length})
                </button>
              )}
              {recentFiles.length > 0 && (
                <button
                  type="button"
                  className="rounded px-2 py-0.5 text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor:
                      activeTab === "files"
                        ? "var(--bg-tertiary)"
                        : "transparent",
                    color:
                      activeTab === "files"
                        ? "var(--text-primary)"
                        : "var(--text-muted)",
                  }}
                  onClick={() => setActiveTab("files")}
                >
                  最近文件 ({recentFiles.length})
                </button>
              )}
            </div>

            {/* 最近目录列表 */}
            {activeTab === "folders" && recentFolders.length > 0 && (
              <div className="space-y-px">
                {recentFolders.map((folder) => (
                  <div
                    key={folder.path}
                    className="group flex cursor-default items-center gap-2 rounded px-2 py-1 text-[12px] transition-colors"
                    style={{ color: "var(--text-secondary)" }}
                    onClick={() => handleOpenRecentFolder(folder.path)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                      e.currentTarget.style.color = "var(--text-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }}
                  >
                    <FolderOpen
                      className="h-3.5 w-3.5 flex-shrink-0"
                      style={{ color: "var(--text-muted)" }}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {folder.title}
                    </span>
                    <button
                      type="button"
                      className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ color: "var(--text-muted)" }}
                      onClick={(e) => handleRemoveRecentFolder(e, folder.path)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--text-primary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-muted)";
                      }}
                      title="移除"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 最近文件列表 */}
            {activeTab === "files" && recentFiles.length > 0 && (
              <div className="space-y-px">
                {recentFiles.map((file) => (
                  <div
                    key={file.path}
                    className="group flex cursor-default items-center gap-2 rounded px-2 py-1 text-[12px] transition-colors"
                    style={{ color: "var(--text-secondary)" }}
                    onClick={() => handleOpenRecentFile(file.path)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                      e.currentTarget.style.color = "var(--text-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.color = "var(--text-secondary)";
                    }}
                  >
                    <File
                      className="h-3.5 w-3.5 flex-shrink-0"
                      style={{ color: "var(--text-muted)" }}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {file.title}
                    </span>
                    <button
                      type="button"
                      className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100"
                      style={{ color: "var(--text-muted)" }}
                      onClick={(e) => handleRemoveRecentFile(e, file.path)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--text-primary)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-muted)";
                      }}
                      title="移除"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolButton({
  icon,
  tooltip,
  onClick,
}: {
  icon: React.ReactNode;
  tooltip: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex h-6 w-6 items-center justify-center rounded transition-colors"
      style={{ color: "var(--text-muted)" }}
      title={tooltip}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--hover-bg)";
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.color = "var(--text-muted)";
      }}
    >
      {icon}
    </button>
  );
}
