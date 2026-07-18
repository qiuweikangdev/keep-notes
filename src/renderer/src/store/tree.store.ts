import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TreeNode, TreeRoot, DirSettings, DirColorEnum } from "@/types";
import { replaceDirectoryChildren as mergeDirectoryChildren } from "@/features/file-tree/tree-data";

interface RecentFolder {
  title: string;
  path: string;
}

interface TreeState {
  treeData: TreeNode[];
  treeRoot: TreeRoot | null;
  selectedKey: string | null;
  expandedKeys: Set<string>;
  loadingDirectoryKeys: Set<string>;
  isTreeFullyLoaded: boolean;
  dirSettings: DirSettings;
  recentFolders: RecentFolder[];

  setTreeData: (data: TreeNode[]) => void;
  setTreeRoot: (root: TreeRoot) => void;
  setSelectedKey: (key: string | null) => void;
  toggleExpandedKey: (key: string) => void;
  setExpandedKeys: (keys: Iterable<string>) => void;
  replaceDirectoryChildren: (
    directoryPath: string,
    children: TreeNode[],
  ) => void;
  setDirectoryLoading: (directoryPath: string, isLoading: boolean) => void;
  setTreeFullyLoaded: (isLoaded: boolean) => void;
  updateNodeContent: (key: string, content: string) => void;
  setDirSettings: (settings: Partial<DirSettings>) => void;
  addRecentFolder: (folder: RecentFolder) => void;
  removeRecentFolder: (path: string) => void;
  resetTree: () => void;
}

export const useTreeStore = create<TreeState>()(
  persist(
    (set) => ({
      treeData: [],
      treeRoot: null,
      selectedKey: null,
      expandedKeys: new Set(),
      loadingDirectoryKeys: new Set(),
      isTreeFullyLoaded: false,
      dirSettings: {
        dirColor: "themeColor" as DirColorEnum,
        showIcon: false,
      },
      recentFolders: [],

      setTreeData: (data) => set({ treeData: data }),
      setTreeRoot: (root) =>
        set((state) => {
          const expandedKeys = new Set(state.expandedKeys);
          expandedKeys.add(root.key);
          const isNewWorkspace = state.treeRoot?.key !== root.key;
          return {
            treeRoot: root,
            expandedKeys,
            ...(isNewWorkspace
              ? {
                  isTreeFullyLoaded: false,
                  loadingDirectoryKeys: new Set<string>(),
                }
              : {}),
          };
        }),
      setSelectedKey: (key) => set({ selectedKey: key }),
      toggleExpandedKey: (key) =>
        set((state) => {
          // Set 查询为常数时间，每次克隆确保 Zustand 能识别引用变化。
          const expandedKeys = new Set(state.expandedKeys);
          if (expandedKeys.has(key)) expandedKeys.delete(key);
          else expandedKeys.add(key);
          return { expandedKeys };
        }),
      setExpandedKeys: (keys) => set({ expandedKeys: new Set(keys) }),
      replaceDirectoryChildren: (directoryPath, children) =>
        set((state) => {
          if (!state.treeRoot) return state;
          return {
            treeData: mergeDirectoryChildren(
              state.treeData,
              state.treeRoot.key,
              directoryPath,
              children,
            ),
          };
        }),
      setDirectoryLoading: (directoryPath, isLoading) =>
        set((state) => {
          const loadingDirectoryKeys = new Set(state.loadingDirectoryKeys);
          if (isLoading) loadingDirectoryKeys.add(directoryPath);
          else loadingDirectoryKeys.delete(directoryPath);
          return { loadingDirectoryKeys };
        }),
      setTreeFullyLoaded: (isLoaded) => set({ isTreeFullyLoaded: isLoaded }),
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
      resetTree: () =>
        set({
          treeData: [],
          treeRoot: null,
          selectedKey: null,
          expandedKeys: new Set(),
          loadingDirectoryKeys: new Set(),
          isTreeFullyLoaded: false,
        }),
    }),
    {
      name: "tree-storage",
      partialize: (state) => ({
        dirSettings: state.dirSettings,
        recentFolders: state.recentFolders,
      }),
    },
  ),
);
