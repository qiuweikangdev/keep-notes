import { useCallback } from "react";
import { RefreshCw, ExternalLink, FolderOpen, Folder, X } from "lucide-react";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "@/hooks/use-electron";

interface QuickActionsPanelProps {
  onClose?: () => void;
}

export function QuickActionsPanel({ onClose }: QuickActionsPanelProps) {
  const { treeRoot, recentFolders, removeRecentFolder } = useTreeStore();
  const { openFolder, loadTree, openInExplorer } = useElectron();

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

  const handleRemoveRecentFolder = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      removeRecentFolder(path);
    },
    [removeRecentFolder],
  );

  return (
    <div
      className="flex-shrink-0"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {/* 操作区域 */}
      <div style={{ borderTop: "1px solid var(--border-color)" }}>
        {/* 操作标题 */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ borderBottom: "1px solid var(--border-color)" }}
        >
          <span
            className="text-[13px] font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            操作
          </span>
          {onClose && (
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded transition-colors"
              style={{ color: "var(--text-muted)" }}
              onClick={onClose}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* 操作列表 */}
        <div className="py-1">
          <ActionItem
            icon={<ExternalLink className="h-4 w-4" />}
            label="在 Finder 中显示"
            onClick={handleOpenInExplorer}
          />
          <ActionItem
            icon={<FolderOpen className="h-4 w-4" />}
            label="打开文件夹..."
            onClick={handleOpenFolder}
          />
          <ActionItem
            icon={<RefreshCw className="h-4 w-4" />}
            label="刷新"
            onClick={handleRefresh}
          />
        </div>
      </div>

      {/* 最近使用的目录 */}
      {recentFolders.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border-color)" }}>
          <RecentContentPanel
            recentFolders={recentFolders}
            onOpenRecentFolder={handleOpenRecentFolder}
            onRemoveRecentFolder={handleRemoveRecentFolder}
          />
        </div>
      )}
    </div>
  );
}

function ActionItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 px-3 py-1.5 text-[13px] transition-colors"
      style={{ color: "var(--text-secondary)" }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--hover-bg)";
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.color = "var(--text-secondary)";
      }}
    >
      <span style={{ color: "var(--text-muted)" }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

interface RecentContentPanelProps {
  recentFolders: Array<{ title: string; path: string }>;
  onOpenRecentFolder: (path: string) => void;
  onRemoveRecentFolder: (e: React.MouseEvent, path: string) => void;
}

function RecentContentPanel({
  recentFolders,
  onOpenRecentFolder,
  onRemoveRecentFolder,
}: RecentContentPanelProps) {
  return (
    <div className="py-1">
      {/* 最近目录标题 */}
      <div
        className="px-3 py-1.5 text-[13px] font-medium"
        style={{ color: "var(--text-primary)" }}
      >
        最近使用的目录
      </div>

      {/* 目录列表 */}
      <div className="space-y-0">
        {recentFolders.map((folder) => (
          <div
            key={folder.path}
            className="group flex cursor-default items-center gap-2 px-3 py-1.5 text-[13px] transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onClick={() => onOpenRecentFolder(folder.path)}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            <Folder
              className="h-4 w-4 flex-shrink-0"
              style={{ color: "var(--text-muted)" }}
            />
            <span className="min-w-0 flex-1 truncate">{folder.title}</span>
            <button
              type="button"
              className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100"
              style={{ color: "var(--text-muted)" }}
              onClick={(e) => onRemoveRecentFolder(e, folder.path)}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-muted)";
              }}
              title="Remove"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
