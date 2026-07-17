import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 快捷键操作命令的类型标识 */
export type ShortcutAction =
  | "newFile"
  | "openFolder"
  | "closeTab"
  | "toggleSidebar"
  | "toggleTheme"
  | "saveFile"
  | "openSearch"
  | "openSearchAlt"
  | "openReminderWindow"
  | "openQuickEditorWindow"
  | "navigateBack"
  | "navigateForward";

/** 单个快捷键配置 */
export interface ShortcutConfig {
  id: ShortcutAction;
  name: string;
  description: string;
  /** 按键绑定，如 "CmdOrCtrl+N"；为空数组表示未绑定 */
  keys: string[];
  /** 是否为系统级快捷键（不可删除） */
  isSystem?: boolean;
}

type ShortcutPlatform = "darwin" | "other";

const legacyMacNavigationShortcutMap = {
  navigateBack: ["Alt+ArrowLeft", "CmdOrCtrl+Alt+ArrowLeft"],
  navigateForward: ["Alt+ArrowRight", "CmdOrCtrl+Alt+ArrowRight"],
} as const;

const legacySidebarToggleKeys = ["CmdOrCtrl+B"];
const defaultSidebarToggleKeys = ["CmdOrCtrl+Shift+B"];

function getShortcutPlatform(): ShortcutPlatform {
  if (typeof window === "undefined") return "other";

  const platform = window.electronAPI?.getPlatform?.();
  return platform === "darwin" ? "darwin" : "other";
}

function hasSameKeys(keys: string[], expectedKeys: readonly string[]): boolean {
  return (
    keys.length === expectedKeys.length &&
    expectedKeys.every((key) => keys.includes(key))
  );
}

function normalizeNavigationKeysForPlatform(
  shortcut: ShortcutConfig,
  platform: ShortcutPlatform,
): ShortcutConfig {
  if (platform !== "darwin") return shortcut;

  if (shortcut.id === "navigateBack") {
    const legacyKeys = legacyMacNavigationShortcutMap.navigateBack;
    const isLegacyBinding = hasSameKeys(shortcut.keys, legacyKeys);

    if (isLegacyBinding) {
      return { ...shortcut, keys: ["CmdOrCtrl+Alt+ArrowLeft"] };
    }
  }

  if (shortcut.id === "navigateForward") {
    const legacyKeys = legacyMacNavigationShortcutMap.navigateForward;
    const isLegacyBinding = hasSameKeys(shortcut.keys, legacyKeys);

    if (isLegacyBinding) {
      return { ...shortcut, keys: ["CmdOrCtrl+Alt+ArrowRight"] };
    }
  }

  return shortcut;
}

function normalizeSidebarToggleKeys(shortcut: ShortcutConfig): ShortcutConfig {
  if (shortcut.id !== "toggleSidebar") return shortcut;

  // 将旧的侧边栏默认快捷键迁移走，避免和编辑器加粗命令冲突。
  if (hasSameKeys(shortcut.keys, legacySidebarToggleKeys)) {
    return { ...shortcut, keys: [...defaultSidebarToggleKeys] };
  }

  return shortcut;
}

function normalizeShortcutListForPlatform(
  shortcuts: ShortcutConfig[],
  platform: ShortcutPlatform,
): ShortcutConfig[] {
  return shortcuts.map((shortcut) =>
    normalizeSidebarToggleKeys(
      normalizeNavigationKeysForPlatform(shortcut, platform),
    ),
  );
}

function createDefaultShortcuts(
  platform: ShortcutPlatform = getShortcutPlatform(),
): ShortcutConfig[] {
  const shortcuts: ShortcutConfig[] = [
    {
      id: "openReminderWindow",
      name: "提醒事项浮窗",
      description: "浮动小窗口中打开提醒事项",
      keys: ["CmdOrCtrl+Alt+R"],
      isSystem: true,
    },
    {
      id: "openQuickEditorWindow",
      name: "编辑器浮窗",
      description: "浮动小窗口中打开编辑器",
      keys: ["CmdOrCtrl+Alt+N"],
      isSystem: true,
    },
    {
      id: "newFile",
      name: "新建文件",
      description: "创建一个新的空白文件",
      keys: ["CmdOrCtrl+N"],
    },
    {
      id: "openFolder",
      name: "打开文件夹",
      description: "在侧边栏打开一个文件夹",
      keys: ["CmdOrCtrl+O"],
    },
    {
      id: "closeTab",
      name: "关闭标签页",
      description: "关闭当前聚焦面板的标签页",
      keys: ["CmdOrCtrl+W"],
    },
    {
      id: "toggleSidebar",
      name: "切换侧边栏",
      description: "展开或收起左侧边栏",
      keys: [...defaultSidebarToggleKeys],
    },
    {
      id: "toggleTheme",
      name: "切换主题",
      description: "在亮色和暗色主题之间切换",
      keys: ["CmdOrCtrl+Shift+L"],
    },
    {
      id: "saveFile",
      name: "保存文件",
      description: "弹出系统保存对话框保存文件",
      keys: ["CmdOrCtrl+S"],
    },
    {
      id: "openSearch",
      name: "打开搜索",
      description: "打开全局文件搜索面板",
      keys: ["CmdOrCtrl+P"],
    },
    {
      id: "openSearchAlt",
      name: "打开搜索（备用）",
      description: "使用备用快捷键打开搜索面板",
      keys: ["CmdOrCtrl+Shift+F"],
    },
    {
      id: "navigateBack",
      name: "返回上一个文件",
      description: "切换到历史记录中的上一个文件",
      keys:
        platform === "darwin"
          ? ["CmdOrCtrl+Alt+ArrowLeft"]
          : ["Alt+ArrowLeft", "CmdOrCtrl+Alt+ArrowLeft"],
    },
    {
      id: "navigateForward",
      name: "前进下一个文件",
      description: "切换到历史记录中的下一个文件",
      keys:
        platform === "darwin"
          ? ["CmdOrCtrl+Alt+ArrowRight"]
          : ["Alt+ArrowRight", "CmdOrCtrl+Alt+ArrowRight"],
    },
  ];

  return normalizeShortcutListForPlatform(shortcuts, platform);
}

function normalizePersistedShortcutsState(
  persistedState: Partial<ShortcutsState> | undefined,
  platform: ShortcutPlatform = getShortcutPlatform(),
): Partial<ShortcutsState> | undefined {
  if (!persistedState) return persistedState;

  const currentDefaults = createDefaultShortcuts(platform);
  const persistedShortcuts = persistedState.shortcuts ?? [];
  const persistedById = new Map(
    persistedShortcuts.map((shortcut) => [shortcut.id, shortcut]),
  );
  const mergedShortcuts = currentDefaults.map((defaultShortcut) => {
    const persistedShortcut = persistedById.get(defaultShortcut.id);
    return persistedShortcut
      ? { ...defaultShortcut, ...persistedShortcut }
      : defaultShortcut;
  });

  return {
    ...persistedState,
    shortcuts: normalizeShortcutListForPlatform(mergedShortcuts, platform),
    // 默认值必须跟随当前版本，不能继续复用旧版本持久化的快照。
    defaultShortcuts: currentDefaults,
  };
}

/** 默认快捷键配置 */
const defaultShortcuts = createDefaultShortcuts();

interface ShortcutsState {
  shortcuts: ShortcutConfig[];
  /** 默认快捷键配置（只读快照），用于检测是否被自定义 */
  defaultShortcuts: ShortcutConfig[];
  /** 更新指定快捷键的按键绑定 */
  updateShortcutKeys: (id: ShortcutAction, keys: string[]) => void;
  /** 重置指定快捷键为默认值 */
  resetShortcut: (id: ShortcutAction) => void;
  /** 重置所有快捷键为默认值 */
  resetAllShortcuts: () => void;
  /** 获取指定快捷键的配置 */
  getShortcut: (id: ShortcutAction) => ShortcutConfig | undefined;
}

export const useShortcutsStore = create<ShortcutsState>()(
  persist(
    (set, get) => ({
      shortcuts: defaultShortcuts,
      defaultShortcuts,

      updateShortcutKeys: (id, keys) =>
        set((state) => ({
          shortcuts: state.shortcuts.map((s) =>
            s.id === id ? { ...s, keys } : s,
          ),
        })),

      resetShortcut: (id) =>
        set((state) => ({
          shortcuts: state.shortcuts.map((s) => {
            if (s.id === id) {
              const defaultItem = defaultShortcuts.find((d) => d.id === id);
              return defaultItem ? { ...s, keys: defaultItem.keys } : s;
            }
            return s;
          }),
        })),

      resetAllShortcuts: () => set({ shortcuts: defaultShortcuts }),

      getShortcut: (id) => get().shortcuts.find((s) => s.id === id),
    }),
    {
      name: "shortcuts-storage",
      version: 4,
      migrate: (persistedState) =>
        normalizePersistedShortcutsState(
          persistedState as Partial<ShortcutsState> | undefined,
        ) ?? persistedState,
    },
  ),
);
