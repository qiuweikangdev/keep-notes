import { useState, useCallback, useRef, useEffect } from "react";
import {
  RefreshCw,
  ExternalLink,
  FolderOpen,
  Folder,
  X,
  MoreVertical,
} from "lucide-react";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "@/hooks/use-electron";
import { getRevealInFileManagerLabel } from "../utils";

interface QuickActionsPanelProps {
  onClose?: () => void;
}

export function QuickActionsPanel({ onClose }: QuickActionsPanelProps) {
  const { treeRoot, recentFolders, removeRecentFolder } = useTreeStore();
  const { openFolder, loadTree, openInExplorer } = useElectron();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const revealInFileManagerLabel = getRevealInFileManagerLabel(
    window.electronAPI?.getPlatform(),
  );

  // 点击外部关闭菜单
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMenuOpen]);

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
      setIsMenuOpen(false);
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

  const handleMenuAction = useCallback((action: () => void) => {
    action();
    setIsMenuOpen(false);
  }, []);

  // 无文件夹时的初始状态
  if (!treeRoot) {
    return (
      <div
        className="relative flex-shrink-0"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        {/* 打开文件夹按钮 + 更多选项 - 菜单关闭时显示 */}
        {!isMenuOpen && (
          <div
            className="sidebar-bottom-bar flex items-center"
            style={{ borderTop: "1px solid var(--border-color)" }}
          >
            <button
              type="button"
              className="sidebar-bottom-bar flex flex-1 items-center justify-center gap-2 py-2.5 text-[13px]"
              style={{ color: "var(--text-muted)" }}
              onClick={handleOpenFolder}
            >
              <FolderOpen className="h-4 w-4" />
              打开文件夹...
            </button>
            <button
              type="button"
              className="sidebar-bottom-bar flex h-8 w-8 flex-shrink-0 items-center justify-center transition-colors"
              style={{ color: "var(--text-muted)" }}
              onClick={() => setIsMenuOpen(true)}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* 弹出菜单 */}
        {isMenuOpen && (
          <div
            ref={menuRef}
            className="absolute bottom-full left-0 right-0 z-50 mb-1"
            style={{
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            }}
          >
            <MenuContent
              treeRoot={treeRoot}
              revealInFileManagerLabel={revealInFileManagerLabel}
              recentFolders={recentFolders}
              onOpenFolder={handleOpenFolder}
              onOpenInExplorer={handleOpenInExplorer}
              onRefresh={handleRefresh}
              onOpenRecentFolder={handleOpenRecentFolder}
              onRemoveRecentFolder={handleRemoveRecentFolder}
              onClose={() => setIsMenuOpen(false)}
            />
          </div>
        )}
      </div>
    );
  }

  // 已打开文件夹的状态
  return (
    <div
      className="relative flex-shrink-0"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {/* 当前目录名 + 更多选项 - 菜单关闭时显示 */}
      {!isMenuOpen && (
        <div
          className="sidebar-bottom-bar flex cursor-pointer items-center"
          style={{ borderTop: "1px solid var(--border-color)" }}
          onClick={() => setIsMenuOpen(true)}
          onMouseEnter={(e) => {
            const container = e.currentTarget;
            container.querySelectorAll("[data-hover-muted]").forEach((el) => {
              (el as HTMLElement).style.color = "var(--text-primary)";
            });
          }}
          onMouseLeave={(e) => {
            const container = e.currentTarget;
            container.querySelectorAll("[data-hover-muted]").forEach((el) => {
              (el as HTMLElement).style.color = "var(--text-muted)";
            });
          }}
        >
          <div className="flex flex-1 items-center justify-center gap-2 px-3 py-2 text-[13px]">
            <FolderOpen
              className="h-4 w-4"
              data-hover-muted
              style={{ color: "var(--text-muted)" }}
            />
            <span
              data-hover-muted
              style={{ color: "var(--text-muted)" }}
              className="flex items-center leading-4"
            >
              {treeRoot.title}
            </span>
          </div>
          <button
            type="button"
            className="sidebar-bottom-bar flex h-8 w-8 flex-shrink-0 items-center justify-center transition-colors"
            data-hover-muted
            style={{ color: "var(--text-muted)" }}
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(true);
            }}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 弹出菜单 */}
      {isMenuOpen && (
        <div
          ref={menuRef}
          className="absolute bottom-full left-0 right-0 z-50 mb-1"
          style={{
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
          }}
        >
          <MenuContent
            treeRoot={treeRoot}
            revealInFileManagerLabel={revealInFileManagerLabel}
            recentFolders={recentFolders}
            onOpenFolder={handleOpenFolder}
            onOpenInExplorer={handleOpenInExplorer}
            onRefresh={handleRefresh}
            onOpenRecentFolder={handleOpenRecentFolder}
            onRemoveRecentFolder={handleRemoveRecentFolder}
            onClose={() => setIsMenuOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

interface MenuContentProps {
  treeRoot: { key: string; title: string } | null;
  revealInFileManagerLabel: string;
  recentFolders: Array<{ title: string; path: string }>;
  onOpenFolder: () => void;
  onOpenInExplorer: () => void;
  onRefresh: () => void;
  onOpenRecentFolder: (path: string) => void;
  onRemoveRecentFolder: (e: React.MouseEvent, path: string) => void;
  onClose: () => void;
}

function MenuContent({
  treeRoot,
  revealInFileManagerLabel,
  recentFolders,
  onOpenFolder,
  onOpenInExplorer,
  onRefresh,
  onOpenRecentFolder,
  onRemoveRecentFolder,
  onClose,
}: MenuContentProps) {
  return (
    <div className="py-2">
      {/* 操作标题 */}
      <div
        className="flex items-center justify-between px-3 pb-2"
        style={{ borderBottom: "1px solid var(--border-color)" }}
      >
        <span
          className="text-[13px] font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          操作
        </span>
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
      </div>

      {/* 操作列表 */}
      <div className="py-1">
        {treeRoot && (
          <MenuItem
            icon={<ExternalLink className="h-4 w-4" />}
            label={revealInFileManagerLabel}
            onClick={() => {
              onOpenInExplorer();
              onClose();
            }}
          />
        )}
        <MenuItem
          icon={<FolderOpen className="h-4 w-4" />}
          label="打开文件夹..."
          onClick={() => {
            onOpenFolder();
            onClose();
          }}
        />
        {treeRoot && (
          <MenuItem
            icon={<RefreshCw className="h-4 w-4" />}
            label="刷新"
            onClick={() => {
              onRefresh();
              onClose();
            }}
          />
        )}
      </div>

      {/* 最近使用的目录 */}
      {recentFolders.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border-color)" }}>
          <div className="py-1">
            <div
              className="px-3 py-1.5 text-[13px] font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              最近使用的目录
            </div>
            <div className="space-y-0">
              {recentFolders.map((folder) => (
                <div
                  key={folder.path}
                  className="group flex cursor-pointer items-center gap-3 px-3 py-1.5 text-[13px] transition-colors"
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
                  <span className="min-w-0 flex-1 truncate leading-4">
                    {folder.title}
                  </span>
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
        </div>
      )}
    </div>
  );
}

function MenuItem({
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
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
    </button>
  );
}
