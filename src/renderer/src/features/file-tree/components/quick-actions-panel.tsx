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
  const { treeRoot, recentFolders, removeRecentFolder } = useTreeStore();
  const { openFolder, loadTree, openInExplorer } = useElectron();
  const [isExpanded, setIsExpanded] = useState(false);

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

  const handleOpenRecent = useCallback(
    (path: string) => {
      void loadTree(path);
    },
    [loadTree],
  );

  const handleRemoveRecent = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      removeRecentFolder(path);
    },
    [removeRecentFolder],
  );

  if (!treeRoot) return null;

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
          <ToolButton
            icon={<FolderOpen className="h-3.5 w-3.5" />}
            tooltip="打开文件夹"
            onClick={handleOpenFolder}
          />
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
        </div>
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
      </div>

      {/* 最近使用的目录面板 */}
      {isExpanded && recentFolders.length > 0 && (
        <div
          className="px-2 pb-2"
          style={{ borderTop: "1px solid var(--border-color)" }}
        >
          <div className="pt-2">
            <div
              className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              最近目录
            </div>
            <div className="space-y-px">
              {recentFolders.map((folder) => (
                <div
                  key={folder.path}
                  className="group flex cursor-default items-center gap-2 rounded px-2 py-1 text-[12px] transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                  onClick={() => handleOpenRecent(folder.path)}
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
                    onClick={(e) => handleRemoveRecent(e, folder.path)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "var(--text-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "var(--text-muted)";
                    }}
                    title="移除"
                  >
                    <FolderMinus className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
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
