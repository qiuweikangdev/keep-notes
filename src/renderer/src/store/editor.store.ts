import { create } from "zustand";

interface EditorState {
  content: string;
  filePath: string | null;
  wordCount: number;
  isDirty: boolean;

  setContent: (content: string) => void;
  setFilePath: (path: string | null) => void;
  setWordCount: (count: number) => void;
  setDirty: (dirty: boolean) => void;
  resetEditor: () => void;
}

export const useEditorStore = create<EditorState>()((set) => ({
  content: "",
  filePath: null,
  wordCount: 0,
  isDirty: false,

  setContent: (content) => set({ content, isDirty: true }),
  setFilePath: (path) => set({ filePath: path, isDirty: false }),
  setWordCount: (count) => set({ wordCount: count }),
  setDirty: (dirty) => set({ isDirty: dirty }),
  resetEditor: () =>
    set({
      content: "",
      filePath: null,
      wordCount: 0,
      isDirty: false,
    }),
}));
