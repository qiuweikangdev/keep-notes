import { useEditorStore } from "@/store/editor.store";
import { useElectron } from "@/hooks/use-electron";
import {
  FileText,
  X,
  ChevronDown,
  SplitSquareVertical,
  SplitSquareHorizontal,
  Plus,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";

// 支持的文件扩展名
const SUPPORTED_EXTENSIONS = [".md", ".txt"];

// 检查文件是否支持
function isSupportedFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}

interface EditorTabBarProps {
  groupId: string;
}

export function EditorTabBar({ groupId }: EditorTabBarProps) {
  const {
    panelGroups = [],
    setActiveTab,
    removeTab,
    addTab,
    addPanelGroup,
  } = useEditorStore();
  const { openFile } = useElectron();

  const group = panelGroups.find((g) => g.id === groupId);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabId: string;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

  // 关闭右键菜单
  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    document.addEventListener("click", handleClose);
    document.addEventListener("contextmenu", handleClose);
    return () => {
      document.removeEventListener("click", handleClose);
      document.removeEventListener("contextmenu", handleClose);
    };
  }, [contextMenu]);

  if (!group) return null;

  const handleTabClick = (tabId: string) => {
    setActiveTab(groupId, tabId);
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    removeTab(groupId, tabId);
  };

  const handleNewTab = () => {
    addTab(groupId);
    setIsMenuOpen(false);
  };

  const handleSplitRight = () => {
    addPanelGroup("horizontal");
    setIsMenuOpen(false);
  };

  const handleSplitDown = () => {
    addPanelGroup("vertical");
    setIsMenuOpen(false);
  };

  // 右键菜单
  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  };

  const handleCloseTabFromMenu = () => {
    if (contextMenu) {
      removeTab(groupId, contextMenu.tabId);
      setContextMenu(null);
    }
  };

  const handleCloseOtherTabs = () => {
    if (contextMenu) {
      const tabsToClose = group.tabs.filter((t) => t.id !== contextMenu.tabId);
      tabsToClose.forEach((t) => removeTab(groupId, t.id));
      setContextMenu(null);
    }
  };

  const handleCloseAllTabs = () => {
    group.tabs.forEach((t) => removeTab(groupId, t.id));
    setContextMenu(null);
  };

  // 拖拽事件处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      // 获取拖拽的文件路径
      const filePath = e.dataTransfer.getData("application/x-keep-notes-file");
      if (!filePath || !isSupportedFile(filePath)) return;

      // 检查当前活动标签页是否已经是该文件
      const state = useEditorStore.getState();
      const activeGroup = state.panelGroups.find((g) => g.id === groupId);
      if (activeGroup) {
        const activeTab = activeGroup.tabs.find(
          (t) => t.id === activeGroup.activeTabId,
        );
        // 如果当前标签页已经是目标文件，不需要操作
        if (activeTab && activeTab.filePath === filePath) {
          return;
        }
      }

      // 打开文件
      await openFile(filePath);
    },
    [groupId, openFile],
  );

  return (
    <div
      className="flex h-[35px] flex-shrink-0 items-center relative"
      style={{
        backgroundColor: isDragOver ? "var(--hover-bg)" : "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-color)",
        transition: "background-color 0.15s ease",
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 标签页列表 */}
      <div className="flex flex-1 overflow-x-auto scrollbar-none h-full">
        {group.tabs.map((tab) => {
          const fileName = tab.filePath?.split(/[\\/]/).pop() || "未命名";
          const isActive = group.activeTabId === tab.id;

          return (
            <div
              key={tab.id}
              className="group flex h-full items-center gap-1.5 px-2.5 cursor-pointer border-r relative select-none"
              style={{
                backgroundColor: isActive ? "var(--bg-primary)" : "transparent",
                borderColor: "var(--border-color)",
                minWidth: "120px",
                maxWidth: "200px",
              }}
              onClick={() => handleTabClick(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            >
              <FileText
                className="h-3.5 w-3.5 flex-shrink-0"
                style={{ color: "var(--text-muted)" }}
              />
              <span
                className="text-[11px] truncate flex-1"
                style={{
                  color: isActive
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                }}
              >
                {fileName}
              </span>
              <button
                onClick={(e) => handleCloseTab(e, tab.id)}
                className="flex-shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* 操作按钮区域 */}
      <div
        className="flex items-center h-full flex-shrink-0"
        style={{ borderLeft: "1px solid var(--border-color)" }}
      >
        {/* 下拉菜单按钮 - VSCode 风格的 "+" 和下拉箭头 */}
        <div className="relative h-full" ref={menuRef}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center gap-0.5 h-full px-2 transition-all"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            <ChevronDown
              className="h-3 w-3 transition-transform"
              style={{
                transform: isMenuOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>

          {/* 下拉菜单 */}
          {isMenuOpen && (
            <div
              className="absolute right-0 top-full z-50 py-1 min-w-[200px]"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
              }}
            >
              <MenuButton
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={handleNewTab}
              >
                新建标签页
              </MenuButton>
              <MenuDivider />
              <MenuButton
                icon={<SplitSquareVertical className="h-3.5 w-3.5" />}
                onClick={handleSplitRight}
              >
                向右拆分
              </MenuButton>
              <MenuButton
                icon={<SplitSquareHorizontal className="h-3.5 w-3.5" />}
                onClick={handleSplitDown}
              >
                向下拆分
              </MenuButton>
            </div>
          )}
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="fixed z-50 py-1 min-w-[180px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            backgroundColor: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: "6px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
          }}
        >
          <MenuButton
            icon={<X className="h-3.5 w-3.5" />}
            onClick={handleCloseTabFromMenu}
          >
            关闭
          </MenuButton>
          <MenuButton
            icon={<X className="h-3.5 w-3.5" />}
            onClick={handleCloseOtherTabs}
          >
            关闭其他
          </MenuButton>
          <MenuButton
            icon={<X className="h-3.5 w-3.5" />}
            onClick={handleCloseAllTabs}
          >
            关闭所有
          </MenuButton>
          <MenuDivider />
          <MenuButton
            icon={<SplitSquareVertical className="h-3.5 w-3.5" />}
            onClick={() => {
              addPanelGroup("horizontal");
              setContextMenu(null);
            }}
          >
            向右拆分
          </MenuButton>
          <MenuButton
            icon={<SplitSquareHorizontal className="h-3.5 w-3.5" />}
            onClick={() => {
              addPanelGroup("vertical");
              setContextMenu(null);
            }}
          >
            向下拆分
          </MenuButton>
        </div>
      )}
    </div>
  );
}

// 菜单按钮组件
function MenuButton({
  icon,
  onClick,
  children,
}: {
  icon?: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs transition-colors"
      style={{ color: "var(--text-primary)" }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "var(--accent-color)";
        e.currentTarget.style.color = "white";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.color = "var(--text-primary)";
      }}
    >
      {icon && (
        <span className="w-4 h-4 flex items-center justify-center">{icon}</span>
      )}
      <span>{children}</span>
    </button>
  );
}

// 菜单分隔线
function MenuDivider() {
  return (
    <div
      className="my-1"
      style={{ height: "1px", backgroundColor: "var(--border-color)" }}
    />
  );
}
