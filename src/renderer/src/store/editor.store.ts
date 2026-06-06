import { create } from "zustand";
import { persist } from "zustand/middleware";

interface EditorAppearance {
  fontSize: number;
  lineHeight: number;
  opacity: number;
  padding: number;
}

interface EditorTab {
  id: string;
  filePath: string | null;
  content: string;
  wordCount: number;
  isDirty: boolean;
  reloadKey: number;
}

interface EditorPanelGroup {
  id: string;
  tabs: EditorTab[];
  activeTabId: string;
  direction: "horizontal" | "vertical";
}

interface EditorState {
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

  // 保持向后兼容
  setContent: (content: string) => void;
  setFilePath: (path: string | null) => void;
  setWordCount: (count: number) => void;
  setDirty: (dirty: boolean) => void;
  setAppearance: (appearance: Partial<EditorAppearance>) => void;
  incrementReloadKey: () => void;
  resetEditor: () => void;
  resetTab: (groupId: string, tabId: string) => void;
}

const defaultAppearance: EditorAppearance = {
  fontSize: 16,
  lineHeight: 1.8,
  opacity: 100,
  padding: 60,
};

// 生成唯一ID
let idCounter = 0;
const generateId = () => `id-${++idCounter}`;

// 创建默认标签页
const createDefaultTab = (filePath?: string | null): EditorTab => ({
  id: generateId(),
  filePath: filePath ?? null,
  content: "",
  wordCount: 0,
  isDirty: false,
  reloadKey: 0,
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
                      t.id === tabId ? { ...t, content, isDirty: true } : t,
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
                        ? { ...t, filePath: path, isDirty: false }
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
                            wordCount: 0,
                            isDirty: false,
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
        incrementReloadKey: () =>
          set((state) => ({ reloadKey: state.reloadKey + 1 })),
        resetEditor: () =>
          set({
            content: "",
            filePath: null,
            wordCount: 0,
            isDirty: false,
          }),
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

        return {
          ...currentState,
          ...(persistedState as object),
          panelGroups:
            persistedPanelGroups && persistedPanelGroups.length > 0
              ? persistedPanelGroups
              : currentState.panelGroups,
          activeGroupId: persistedActiveGroupId || currentState.activeGroupId,
        };
      },
    },
  ),
);
