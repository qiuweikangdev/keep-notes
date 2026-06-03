import { create } from "zustand";

interface DiffState {
  // 是否显示 diff 面板
  isOpen: boolean;
  // 当前 diff 的文件路径
  filePath: string | null;
  // 原始内容（磁盘上的内容）
  oldContent: string;
  // 新内容（编辑器中的内容）
  newContent: string;

  // 打开 diff 面板
  openDiff: (filePath: string, oldContent: string, newContent: string) => void;
  // 关闭 diff 面板
  closeDiff: () => void;
  // 更新内容
  updateContent: (oldContent: string, newContent: string) => void;
}

export const useDiffStore = create<DiffState>()((set) => ({
  isOpen: false,
  filePath: null,
  oldContent: "",
  newContent: "",

  openDiff: (filePath, oldContent, newContent) =>
    set({
      isOpen: true,
      filePath,
      oldContent,
      newContent,
    }),

  closeDiff: () =>
    set({
      isOpen: false,
      filePath: null,
      oldContent: "",
      newContent: "",
    }),

  updateContent: (oldContent, newContent) =>
    set({
      oldContent,
      newContent,
    }),
}));
