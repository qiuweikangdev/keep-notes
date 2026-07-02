import { create } from "zustand";

export type DiffSource = "worktree" | "history";

interface OpenDiffOptions {
  source?: DiffSource;
}

interface DiffState {
  // 是否显示 diff 面板
  isOpen: boolean;
  // 标记打开过程中内容是否仍在准备
  isLoading: boolean;
  // 当前 diff 的文件路径
  filePath: string | null;
  // 原始内容（磁盘上的内容）
  oldContent: string;
  // 新内容（编辑器中的内容）
  newContent: string;
  // diff 来源：工作区变更可放弃，历史记录只读
  source: DiffSource;

  // 打开 diff 面板：先打开弹窗占位并标记 isLoading，调用方拿到内容后再调 updateContent。
  openDiff: (
    filePath: string,
    oldContent: string,
    newContent: string,
    options?: OpenDiffOptions,
  ) => void;
  // 关闭 diff 面板
  closeDiff: () => void;
  // 更新内容（与 isLoading=false 一并提交）
  updateContent: (oldContent: string, newContent: string) => void;
}

export const useDiffStore = create<DiffState>()((set) => ({
  isOpen: false,
  isLoading: false,
  filePath: null,
  oldContent: "",
  newContent: "",
  source: "worktree",

  openDiff: (filePath, oldContent, newContent, options) =>
    set({
      isOpen: true,
      // 当传入的内容尚未准备好时显式标记为加载中，避免空内容被误显示为"无差异"。
      isLoading: !oldContent && !newContent,
      filePath,
      oldContent,
      newContent,
      source: options?.source ?? "worktree",
    }),

  closeDiff: () =>
    set({
      isOpen: false,
      isLoading: false,
      filePath: null,
      oldContent: "",
      newContent: "",
      source: "worktree",
    }),

  updateContent: (oldContent, newContent) =>
    set({
      isLoading: false,
      oldContent,
      newContent,
    }),
}));
