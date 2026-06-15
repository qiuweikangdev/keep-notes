import { useCallback } from "react";
import { RefreshCw, ExternalLink, FolderOpen, X } from "lucide-react";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "@/hooks/use-electron";
import { Tooltip } from "@/components/ui/tooltip";

export function QuickActionsPanel() {
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

  // 无文件夹时显示打开按钮和最近目录
  if (!treeRoot) {
    return (
      <div
        className="flex-shrink-0"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        <div
          className="quick-open-folder flex items-center"
          style={{ borderTop: "1px solid var(--border-color)" }}
        >
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-2 py-2.5 text-[13px]"
            style={{ color: "var(--text-muted)" }}
            onClick={handleOpenFolder}
          >
            <FolderOpen className="h-4 w-4" />
            打开文件夹...
          </button>
        </div>

        {/* 最近使用的目录 - 始终显示 */}
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
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            tooltip="Show in Explorer"
            onClick={handleOpenInExplorer}
          />
          <ToolButton
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            tooltip="Refresh"
            onClick={handleRefresh}
          />
        </div>
      </div>

      {/* 最近使用的目录 - 始终显示 */}
      {recentFolders.length > 0 && (
        <div
          className="px-1 pb-0.5"
          style={{ borderTop: "1px solid var(--border-color)" }}
        >
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
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded transition-colors"
            style={{ color: "var(--text-muted)" }}
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
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="z-50 rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
            sideOffset={5}
          >
            {tooltip}
            <Tooltip.Arrow className="fill-popover" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
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
    <div className="pt-0.5 pb-1">
      {/* 最近目录标题 */}
      {recentFolders.length > 0 && (
        <div className="mb-0">
          <div
            className="pl-1 pr-0 py-0.5 text-[11px] font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            <span>最近使用的目录</span>
          </div>
          <div className="space-y-0">
            {recentFolders.map((folder) => (
              <div
                key={folder.path}
                className="group flex cursor-default items-center gap-2 pl-4 pr-1 py-0 text-[13px] transition-colors"
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
                <FolderOpen
                  className="h-3.5 w-3.5 flex-shrink-0"
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
      )}
    </div>
  );
}
