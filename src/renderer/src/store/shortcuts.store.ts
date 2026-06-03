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
  | "openSearchAlt";

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

/** 默认快捷键配置 */
const defaultShortcuts: ShortcutConfig[] = [
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
    keys: ["CmdOrCtrl+B"],
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
];

interface ShortcutsState {
  shortcuts: ShortcutConfig[];
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
    },
  ),
);
