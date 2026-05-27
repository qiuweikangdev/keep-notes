import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TreeNode, TreeRoot, DirSettings, DirColorEnum } from "@/types";

interface TreeState {
  treeData: TreeNode[];
  treeRoot: TreeRoot | null;
  selectedKey: string | null;
  expandedKeys: string[];
  dirSettings: DirSettings;

  setTreeData: (data: TreeNode[]) => void;
  setTreeRoot: (root: TreeRoot) => void;
  setSelectedKey: (key: string | null) => void;
  toggleExpandedKey: (key: string) => void;
  setExpandedKeys: (keys: string[]) => void;
  updateNodeContent: (key: string, content: string) => void;
  setDirSettings: (settings: Partial<DirSettings>) => void;
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
      }),
    },
  ),
);
