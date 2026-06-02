import { useState, useCallback, useRef, useEffect } from "react";
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
  MoreVertical,
} from "lucide-react";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "@/hooks/use-electron";
import { Tooltip } from "@/components/ui/tooltip";

interface QuickActionsPanelProps {
  onToggleSearch: () => void;
  onStartCreateFile: () => void;
  onStartCreateFolder: () => void;
  onExpandedChange?: (expanded: boolean) => void;
}

export function QuickActionsPanel({
  onToggleSearch,
  onStartCreateFile,
  onStartCreateFolder,
  onExpandedChange,
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
  const panelRef = useRef<HTMLDivElement>(null);

  // 点击外部区域关闭面板
  useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        setIsExpanded(false);
        onExpandedChange?.(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isExpanded, onExpandedChange]);

  const handleToggleExpand = useCallback(() => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    onExpandedChange?.(newState);
  }, [isExpanded, onExpandedChange]);

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

  // 无文件夹时显示简洁的打开按钮
  if (!treeRoot) {
    return (
      <div
        ref={panelRef}
        className="flex-shrink-0"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        {/* 展开最近目录面板时，只显示面板 */}
        {isExpanded && hasRecentContent ? (
          <div style={{ borderTop: "1px solid var(--border-color)" }}>
            <RecentContentPanel
              recentFolders={recentFolders}
              recentFiles={recentFiles}
              onOpenRecentFolder={handleOpenRecentFolder}
              onOpenRecentFile={handleOpenRecentFile}
              onRemoveRecentFolder={handleRemoveRecentFolder}
              onRemoveRecentFile={handleRemoveRecentFile}
              onOpenFolder={handleOpenFolder}
              showOpenFolder={!treeRoot}
            />
          </div>
        ) : (
          /* 正常状态：显示打开文件夹按钮 */
          <div
            className="flex items-center"
            style={{ borderTop: "1px solid var(--border-color)" }}
          >
            <button
              type="button"
              className="flex flex-1 items-center justify-center gap-2 py-2.5 text-[13px] transition-colors"
              style={{ color: "var(--text-muted)" }}
              onClick={handleOpenFolder}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <FolderOpen className="h-4 w-4" />
              打开文件夹...
            </button>

            {/* 右侧更多按钮 */}
            {hasRecentContent && (
              <button
                type="button"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center transition-colors"
                style={{ color: "var(--text-muted)" }}
                onClick={() => {
                  setIsExpanded(true);
                  onExpandedChange?.(true);
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
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
        {hasRecentContent && (
          <Tooltip.Provider>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  className="flex h-6 w-6 items-center justify-center rounded transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onClick={handleToggleExpand}
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
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  className="z-50 rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md"
                  sideOffset={5}
                >
                  {isExpanded ? "收起最近列表" : "展开最近列表"}
                  <Tooltip.Arrow className="fill-popover" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        )}
      </div>

      {/* 最近使用面板 */}
      {isExpanded && hasRecentContent && (
        <div
          className="px-1 pb-0.5"
          style={{ borderTop: "1px solid var(--border-color)" }}
        >
          <RecentContentPanel
            recentFolders={recentFolders}
            recentFiles={recentFiles}
            onOpenRecentFolder={handleOpenRecentFolder}
            onOpenRecentFile={handleOpenRecentFile}
            onRemoveRecentFolder={handleRemoveRecentFolder}
            onRemoveRecentFile={handleRemoveRecentFile}
            onOpenFolder={handleOpenFolder}
            showOpenFolder={!treeRoot}
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
  recentFiles: Array<{ title: string; path: string }>;
  onOpenRecentFolder: (path: string) => void;
  onOpenRecentFile: (path: string) => void;
  onRemoveRecentFolder: (e: React.MouseEvent, path: string) => void;
  onRemoveRecentFile: (e: React.MouseEvent, path: string) => void;
  onOpenFolder: () => void;
  showOpenFolder?: boolean;
}

function RecentContentPanel({
  recentFolders,
  recentFiles,
  onOpenRecentFolder,
  onOpenRecentFile,
  onRemoveRecentFolder,
  onRemoveRecentFile,
  onOpenFolder,
  showOpenFolder = false,
}: RecentContentPanelProps) {
  return (
    <div className="pt-0.5 pb-1">
      {/* 最近目录标题 */}
      {recentFolders.length > 0 && (
        <div className="mb-0">
          <div
            className="px-2 py-0.5 text-[11px] font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            最近使用的目录
          </div>
          <div className="space-y-0">
            {recentFolders.map((folder) => (
              <div
                key={folder.path}
                className="group flex cursor-default items-center gap-2 px-3 py-0 text-[13px] transition-colors"
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
                  title="移除"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 最近文件标题 */}
      {recentFiles.length > 0 && (
        <div className="mb-0">
          <div
            className="px-2 py-0.5 text-[11px] font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            最近使用的文件
          </div>
          <div className="space-y-0">
            {recentFiles.map((file) => (
              <div
                key={file.path}
                className="group flex cursor-default items-center gap-2 px-3 py-0 text-[13px] transition-colors"
                style={{ color: "var(--text-secondary)" }}
                onClick={() => onOpenRecentFile(file.path)}
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
                <span className="min-w-0 flex-1 truncate">{file.title}</span>
                <button
                  type="button"
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ color: "var(--text-muted)" }}
                  onClick={(e) => onRemoveRecentFile(e, file.path)}
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
        </div>
      )}

      {/* 分隔线和打开文件夹 - 仅在未打开目录时显示 */}
      {showOpenFolder && (
        <div
          className="mt-0.5 pb-1"
          style={{ borderTop: "1px solid var(--border-color)" }}
        >
          <div
            className="px-2 py-0.5 text-[11px] font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            目录
          </div>
          <div
            className="flex cursor-default items-center gap-2 px-3 py-0.5 text-[13px] transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onClick={onOpenFolder}
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
            <span>打开文件夹...</span>
          </div>
        </div>
      )}
    </div>
  );
}
