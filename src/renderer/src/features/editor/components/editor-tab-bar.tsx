import { useEditorStore } from "@/store/editor.store";
import {
  ArrowLeftRight,
  AlertCircle,
  FileText,
  FolderSearch,
  GitCompare,
  Pencil,
  PictureInPicture2,
  Plus,
  X,
  SplitSquareVertical,
  SplitSquareHorizontal,
  Undo2,
} from "lucide-react";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useElectron } from "@/hooks/use-electron";
import { showAppToast } from "@/lib/app-toast";
import { getLayoutConfig } from "@/config/layouts";
import { useTreeStore } from "@/store/tree.store";
import { useUIStore } from "@/store/ui.store";
import { CodeResult } from "@/types";
import {
  editorSplitPaintCoordinator,
  editorNavigationPaintCoordinator,
} from "../lib/editor-performance";
import { closeEditorTab } from "../lib/editor-tab-closing";
import { selectTabBarSignature } from "../lib/editor-view-selectors";
import {
  flushEditorChange,
  editorSaveCoordinator,
} from "../lib/editor-runtime";
import { useEditorTabActions } from "../lib/use-editor-tab-actions";
import { EditorToolbar } from "./editor-toolbar";

interface EditorTabBarProps {
  groupId: string;
  reserveWindowActions?: boolean;
  reserveWindowNavigation?: boolean;
}

function getFileNameWithoutExtension(filePath: string): string {
  return (filePath.split(/[\\/]/).pop() ?? "").replace(/\.md$/, "");
}

function buildRenamedFilePath(filePath: string, title: string): string {
  const separatorIndex = Math.max(
    filePath.lastIndexOf("/"),
    filePath.lastIndexOf("\\"),
  );
  return `${filePath.slice(0, separatorIndex + 1)}${title}.md`;
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

export function EditorTabBar({
  groupId,
  reserveWindowActions = false,
  reserveWindowNavigation = false,
}: EditorTabBarProps) {
  useEditorStore(selectTabBarSignature(groupId));
  const layout = useUIStore((state) => state.layout);
  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const addTab = useEditorStore((state) => state.addTab);
  const addPanelGroup = useEditorStore((state) => state.addPanelGroup);
  const setTabTemporaryTitle = useEditorStore(
    (state) => state.setTabTemporaryTitle,
  );
  const renameFilePath = useEditorStore((state) => state.renameFilePath);
  const setTreeData = useTreeStore((state) => state.setTreeData);
  const setSelectedKey = useTreeStore((state) => state.setSelectedKey);
  const { renameItem } = useElectron();

  const group = useEditorStore
    .getState()
    .panelGroups.find((item) => item.id === groupId);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tabId: string | null;
    tabWidth: number | null;
  } | null>(null);
  const [discardTabId, setDiscardTabId] = useState<string | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renamingTabWidth, setRenamingTabWidth] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const isRenameComposingRef = useRef(false);
  const isRenameCancelledRef = useRef(false);
  const isRenameSubmittingRef = useRef(false);

  // 关闭右键菜单
  useEffect(() => {
    if (!contextMenu) return;
    const origin = document.activeElement as HTMLElement | null;
    contextMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const handleClose = () => setContextMenu(null);
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
        origin?.focus();
      }
    };
    document.addEventListener("click", handleClose);
    document.addEventListener("contextmenu", handleClose);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("click", handleClose);
      document.removeEventListener("contextmenu", handleClose);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (renamingTabId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingTabId]);

  const handleTabClick = (tabId: string) => {
    if (
      import.meta.env.DEV &&
      group?.activeTabId !== tabId &&
      group?.tabs.find((tab) => tab.id === tabId)?.mode === "rich"
    ) {
      const token = editorNavigationPaintCoordinator!.begin(
        "editor:tab-to-paint",
      );
      editorNavigationPaintCoordinator!.bindPane(token, `${groupId}:${tabId}`);
    }
    setActiveTab(groupId, tabId);
  };

  const closeTab = useCallback(
    (tabId: string) => closeEditorTab(groupId, tabId),
    [groupId],
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

  const {
    confirmDiscard,
    handleDiff,
    handleDiscard,
    handleModeToggle,
    handleOpenFloatingWindow,
    handleRevealInFileManager,
    onNewTab,
    onSplitDown,
    onSplitRight,
    revealInFileManagerLabel,
    setConfirmDiscard,
    showGitActions,
    tab: contextTab,
  } = useEditorTabActions({
    groupId,
    // 确认弹窗关闭右键菜单后仍需锁定原标签，避免误操作当前激活标签。
    tabId: discardTabId ?? contextMenu?.tabId,
    onNewTab: handleNewTab,
    onSplitRight: handleSplitRight,
    onSplitDown: handleSplitDown,
  });

  // 右键菜单
  const handleContextMenu = (e: React.MouseEvent, tabId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    const tabWidth = e.currentTarget.getBoundingClientRect().width;
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      tabId,
      tabWidth: tabWidth > 0 ? tabWidth : null,
    });
  };

  const handleCloseTabFromMenu = () => {
    if (!contextMenu?.tabId) return;
    void closeTab(contextMenu.tabId);
    setContextMenu(null);
  };

  const handleStartRename = () => {
    const tab = group?.tabs.find((item) => item.id === contextMenu?.tabId);
    if (!tab) return;

    isRenameCancelledRef.current = false;
    setRenamingTabWidth(contextMenu?.tabWidth ?? null);
    setRenameValue(
      tab.filePath
        ? getFileNameWithoutExtension(tab.filePath)
        : (tab.temporaryTitle ?? ""),
    );
    setRenamingTabId(tab.id);
    setContextMenu(null);
  };

  const handleRenameConfirm = useCallback(async () => {
    if (
      !renamingTabId ||
      isRenameCancelledRef.current ||
      isRenameSubmittingRef.current
    ) {
      return;
    }

    const tab = useEditorStore
      .getState()
      .panelGroups.find((item) => item.id === groupId)
      ?.tabs.find((item) => item.id === renamingTabId);
    const filePath = tab?.filePath;
    const title = renameValue.trim();
    if (!tab || !title) {
      setRenamingTabId(null);
      return;
    }

    if (!filePath) {
      if (title !== tab.temporaryTitle) {
        setTabTemporaryTitle(groupId, renamingTabId, title);
      }
      setRenamingTabId(null);
      return;
    }

    if (title === getFileNameWithoutExtension(filePath)) {
      setRenamingTabId(null);
      return;
    }

    isRenameSubmittingRef.current = true;
    // 重命名前先写入待保存内容，避免自动保存任务重新创建旧文件。
    try {
      await flushEditorChange(groupId, renamingTabId);
      if (!(await editorSaveCoordinator.flush(filePath))) {
        showAppToast("保存失败，文件尚未重命名。请重试保存后再重命名。");
        return;
      }

      const result = await renameItem(
        filePath,
        title,
        useTreeStore.getState().treeData,
      );
      if (result.code === CodeResult.Success && result.data) {
        const nextPath = buildRenamedFilePath(filePath, title);
        setTreeData(result.data.treeData);
        renameFilePath(filePath, nextPath);
        setSelectedKey(nextPath);
      } else if (result.message) {
        showAppToast(result.message);
      }
    } catch (error) {
      showAppToast(
        error instanceof Error ? error.message : "重命名失败，请重试",
      );
    } finally {
      isRenameSubmittingRef.current = false;
      setRenamingTabId(null);
    }
  }, [
    groupId,
    renameFilePath,
    renameItem,
    renameValue,
    renamingTabId,
    setTabTemporaryTitle,
    setSelectedKey,
    setTreeData,
  ]);

  const handleRenameKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      const isComposing =
        isRenameComposingRef.current ||
        event.nativeEvent.isComposing ||
        event.keyCode === 229;
      if (isComposing) return;

      if (event.key === "Enter") {
        event.preventDefault();
        void handleRenameConfirm();
      }
      if (event.key === "Escape") {
        isRenameCancelledRef.current = true;
        setRenamingTabId(null);
      }
    },
    [handleRenameConfirm],
  );

  if (!group) return null;

  const showToolbarActions =
    getLayoutConfig(layout).tabBarActionPlacement === "toolbar";

  return (
    <div
      className="editor-tab-bar flex h-[35px] flex-shrink-0 items-center relative"
      data-window-actions={reserveWindowActions}
      data-window-navigation={reserveWindowNavigation}
      style={{
        backgroundColor: "var(--bg-primary)",
        borderBottom: group.tabs.length
          ? "1px solid var(--border-color)"
          : "1px solid transparent",
      }}
    >
      {/* 标签页列表 */}
      <div
        role="tablist"
        aria-label="编辑器标签页"
        className="flex flex-1 overflow-x-auto scrollbar-none h-full"
        onContextMenu={(event) => {
          if (!group.tabs.length) handleContextMenu(event, null);
        }}
      >
        {group.tabs.map((tab) => {
          const displayPath = tab.pendingFilePath ?? tab.filePath;
          const fileName =
            displayPath?.split(/[\\/]/).pop() || tab.temporaryTitle || "未命名";
          const isActive = group.activeTabId === tab.id;

          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={fileName}
              title={displayPath ?? fileName}
              tabIndex={isActive ? 0 : -1}
              className="group flex h-full items-center gap-1.5 px-2.5 cursor-pointer border-r relative select-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent-color)]"
              style={{
                backgroundColor: isActive
                  ? "color-mix(in srgb, var(--bg-secondary) 55%, var(--bg-primary))"
                  : "transparent",
                borderColor: "var(--border-color)",
                minWidth: "120px",
                maxWidth: "200px",
                width:
                  renamingTabId === tab.id && renamingTabWidth !== null
                    ? `${renamingTabWidth}px`
                    : undefined,
              }}
              onClick={() => handleTabClick(tab.id)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                const index = group.tabs.findIndex(
                  (item) => item.id === tab.id,
                );
                let nextIndex: number | null = null;
                if (event.key === "ArrowRight")
                  nextIndex = (index + 1) % group.tabs.length;
                if (event.key === "ArrowLeft")
                  nextIndex =
                    (index - 1 + group.tabs.length) % group.tabs.length;
                if (event.key === "Home") nextIndex = 0;
                if (event.key === "End") nextIndex = group.tabs.length - 1;
                if (nextIndex !== null) {
                  event.preventDefault();
                  handleTabClick(group.tabs[nextIndex].id);
                  const next =
                    event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
                      '[role="tab"]',
                    )[nextIndex];
                  next?.focus();
                  next?.scrollIntoView({ block: "nearest", inline: "nearest" });
                } else if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleTabClick(tab.id);
                } else if (event.key === "Delete") {
                  event.preventDefault();
                  const list = event.currentTarget.parentElement;
                  void closeTab(tab.id).then((closed) => {
                    if (closed)
                      requestAnimationFrame(() =>
                        list
                          ?.querySelector<HTMLElement>(
                            '[role="tab"][aria-selected="true"]',
                          )
                          ?.focus(),
                      );
                  });
                } else if (
                  event.key === "ContextMenu" ||
                  (event.shiftKey && event.key === "F10")
                ) {
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  setContextMenu({
                    x: rect.left,
                    y: rect.bottom,
                    tabId: tab.id,
                    tabWidth: rect.width,
                  });
                }
              }}
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
              {tab.saveStatus === "error" ? (
                <AlertCircle
                  role="img"
                  aria-label={tab.errorMessage ?? "保存失败"}
                  className="h-3.5 w-3.5 flex-shrink-0 text-red-500"
                />
              ) : (
                <FileText
                  className="h-3.5 w-3.5 flex-shrink-0"
                  style={{ color: "var(--text-muted)" }}
                />
              )}
              {renamingTabId === tab.id ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  aria-label="重命名文件"
                  className="h-6 min-w-0 flex-1 rounded-sm border border-[var(--accent-color)] bg-[var(--bg-primary)] px-1.5 text-[11px] text-[var(--text-primary)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent-color)_18%,transparent)] outline-none"
                  onChange={(event) => setRenameValue(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={handleRenameKeyDown}
                  onCompositionStart={() => {
                    isRenameComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    isRenameComposingRef.current = false;
                  }}
                  onBlur={() => void handleRenameConfirm()}
                />
              ) : (
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
              )}
              <button
                type="button"
                aria-label={`关闭 ${fileName}`}
                title={`关闭 ${fileName}`}
                tabIndex={isActive ? 0 : -1}
                onClick={(e) => handleCloseTab(e, tab.id)}
                className="flex-shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:outline focus-visible:outline-2 transition-opacity"
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

      {showToolbarActions ? (
        <div
          className="flex h-full flex-shrink-0 items-center gap-1 px-1"
          style={{
            borderLeft: group.tabs.length
              ? "1px solid var(--border-color)"
              : "1px solid transparent",
          }}
        >
          <EditorToolbar
            groupId={groupId}
            onNewTab={handleNewTab}
            onSplitRight={handleSplitRight}
            onSplitDown={handleSplitDown}
          />
        </div>
      ) : null}

      {/* 右键菜单 */}
      {contextMenu
        ? createPortal(
            <div
              ref={contextMenuRef}
              role="menu"
              aria-label="标签页操作"
              onKeyDown={(event) => {
                const items = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    "button:not(:disabled)",
                  ),
                );
                const index = items.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                const nextIndex =
                  event.key === "ArrowDown"
                    ? (index + 1) % items.length
                    : event.key === "ArrowUp"
                      ? (index - 1 + items.length) % items.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? items.length - 1
                          : null;
                if (nextIndex !== null) {
                  event.preventDefault();
                  items[nextIndex]?.focus();
                }
                if (event.key === "Tab") setContextMenu(null);
              }}
              className="fixed z-[100] min-w-[180px] py-1"
              style={{
                left: contextMenu.x,
                top: contextMenu.y,
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
                borderRadius: "6px",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
              }}
            >
              {contextTab ? (
                <>
                  <MenuButton
                    icon={<X className="h-3.5 w-3.5" />}
                    onClick={handleCloseTabFromMenu}
                  >
                    关闭
                  </MenuButton>
                  <MenuButton
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    onClick={handleStartRename}
                  >
                    重命名
                  </MenuButton>
                  <MenuDivider />
                </>
              ) : null}
              <MenuButton
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => {
                  setContextMenu(null);
                  onNewTab();
                }}
              >
                新建标签页
              </MenuButton>
              {contextTab ? (
                <MenuButton
                  icon={<PictureInPicture2 className="h-3.5 w-3.5" />}
                  onClick={() => {
                    setContextMenu(null);
                    void handleOpenFloatingWindow();
                  }}
                >
                  浮动窗口
                </MenuButton>
              ) : null}
              {contextTab?.filePath && !contextTab.pendingFilePath ? (
                <MenuButton
                  icon={<FolderSearch className="h-3.5 w-3.5" />}
                  onClick={() => {
                    setContextMenu(null);
                    handleRevealInFileManager();
                  }}
                >
                  {revealInFileManagerLabel}
                </MenuButton>
              ) : null}
              {contextTab ? (
                <>
                  <MenuDivider />
                  <MenuButton
                    icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
                    onClick={() => {
                      setContextMenu(null);
                      handleModeToggle();
                    }}
                  >
                    编辑模式切换
                  </MenuButton>
                </>
              ) : null}
              <MenuDivider />
              <MenuButton
                icon={<SplitSquareHorizontal className="h-3.5 w-3.5" />}
                onClick={() => {
                  setContextMenu(null);
                  onSplitRight();
                }}
              >
                向右拆分
              </MenuButton>
              <MenuButton
                icon={<SplitSquareVertical className="h-3.5 w-3.5" />}
                onClick={() => {
                  setContextMenu(null);
                  onSplitDown();
                }}
              >
                向下拆分
              </MenuButton>
              {showGitActions ? (
                <>
                  <MenuDivider />
                  <MenuButton
                    icon={<GitCompare className="h-3.5 w-3.5" />}
                    onClick={() => {
                      setContextMenu(null);
                      void handleDiff();
                    }}
                  >
                    比较差异
                  </MenuButton>
                  <MenuButton
                    icon={<Undo2 className="h-3.5 w-3.5" />}
                    onClick={() => {
                      if (!contextMenu) return;
                      setDiscardTabId(contextMenu.tabId);
                      setContextMenu(null);
                      setConfirmDiscard(true);
                    }}
                  >
                    放弃更改
                  </MenuButton>
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={(open) => {
          setConfirmDiscard(open);
          if (!open) setDiscardTabId(null);
        }}
        title="确认放弃更改"
        description={`确定要放弃 "${contextTab?.filePath?.split(/[\\/]/).pop() ?? "当前文件"}" 的更改吗？`}
        variant="warning"
        confirmText="确定"
        onConfirm={handleDiscard}
      />
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
      role="menuitem"
      tabIndex={-1}
      className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs transition-colors focus-visible:bg-[var(--hover-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2"
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
