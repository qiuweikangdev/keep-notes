import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  normalizePersistedAppearance,
  normalizePersistedPanelGroups,
} from "@/features/editor/lib/editor-state-migration";
import {
  beginFileTransition,
  completeFileTransition,
  failFileTransition,
} from "@/features/editor/lib/editor-file-transition";

export interface EditorAppearance {
  fontSize: number;
  lineHeight: number;
  opacity: number;
  padding: number;
  showModeSwitcher: boolean;
  sidebarView: "file" | "outline";
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

  // 面板组操作
  addPanelGroup: (direction: "horizontal" | "vertical") => void;
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
  setFileSaveState: (
    path: string,
    status: EditorSaveStatus,
    message: string | null,
  ) => void;
  syncFileContent: (
    path: string,
    content: string,
    sourceTabId?: string,
  ) => void;

  // 大纲操作
  setOutlineHeadings: (headings: OutlineHeading[]) => void;
  setActiveHeadingId: (id: string | null) => void;

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
  lineHeight: 1.8,
  opacity: 100,
  padding: 0,
  showModeSwitcher: true,
  sidebarView: "file",
};

// 生成唯一ID
let idCounter = 0;
const generateId = () => `id-${++idCounter}`;

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
  loadStatus: filePath ? "loading" : "idle",
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

        // 全局状态（保持兼容）
        content: "",
        filePath: null,
        wordCount: 0,
        isDirty: false,
        appearance: defaultAppearance,
        reloadKey: 0,

        // 添加新面板组（拆分）
        addPanelGroup: (direction: "horizontal" | "vertical") => {
          const state = get();
          const activeGroup = state.panelGroups.find(
            (g) => g.id === state.activeGroupId,
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
          };

          set((state) => ({
            panelGroups: [...state.panelGroups, newGroup],
            activeGroupId: newGroup.id,
          }));
        },

        // 移除面板组
        removePanelGroup: (groupId: string) => {
          set((state) => {
            const newGroups = state.panelGroups.filter((g) => g.id !== groupId);
            // 如果没有面板组了，创建一个默认的
            if (newGroups.length === 0) {
              const defaultGroup = createDefaultPanelGroup();
              return {
                panelGroups: [defaultGroup],
                activeGroupId: defaultGroup.id,
              };
            }
            // 如果移除的是当前激活的面板组，切换到第一个
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
          set((state) => {
            const group = state.panelGroups.find((g) => g.id === groupId);
            if (!group) return state;

            const newTabs = group.tabs.filter((t) => t.id !== tabId);

            // 如果没有标签页了
            if (newTabs.length === 0) {
              // 多面板组时，移除整个面板组
              if (state.panelGroups.length > 1) {
                const newGroups = state.panelGroups.filter(
                  (g) => g.id !== groupId,
                );
                const newActiveId =
                  state.activeGroupId === groupId
                    ? newGroups[0].id
                    : state.activeGroupId;
                return {
                  panelGroups: newGroups,
                  activeGroupId: newActiveId,
                };
              }
              // 只有一个面板组时，清空标签页数组，显示空白状态
              return {
                panelGroups: state.panelGroups.map((g) =>
                  g.id === groupId
                    ? {
                        ...g,
                        tabs: [],
                        activeTabId: "",
                      }
                    : g,
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
          set((state) => ({
            panelGroups: state.panelGroups.map((g) =>
              g.id === groupId
                ? {
                    ...g,
                    tabs: g.tabs.map((t) =>
                      t.id === tabId
                        ? {
                            ...t,
                            content,
                            wordCount: content.length,
                            isDirty: true,
                            saveStatus: "dirty",
                            errorMessage: null,
                          }
                        : t,
                    ),
                  }
                : g,
            ),
          }));
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
          set((state) => ({
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
          }));
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
                      tab.id === tabId ? { ...tab, mode } : tab,
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
          set((state) => ({
            panelGroups: state.panelGroups.map((group) =>
              group.id === groupId
                ? {
                    ...group,
                    tabs: group.tabs.map((tab) =>
                      tab.id === tabId ? { ...tab, scrollTop } : tab,
                    ),
                  }
                : group,
            ),
          }));
        },

        setFileSaveState: (path, status, message) => {
          set((state) => ({
            panelGroups: state.panelGroups.map((group) => ({
              ...group,
              tabs: group.tabs.map((tab) =>
                tab.filePath === path
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

        syncFileContent: (path, content, sourceTabId) => {
          set((state) => ({
            panelGroups: state.panelGroups.map((group) => ({
              ...group,
              tabs: group.tabs.map((tab) =>
                tab.filePath === path && tab.id !== sourceTabId
                  ? {
                      ...tab,
                      content,
                      wordCount: content.length,
                      reloadKey: tab.reloadKey + 1,
                    }
                  : tab,
              ),
            })),
          }));
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

        // 大纲操作
        setOutlineHeadings: (headings) => set({ outlineHeadings: headings }),
        setActiveHeadingId: (id) => set({ activeHeadingId: id }),
      };
    },
    {
      name: "editor-storage",
      partialize: (state) => ({
        appearance: state.appearance,
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

        return {
          ...currentState,
          ...(persistedState as object),
          // 新增外观选项时保留默认值，兼容旧版本本地存储。
          appearance: normalizePersistedAppearance(
            currentState.appearance,
            persistedAppearance,
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
