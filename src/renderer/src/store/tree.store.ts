import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TreeNode, TreeRoot, DirSettings, DirColorEnum } from "@/types";

interface RecentFolder {
  title: string;
  path: string;
}

interface RecentFile {
  title: string;
  path: string;
}

interface TreeState {
  treeData: TreeNode[];
  treeRoot: TreeRoot | null;
  selectedKey: string | null;
  expandedKeys: string[];
  dirSettings: DirSettings;
  recentFolders: RecentFolder[];
  recentFiles: RecentFile[];

  setTreeData: (data: TreeNode[]) => void;
  setTreeRoot: (root: TreeRoot) => void;
  setSelectedKey: (key: string | null) => void;
  toggleExpandedKey: (key: string) => void;
  setExpandedKeys: (keys: string[]) => void;
  updateNodeContent: (key: string, content: string) => void;
  setDirSettings: (settings: Partial<DirSettings>) => void;
  addRecentFolder: (folder: RecentFolder) => void;
  removeRecentFolder: (path: string) => void;
  addRecentFile: (file: RecentFile) => void;
  removeRecentFile: (path: string) => void;
  resetTree: () => void;
}

export const useTreeStore = create<TreeState>()(
  persist(
    (set) => ({
      treeData: [],
      treeRoot: null,
      selectedKey: null,
      expandedKeys: [],
      dirSettings: {
        dirColor: "themeColor" as DirColorEnum,
        showIcon: false,
      },
      recentFolders: [],
      recentFiles: [],

      setTreeData: (data) => set({ treeData: data }),
      setTreeRoot: (root) => set({ treeRoot: root }),
      setSelectedKey: (key) => set({ selectedKey: key }),
      toggleExpandedKey: (key) =>
        set((state) => ({
          expandedKeys: state.expandedKeys.includes(key)
            ? state.expandedKeys.filter((k) => k !== key)
            : [...state.expandedKeys, key],
        })),
      setExpandedKeys: (keys) => set({ expandedKeys: keys }),
      updateNodeContent: (key, content) =>
        set((state) => {
          const updateNode = (nodes: TreeNode[]): TreeNode[] =>
            nodes.map((node) => {
              if (node.key === key) return { ...node, content };
              if (node.children)
                return { ...node, children: updateNode(node.children) };
              return node;
            });
          return { treeData: updateNode(state.treeData) };
        }),
      setDirSettings: (settings) =>
        set((state) => ({
          dirSettings: { ...state.dirSettings, ...settings },
        })),
      addRecentFolder: (folder) =>
        set((state) => {
          // 去重：移除已存在的同路径目录，然后添加到最前面
          const filtered = state.recentFolders.filter(
            (f) => f.path !== folder.path,
          );
          return {
            recentFolders: [folder, ...filtered].slice(0, 10), // 最多保留10个
          };
        }),
      removeRecentFolder: (path) =>
        set((state) => ({
          recentFolders: state.recentFolders.filter((f) => f.path !== path),
        })),
      addRecentFile: (file) =>
        set((state) => {
          // 去重：移除已存在的同路径文件，然后添加到最前面
          const filtered = state.recentFiles.filter(
            (f) => f.path !== file.path,
          );
          return {
            recentFiles: [file, ...filtered].slice(0, 10), // 最多保留10个
          };
        }),
      removeRecentFile: (path) =>
        set((state) => ({
          recentFiles: state.recentFiles.filter((f) => f.path !== path),
        })),
      resetTree: () =>
        set({
          treeData: [],
          treeRoot: null,
          selectedKey: null,
          expandedKeys: [],
        }),
    }),
    {
      name: "tree-storage",
      partialize: (state) => ({
        dirSettings: state.dirSettings,
        recentFolders: state.recentFolders,
        recentFiles: state.recentFiles,
      }),
    },
  ),
);
