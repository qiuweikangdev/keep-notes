import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ExternalOpenAppId } from "@shared/types";

import {
  normalizePersistedAppearance,
  normalizePersistedPanelGroups,
} from "@/features/editor/lib/editor-state-migration";
import {
  beginFileTransition,
  completeFileTransition,
  failFileTransition,
} from "@/features/editor/lib/editor-file-transition";
import { normalizeRichDocumentPath } from "@/features/editor/lib/rich-document-surface-registry";
import {
  richPaneViewStateRegistry,
  toRichPaneKey,
} from "@/features/editor/lib/rich-pane-view-state";

function matchesEditorFilePath(filePath: string | null, path: string): boolean {
  return (
    filePath !== null &&
    normalizeRichDocumentPath(filePath) === normalizeRichDocumentPath(path)
  );
}

export interface EditorAppearance {
  fontSize: number;
  uiFontSize: number;
  lineHeight: number;
  opacity: number;
  padding: number;
  uiFont: string;
  codeFont: string;
  showModeSwitcher: boolean;
  sidebarView: "file" | "outline";
  showBottomBarOnHover: boolean;
  showFileHistoryNavigation: boolean;
  defaultExternalOpenApp: ExternalOpenAppId;
  showTitleBarQuickLauncher: boolean;
}

export type EditorMode = "rich" | "source";
export type EditorLoadStatus = "idle" | "loading" | "ready" | "error";
export type EditorSaveStatus = "clean" | "dirty" | "saving" | "error";

export interface EditorTab {
  id: string;
  filePath: string | null;
  pendingFilePath: string | null;
  content: string;
  wordCount: number;
  isDirty: boolean;
  reloadKey: number;
  mode: EditorMode;
  loadStatus: EditorLoadStatus;
  saveStatus: EditorSaveStatus;
  errorMessage: string | null;
  parseErrorMessage: string | null;
  scrollTop: number;
}

export interface EditorPanelGroup {
  id: string;
  tabs: EditorTab[];
  activeTabId: string;
  direction: "horizontal" | "vertical";
  splitParentGroupId?: string | null;
}

export interface OutlineHeading {
  id: string;
  text: string;
  level: number;
}

export interface EditorState {
  // 多面板组状态
  panelGroups: EditorPanelGroup[];
  activeGroupId: string;
  recentOpenedFilePaths: string[];

  // 全局状态（保持兼容）
  content: string;
  filePath: string | null;
  wordCount: number;
  isDirty: boolean;
  appearance: EditorAppearance;
  reloadKey: number;

  // 大纲标题状态
  outlineHeadings: OutlineHeading[];
  activeHeadingId: string | null;
  outlineHeadingsByPath: Record<string, OutlineHeading[]>;
  activeHeadingIdByPane: Record<string, string | null>;

  // 面板组操作
  addPanelGroup: (
    direction: "horizontal" | "vertical",
    targetGroupId?: string,
  ) => void;
  removePanelGroup: (groupId: string) => void;
  setActiveGroupId: (groupId: string) => void;

  // 标签页操作
  addTab: (groupId: string, filePath?: string | null) => string;
  removeTab: (groupId: string, tabId: string) => void;
  setActiveTab: (groupId: string, tabId: string) => void;
  moveTab: (
    fromGroupId: string,
    tabId: string,
    toGroupId: string,
    toIndex: number,
  ) => void;

  // 标签页内容操作
  setTabContent: (groupId: string, tabId: string, content: string) => void;
  setTabFilePath: (groupId: string, tabId: string, path: string | null) => void;
  setTabDirty: (groupId: string, tabId: string, dirty: boolean) => void;
  setTabWordCount: (groupId: string, tabId: string, count: number) => void;
  incrementTabReloadKey: (groupId: string, tabId: string) => void;
  beginTabLoad: (groupId: string, tabId: string, path: string) => void;
  completeTabLoad: (
    groupId: string,
    tabId: string,
    path: string,
    content: string,
  ) => void;
  failTabLoad: (
    groupId: string,
    tabId: string,
    path: string,
    message: string,
  ) => void;
  setTabMode: (groupId: string, tabId: string, mode: EditorMode) => void;
  setTabParseError: (
    groupId: string,
    tabId: string,
    message: string | null,
  ) => void;
  setTabScrollTop: (groupId: string, tabId: string, scrollTop: number) => void;
  recordRecentOpenedFile: (path: string) => void;
  setFileSaveState: (
    path: string,
    status: EditorSaveStatus,
    message: string | null,
  ) => void;
  setFileParseState: (path: string, message: string | null) => void;
  syncFileContent: (
    path: string,
    content: string,
    sourceTabId?: string,
    synchronizedTabIds?: readonly string[],
  ) => void;

  // 大纲操作
  setOutlineHeadings: (headings: OutlineHeading[]) => void;
  setActiveHeadingId: (id: string | null) => void;
  setOutlineHeadingsForPath: (path: string, headings: OutlineHeading[]) => void;
  setActiveHeadingIdForPane: (paneKey: string, id: string | null) => void;

  // 保持向后兼容
  setContent: (content: string) => void;
  setFilePath: (path: string | null) => void;
  setWordCount: (count: number) => void;
  setDirty: (dirty: boolean) => void;
  setAppearance: (appearance: Partial<EditorAppearance>) => void;
  setSidebarView: (view: "file" | "outline") => void;
  incrementReloadKey: () => void;
  resetEditor: () => void;
  resetTab: (groupId: string, tabId: string) => void;
}

const defaultAppearance: EditorAppearance = {
  fontSize: 16,
  uiFontSize: 13,
  lineHeight: 1.8,
  opacity: 100,
  padding: 72,
  uiFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  codeFont: '"SF Mono", ui-monospace, "Cascadia Code", Consolas, monospace',
  showModeSwitcher: false,
  sidebarView: "file",
  showBottomBarOnHover: true,
  showFileHistoryNavigation: true,
  defaultExternalOpenApp: "vscode",
  showTitleBarQuickLauncher: true,
};

// 生成唯一ID
let idCounter = 0;
const generateId = () => `id-${++idCounter}`;
const RECENT_OPENED_FILE_LIMIT = 10;

function pushRecentOpenedFilePath(paths: string[], path: string): string[] {
  return [path, ...paths.filter((item) => item !== path)].slice(
    0,
    RECENT_OPENED_FILE_LIMIT,
  );
}

function areOutlineHeadingsEqual(
  current: OutlineHeading[],
  next: OutlineHeading[],
): boolean {
  if (current === next) return true;
  if (current.length !== next.length) return false;

  for (let index = 0; index < current.length; index += 1) {
    const currentHeading = current[index];
    const nextHeading = next[index];
    if (
      currentHeading.id !== nextHeading.id ||
      currentHeading.text !== nextHeading.text ||
      currentHeading.level !== nextHeading.level
    ) {
      return false;
    }
  }

  return true;
}

// 创建默认标签页
const createDefaultTab = (filePath?: string | null): EditorTab => ({
  id: generateId(),
  filePath: filePath ?? null,
  pendingFilePath: null,
  content: "",
  wordCount: 0,
  isDirty: false,
  reloadKey: 0,
  mode: "rich",
  // 未命名文档无需读取磁盘，可直接创建富文本会话。
  loadStatus: filePath ? "loading" : "ready",
  saveStatus: "clean",
  errorMessage: null,
  parseErrorMessage: null,
  scrollTop: 0,
});

// 创建默认面板组
const createDefaultPanelGroup = (): EditorPanelGroup => {
  const tab = createDefaultTab();
  return {
    id: generateId(),
    tabs: [tab],
    activeTabId: tab.id,
    direction: "horizontal",
  };
};

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => {
      const defaultGroup = createDefaultPanelGroup();

      return {
        // 多面板组状态
        panelGroups: [defaultGroup],
        activeGroupId: defaultGroup.id,
        recentOpenedFilePaths: [],

        // 全局状态（保持兼容）
        content: "",
        filePath: null,
        wordCount: 0,
        isDirty: false,
        appearance: defaultAppearance,
        reloadKey: 0,

        // 添加新面板组（拆分）
        addPanelGroup: (
          direction: "horizontal" | "vertical",
          targetGroupId?: string,
        ) => {
          const state = get();
          const sourceGroupId = targetGroupId ?? state.activeGroupId;
          const activeGroup = state.panelGroups.find(
            (g) => g.id === sourceGroupId,
          );
          if (!activeGroup) return;

          const activeTab = activeGroup.tabs.find(
            (t) => t.id === activeGroup.activeTabId,
          );

          // 创建新面板组，复制当前活动标签页
          const newTab = activeTab
            ? { ...activeTab, id: generateId() }
            : createDefaultTab();
          const newGroup: EditorPanelGroup = {
            id: generateId(),
            tabs: [newTab],
            activeTabId: newTab.id,
            direction,
            splitParentGroupId: activeGroup.id,
          };
          const sourcePaneKey = toRichPaneKey(
            activeGroup.id,
            activeGroup.activeTabId,
          );
          const newPaneKey = toRichPaneKey(newGroup.id, newTab.id);
          richPaneViewStateRegistry.patch(
            newPaneKey,
            richPaneViewStateRegistry.read(sourcePaneKey),
          );

          set((current) => ({
            panelGroups: [...current.panelGroups, newGroup],
            activeHeadingIdByPane: {
              ...current.activeHeadingIdByPane,
              [newPaneKey]:
                current.activeHeadingIdByPane[sourcePaneKey] ?? null,
            },
            // 拆分大文档时不要立即激活新面板，避免同步挂载第二个富文本编辑器拖慢当前输入。
            activeGroupId: sourceGroupId,
          }));
        },

        // 移除面板组
        removePanelGroup: (groupId: string) => {
          const removedGroup = get().panelGroups.find(
            (group) => group.id === groupId,
          );
          for (const tab of removedGroup?.tabs ?? []) {
            richPaneViewStateRegistry.delete(toRichPaneKey(groupId, tab.id));
          }
          set((state) => {
            const newGroups = state.panelGroups.filter(
              (group) => group.id !== groupId,
            );
            if (newGroups.length === 0) {
              const replacementGroup = createDefaultPanelGroup();
              return {
                panelGroups: [replacementGroup],
                activeGroupId: replacementGroup.id,
              };
            }
            const newActiveId =
              state.activeGroupId === groupId
                ? newGroups[0].id
                : state.activeGroupId;
            return {
              panelGroups: newGroups,
              activeGroupId: newActiveId,
            };
          });
        },

        // 设置激活面板组
        setActiveGroupId: (groupId: string) => {
          set({ activeGroupId: groupId });
        },

        // 添加标签页
        addTab: (groupId: string, filePath?: string | null) => {
          const newTab = createDefaultTab(filePath);
          set((state) => ({
            panelGroups: state.panelGroups.map((g) =>
              g.id === groupId
                ? { ...g, tabs: [...g.tabs, newTab], activeTabId: newTab.id }
                : g,
            ),
          }));
          return newTab.id;
        },

        // 移除标签页
        removeTab: (groupId: string, tabId: string) => {
          const tabExists = get()
            .panelGroups.find((group) => group.id === groupId)
            ?.tabs.some((tab) => tab.id === tabId);
          if (tabExists) {
            richPaneViewStateRegistry.delete(toRichPaneKey(groupId, tabId));
          }
          set((state) => {
            const group = state.panelGroups.find((g) => g.id === groupId);
            if (!group) return state;

            const newTabs = group.tabs.filter((t) => t.id !== tabId);

            if (newTabs.length === 0) {
              // 多面板组时，移除整个面板组
              if (state.panelGroups.length > 1) {
                const newGroups = state.panelGroups.filter(
                  (item) => item.id !== groupId,
                );
                const newActiveId =
                  state.activeGroupId === groupId
                    ? (newGroups[0]?.id ?? state.activeGroupId)
                    : state.activeGroupId;
                return {
                  panelGroups: newGroups,
                  activeGroupId: newActiveId,
                };
              }
              // 只有一个面板组时，清空标签页数组，显示空白状态
              return {
                // 最后一个标签页关闭后，同步清理旧版全局状态，避免退出时读取到过期脏状态。
                content: "",
                filePath: null,
                wordCount: 0,
                isDirty: false,
                panelGroups: state.panelGroups.map((item) =>
                  item.id === groupId
                    ? {
                        ...item,
                        tabs: [],
                        activeTabId: "",
                      }
                    : item,
                ),
              };
            }

            // 如果移除的是当前活动标签页，切换到第一个
            const newActiveTabId =
              group.activeTabId === tabId ? newTabs[0].id : group.activeTabId;

            return {
              panelGroups: state.panelGroups.map((g) =>
                g.id === groupId
                  ? { ...g, tabs: newTabs, activeTabId: newActiveTabId }
                  : g,
              ),
            };
          });
        },

        // 设置活动标签页
        setActiveTab: (groupId: string, tabId: string) => {
          set((state) => ({
            activeGroupId: groupId,
            panelGroups: state.panelGroups.map((g) =>
              g.id === groupId ? { ...g, activeTabId: tabId } : g,
            ),
          }));
        },

        // 移动标签页（拖拽排序）
        moveTab: (
          fromGroupId: string,
          tabId: string,
          toGroupId: string,
          toIndex: number,
        ) => {
          set((state) => {
            const fromGroup = state.panelGroups.find(
              (g) => g.id === fromGroupId,
            );
            if (!fromGroup) return state;

            const tabIndex = fromGroup.tabs.findIndex((t) => t.id === tabId);
            if (tabIndex === -1) return state;

            const tab = fromGroup.tabs[tabIndex];
            const newFromTabs = fromGroup.tabs.filter((t) => t.id !== tabId);

            // 如果是从同一个面板组移动
            if (fromGroupId === toGroupId) {
              const insertIndex = tabIndex < toIndex ? toIndex - 1 : toIndex;
              newFromTabs.splice(insertIndex, 0, tab);
              return {
                panelGroups: state.panelGroups.map((g) =>
                  g.id === fromGroupId ? { ...g, tabs: newFromTabs } : g,
                ),
              };
            }

            // 跨面板组移动
            const toGroup = state.panelGroups.find((g) => g.id === toGroupId);
            if (!toGroup) return state;

            const newToTabs = [...toGroup.tabs];
            newToTabs.splice(toIndex, 0, tab);

            return {
              panelGroups: state.panelGroups.map((g) => {
                if (g.id === fromGroupId) return { ...g, tabs: newFromTabs };
                if (g.id === toGroupId)
                  return { ...g, tabs: newToTabs, activeTabId: tabId };
                return g;
              }),
              activeGroupId: toGroupId,
            };
          });
        },

        // 设置标签页内容
        setTabContent: (groupId: string, tabId: string, content: string) => {
          set((state) => {
            return {
              panelGroups: state.panelGroups.map((g) =>
                g.id === groupId
                  ? {
                      ...g,
                      tabs: g.tabs.map((t) => {
                        if (t.id !== tabId) return t;

                        // 未命名标签页恢复为空内容时，不应继续触发退出保存提示。
                        const isDirty = t.filePath
                          ? true
                          : content.trim().length > 0;

                        return {
                          ...t,
                          content,
                          wordCount: content.length,
                          isDirty,
                          saveStatus: isDirty ? "dirty" : "clean",
                          errorMessage: null,
                        };
                      }),
                    }
                  : g,
              ),
            };
          });
        },

        // 设置标签页文件路径
        setTabFilePath: (
          groupId: string,
          tabId: string,
          path: string | null,
        ) => {
          set((state) => ({
            panelGroups: state.panelGroups.map((g) =>
              g.id === groupId
                ? {
                    ...g,
                    tabs: g.tabs.map((t) =>
                      t.id === tabId
                        ? {
                            ...t,
                            filePath: path,
                            pendingFilePath: null,
                            isDirty: false,
                          }
                        : t,
                    ),
                  }
                : g,
            ),
          }));
        },

        // 设置标签页脏状态
        setTabDirty: (groupId: string, tabId: string, dirty: boolean) => {
          set((state) => ({
            panelGroups: state.panelGroups.map((g) =>
              g.id === groupId
                ? {
                    ...g,
                    tabs: g.tabs.map((t) =>
                      t.id === tabId ? { ...t, isDirty: dirty } : t,
                    ),
                  }
                : g,
            ),
          }));
        },

        // 设置标签页字数
        setTabWordCount: (groupId: string, tabId: string, count: number) => {
          set((state) => ({
            panelGroups: state.panelGroups.map((g) =>
              g.id === groupId
                ? {
                    ...g,
                    tabs: g.tabs.map((t) =>
                      t.id === tabId ? { ...t, wordCount: count } : t,
                    ),
                  }
                : g,
            ),
          }));
        },

        // 增加标签页重载键
        incrementTabReloadKey: (groupId: string, tabId: string) => {
          set((state) => ({
            panelGroups: state.panelGroups.map((g) =>
              g.id === groupId
                ? {
                    ...g,
                    tabs: g.tabs.map((t) =>
                      t.id === tabId ? { ...t, reloadKey: t.reloadKey + 1 } : t,
                    ),
                  }
                : g,
            ),
          }));
        },

        beginTabLoad: (groupId, tabId, path) => {
          const paneKey = toRichPaneKey(groupId, tabId);
          richPaneViewStateRegistry.delete(paneKey);
          set((state) => {
            const isActiveTarget = state.panelGroups.some(
              (group) =>
                group.id === groupId &&
                group.id === state.activeGroupId &&
                group.activeTabId === tabId,
            );

            const activeHeadingIdByPane = {
              ...state.activeHeadingIdByPane,
            };
            delete activeHeadingIdByPane[paneKey];
            return {
              activeHeadingIdByPane,
              panelGroups: state.panelGroups.map((group) =>
                group.id === groupId
                  ? {
                      ...group,
                      tabs: group.tabs.map((tab) =>
                        tab.id === tabId ? beginFileTransition(tab, path) : tab,
                      ),
                    }
                  : group,
              ),
              ...(isActiveTarget
                ? { outlineHeadings: [], activeHeadingId: null }
                : null),
            };
          });
        },

        completeTabLoad: (groupId, tabId, path, content) => {
          set((state) => ({
            panelGroups: state.panelGroups.map((group) =>
              group.id === groupId
                ? {
                    ...group,
                    tabs: group.tabs.map((tab) => {
                      if (tab.id !== tabId) return tab;
                      // 目标路径与当前或待切换路径匹配时才原子替换文档。
                      return completeFileTransition(tab, path, content);
                    }),
                  }
                : group,
            ),
            recentOpenedFilePaths: pushRecentOpenedFilePath(
              state.recentOpenedFilePaths,
              path,
            ),
          }));
        },

        failTabLoad: (groupId, tabId, path, message) => {
          set((state) => ({
            panelGroups: state.panelGroups.map((group) =>
              group.id === groupId
                ? {
                    ...group,
                    tabs: group.tabs.map((tab) =>
                      tab.id === tabId
                        ? failFileTransition(tab, path, message)
                        : tab,
                    ),
                  }
                : group,
            ),
          }));
        },

        setTabMode: (groupId, tabId, mode) => {
          set((state) => ({
            panelGroups: state.panelGroups.map((group) =>
              group.id === groupId
                ? {
                    ...group,
                    tabs: group.tabs.map((tab) =>
                      tab.id === tabId
                        ? {
                            ...tab,
                            mode,
                            // 从源码模式回到富文本时重新解析当前源码，避免沿用旧序列化基线改写列表标记。
                            reloadKey:
                              tab.mode === "source" && mode === "rich"
                                ? tab.reloadKey + 1
                                : tab.reloadKey,
                          }
                        : tab,
                    ),
                  }
                : group,
            ),
          }));
        },

        setTabParseError: (groupId, tabId, message) => {
          set((state) => ({
            panelGroups: state.panelGroups.map((group) =>
              group.id === groupId
                ? {
                    ...group,
                    tabs: group.tabs.map((tab) => {
                      if (tab.id !== tabId) return tab;
                      const nextMode = message ? "source" : tab.mode;
                      if (
                        tab.mode === nextMode &&
                        tab.parseErrorMessage === message
                      ) {
                        return tab;
                      }
                      return {
                        ...tab,
                        mode: nextMode,
                        parseErrorMessage: message,
                      };
                    }),
                  }
                : group,
            ),
          }));
        },

        setTabScrollTop: (groupId, tabId, scrollTop) => {
          set((state) => {
            // 滚动值未变化或正在加载中，跳过状态更新避免不必要的组件重渲染。
            const group = state.panelGroups.find((g) => g.id === groupId);
            const tab = group?.tabs.find((t) => t.id === tabId);
            if (
              !tab ||
              tab.scrollTop === scrollTop ||
              tab.loadStatus === "loading"
            ) {
              return state;
            }

            return {
              panelGroups: state.panelGroups.map((currentGroup) =>
                currentGroup.id === groupId
                  ? {
                      ...currentGroup,
                      tabs: currentGroup.tabs.map((currentTab) => {
                        if (currentTab.id !== tabId) return currentTab;
                        if (currentTab.loadStatus === "loading") {
                          return currentTab;
                        }

                        return { ...currentTab, scrollTop };
                      }),
                    }
                  : currentGroup,
              ),
            };
          });
        },

        recordRecentOpenedFile: (path) => {
          set((state) => ({
            recentOpenedFilePaths: pushRecentOpenedFilePath(
              state.recentOpenedFilePaths,
              path,
            ),
          }));
        },

        setFileSaveState: (path, status, message) => {
          set((state) => ({
            panelGroups: state.panelGroups.map((group) => ({
              ...group,
              tabs: group.tabs.map((tab) =>
                matchesEditorFilePath(tab.filePath, path)
                  ? {
                      ...tab,
                      saveStatus: status,
                      isDirty: status !== "clean",
                      errorMessage: message,
                    }
                  : tab,
              ),
            })),
          }));
        },

        setFileParseState: (path, message) => {
          set((state) => {
            let changed = false;
            const panelGroups = state.panelGroups.map((group) => {
              let groupChanged = false;
              const tabs = group.tabs.map((tab) => {
                if (
                  !matchesEditorFilePath(tab.filePath, path) ||
                  tab.parseErrorMessage === message
                ) {
                  return tab;
                }
                changed = true;
                groupChanged = true;
                return {
                  ...tab,
                  parseErrorMessage: message,
                  mode: message ? ("source" as const) : tab.mode,
                };
              });
              return groupChanged ? { ...group, tabs } : group;
            });
            return changed ? { panelGroups } : state;
          });
        },

        syncFileContent: (path, content, sourceTabId, synchronizedTabIds) => {
          set((state) => {
            const synchronizedIds = synchronizedTabIds
              ? new Set(synchronizedTabIds)
              : null;
            let changed = false;
            const panelGroups = state.panelGroups.map((group) => {
              let groupChanged = false;
              const tabs = group.tabs.map((tab) => {
                if (
                  !matchesEditorFilePath(tab.filePath, path) ||
                  tab.id === sourceTabId
                ) {
                  return tab;
                }

                const reloadKey = synchronizedIds?.has(tab.id)
                  ? tab.reloadKey
                  : tab.reloadKey + 1;
                if (
                  tab.content === content &&
                  tab.wordCount === content.length &&
                  tab.reloadKey === reloadKey
                ) {
                  return tab;
                }

                changed = true;
                groupChanged = true;
                return {
                  ...tab,
                  content,
                  wordCount: content.length,
                  reloadKey,
                };
              });
              return groupChanged ? { ...group, tabs } : group;
            });
            return changed ? { panelGroups } : state;
          });
        },

        // 重置标签页
        resetTab: (groupId: string, tabId: string) => {
          set((state) => ({
            panelGroups: state.panelGroups.map((g) =>
              g.id === groupId
                ? {
                    ...g,
                    tabs: g.tabs.map((t) =>
                      t.id === tabId
                        ? {
                            ...t,
                            content: "",
                            filePath: null,
                            pendingFilePath: null,
                            wordCount: 0,
                            isDirty: false,
                            mode: "rich",
                            loadStatus: "idle",
                            saveStatus: "clean",
                            errorMessage: null,
                            parseErrorMessage: null,
                            scrollTop: 0,
                          }
                        : t,
                    ),
                  }
                : g,
            ),
          }));
        },

        // 保持向后兼容的旧接口
        setContent: (content) => set({ content, isDirty: true }),
        setFilePath: (path) => set({ filePath: path, isDirty: false }),
        setWordCount: (count) => set({ wordCount: count }),
        setDirty: (dirty) => set({ isDirty: dirty }),
        setAppearance: (appearance) =>
          set((state) => ({
            appearance: { ...state.appearance, ...appearance },
          })),
        setSidebarView: (view) =>
          set((state) => ({
            appearance: { ...state.appearance, sidebarView: view },
          })),
        incrementReloadKey: () =>
          set((state) => ({ reloadKey: state.reloadKey + 1 })),
        resetEditor: () =>
          set({
            content: "",
            filePath: null,
            wordCount: 0,
            isDirty: false,
          }),

        // 大纲标题状态
        outlineHeadings: [],
        activeHeadingId: null,
        outlineHeadingsByPath: {},
        activeHeadingIdByPane: {},

        // 大纲操作
        setOutlineHeadings: (headings) =>
          set((state) => {
            // 大文档输入时会频繁重新提取大纲；内容未变时保持状态引用，避免侧栏整列表重渲染。
            if (areOutlineHeadingsEqual(state.outlineHeadings, headings)) {
              return state;
            }
            return { outlineHeadings: headings };
          }),
        setActiveHeadingId: (id) => set({ activeHeadingId: id }),
        setOutlineHeadingsForPath: (path, headings) =>
          set((state) => {
            const normalizedPath = normalizeRichDocumentPath(path);
            const current = state.outlineHeadingsByPath[normalizedPath] ?? [];
            if (areOutlineHeadingsEqual(current, headings)) return state;
            return {
              outlineHeadingsByPath: {
                ...state.outlineHeadingsByPath,
                [normalizedPath]: headings,
              },
            };
          }),
        setActiveHeadingIdForPane: (paneKey, id) =>
          set((state) => {
            if (state.activeHeadingIdByPane[paneKey] === id) return state;
            return {
              activeHeadingIdByPane: {
                ...state.activeHeadingIdByPane,
                [paneKey]: id,
              },
            };
          }),
      };
    },
    {
      name: "editor-storage",
      partialize: (state) => ({
        appearance: state.appearance,
        recentOpenedFilePaths: state.recentOpenedFilePaths,
      }),
      merge: (persistedState: unknown, currentState: EditorState) => {
        // 确保 panelGroups 始终有值
        const persisted = persistedState as Record<string, unknown> | undefined;
        const persistedPanelGroups = persisted?.panelGroups as
          | EditorPanelGroup[]
          | undefined;
        const persistedActiveGroupId = persisted?.activeGroupId as
          | string
          | undefined;
        const persistedAppearance = persisted?.appearance as
          | Partial<EditorAppearance>
          | undefined;
        const persistedRecentOpenedFilePaths = Array.isArray(
          persisted?.recentOpenedFilePaths,
        )
          ? persisted.recentOpenedFilePaths.filter(
              (path): path is string => typeof path === "string",
            )
          : Array.isArray(persisted?.recentEditedFilePaths)
            ? persisted.recentEditedFilePaths.filter(
                (path): path is string => typeof path === "string",
              )
            : currentState.recentOpenedFilePaths;

        return {
          ...currentState,
          ...(persistedState as object),
          // 新增外观选项时保留默认值，兼容旧版本本地存储。
          appearance: normalizePersistedAppearance(
            currentState.appearance,
            persistedAppearance,
          ),
          recentOpenedFilePaths: persistedRecentOpenedFilePaths.slice(
            0,
            RECENT_OPENED_FILE_LIMIT,
          ),
          panelGroups:
            persistedPanelGroups && persistedPanelGroups.length > 0
              ? normalizePersistedPanelGroups(persistedPanelGroups)
              : currentState.panelGroups,
          activeGroupId: persistedActiveGroupId || currentState.activeGroupId,
        };
      },
    },
  ),
);
