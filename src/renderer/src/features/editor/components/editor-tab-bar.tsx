import { useEditorStore } from "@/store/editor.store";
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
import { editorSplitPaintCoordinator } from "../lib/editor-performance";
import { selectTabBarSignature } from "../lib/editor-view-selectors";
import { EditorToolbar } from "./editor-toolbar";

interface EditorTabBarProps {
  groupId: string;
}

type AddPanelGroup = (
  direction: "horizontal" | "vertical",
  targetGroupId?: string,
) => void;

export function splitEditorPanel(
  direction: "horizontal" | "vertical",
  groupId: string,
  addPanelGroup: AddPanelGroup,
): void {
  if (!import.meta.env.DEV) {
    addPanelGroup(direction, groupId);
    return;
  }

  const existingGroupIds = new Set(
    useEditorStore.getState().panelGroups.map((group) => group.id),
  );
  const token = editorSplitPaintCoordinator!.begin();
  try {
    addPanelGroup(direction, groupId);
  } catch (error) {
    editorSplitPaintCoordinator!.cancel(token);
    throw error;
  }

  // 用新面板身份绑定计时，确保只在对应富文本预览提交并完成下一帧后结束。
  const createdGroup = useEditorStore
    .getState()
    .panelGroups.find((group) => !existingGroupIds.has(group.id));
  if (
    !createdGroup ||
    !editorSplitPaintCoordinator!.bindPane(token, createdGroup.id)
  ) {
    editorSplitPaintCoordinator!.cancel(token);
  }
}

export function EditorTabBar({ groupId }: EditorTabBarProps) {
  useEditorStore(selectTabBarSignature(groupId));
  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const removeTab = useEditorStore((state) => state.removeTab);
  const addTab = useEditorStore((state) => state.addTab);
  const addPanelGroup = useEditorStore((state) => state.addPanelGroup);

  const group = useEditorStore
    .getState()
    .panelGroups.find((item) => item.id === groupId);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabId: string;
  } | null>(null);

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
    if (import.meta.env.DEV) {
      splitEditorPanel("horizontal", groupId, addPanelGroup);
      return;
    }
    addPanelGroup("horizontal", groupId);
  };

  const handleSplitDown = () => {
    if (import.meta.env.DEV) {
      splitEditorPanel("vertical", groupId, addPanelGroup);
      return;
    }
    addPanelGroup("vertical", groupId);
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

  return (
    <div
      className="flex h-[35px] flex-shrink-0 items-center relative"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-color)",
      }}
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

      {/* 空面板也保留标签页操作入口，用户可随时创建未命名标签页。 */}
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
              setContextMenu(null);
              if (import.meta.env.DEV) {
                splitEditorPanel("horizontal", groupId, addPanelGroup);
                return;
              }
              addPanelGroup("horizontal", groupId);
            }}
          >
            向右拆分
          </MenuButton>
          <MenuButton
            icon={<SplitSquareVertical className="h-3.5 w-3.5" />}
            onClick={() => {
              setContextMenu(null);
              if (import.meta.env.DEV) {
                splitEditorPanel("vertical", groupId, addPanelGroup);
                return;
              }
              addPanelGroup("vertical", groupId);
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
  disabled = false,
  title,
  onClick,
  children,
}: {
  icon?: React.ReactNode;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs transition-colors"
      style={{
        color: "var(--text-primary)",
        opacity: disabled ? 0.45 : 1,
      }}
      disabled={disabled}
      title={title}
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
