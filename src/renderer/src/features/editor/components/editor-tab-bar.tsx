import { useEditorStore } from "@/store/editor.store";
import { useElectron } from "@/hooks/use-electron";
import {
  FileText,
  X,
  SplitSquareVertical,
  SplitSquareHorizontal,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import {
  editorSaveCoordinator,
  flushEditorChange,
} from "../lib/editor-runtime";
import {
  getDraggedFilePath,
  isEditorFileDrag,
} from "../lib/editor-drag-session";
import { selectTabBarSignature } from "../lib/editor-view-selectors";
import { EditorToolbar } from "./editor-toolbar";

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
  useEditorStore(selectTabBarSignature(groupId));
  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const removeTab = useEditorStore((state) => state.removeTab);
  const addTab = useEditorStore((state) => state.addTab);
  const addPanelGroup = useEditorStore((state) => state.addPanelGroup);
  const { openFile } = useElectron();

  const group = useEditorStore
    .getState()
    .panelGroups.find((item) => item.id === groupId);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabId: string;
  } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

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

  const closeTab = useCallback(
    async (tabId: string) => {
      const state = useEditorStore.getState();
      const tab = state.panelGroups
        .find((item) => item.id === groupId)
        ?.tabs.find((item) => item.id === tabId);
      // 关闭标签前按路径冲刷，避免最后一段输入仍停留在自动保存等待期。
      if (tab?.filePath) {
        await flushEditorChange(groupId, tabId);
        await editorSaveCoordinator.flush(tab.filePath);
      }
      removeTab(groupId, tabId);
    },
    [groupId, removeTab],
  );

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    void closeTab(tabId);
  };

  const handleNewTab = () => {
    addTab(groupId);
  };

  const handleSplitRight = () => {
    addPanelGroup("horizontal");
  };

  const handleSplitDown = () => {
    addPanelGroup("vertical");
  };

  // 右键菜单
  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  };

  const handleCloseTabFromMenu = () => {
    if (contextMenu) {
      void closeTab(contextMenu.tabId);
      setContextMenu(null);
    }
  };

  const handleCloseOtherTabs = () => {
    if (contextMenu) {
      const tabsToClose = group.tabs.filter((t) => t.id !== contextMenu.tabId);
      tabsToClose.forEach((tab) => void closeTab(tab.id));
      setContextMenu(null);
    }
  };

  const handleCloseAllTabs = () => {
    group.tabs.forEach((tab) => void closeTab(tab.id));
    setContextMenu(null);
  };

  // 拖拽事件处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isEditorFileDrag(e.dataTransfer.types)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!isEditorFileDrag(e.dataTransfer.types)) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      if (!isEditorFileDrag(e.dataTransfer.types)) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      // 获取拖拽文件路径，支持文件树拖拽和系统文件拖拽。
      const filePath = getDraggedFilePath(e.dataTransfer);
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

      // 打开文件，指定目标面板组
      await openFile(filePath, groupId);
    },
    [groupId, openFile],
  );

  return (
    <div
      className="flex h-[35px] flex-shrink-0 items-center relative"
      style={{
        backgroundColor: isDragOver ? "var(--hover-bg)" : "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-color)",
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 标签页列表 */}
      <div className="flex flex-1 overflow-x-auto scrollbar-none h-full">
        {group.tabs.map((tab) => {
          const displayPath = tab.pendingFilePath ?? tab.filePath;
          const fileName = displayPath?.split(/[\\/]/).pop() || "未命名";
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

      {/* 操作按钮区域 - 仅在有标签页时显示 */}
      {group.tabs.length > 0 && (
        <div
          className="flex h-full flex-shrink-0 items-center gap-1 px-1"
          style={{ borderLeft: "1px solid var(--border-color)" }}
        >
          <EditorToolbar
            groupId={groupId}
            onNewTab={handleNewTab}
            onSplitRight={handleSplitRight}
            onSplitDown={handleSplitDown}
          />
        </div>
      )}

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
            icon={<SplitSquareHorizontal className="h-3.5 w-3.5" />}
            onClick={() => {
              addPanelGroup("horizontal");
              setContextMenu(null);
            }}
          >
            向右拆分
          </MenuButton>
          <MenuButton
            icon={<SplitSquareVertical className="h-3.5 w-3.5" />}
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
