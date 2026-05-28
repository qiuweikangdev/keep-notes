import { create } from "zustand";
import { persist } from "zustand/middleware";

interface EditorAppearance {
  fontSize: number;
  lineHeight: number;
  opacity: number;
  padding: number;
}

interface EditorState {
  content: string;
  filePath: string | null;
  wordCount: number;
  isDirty: boolean;
  appearance: EditorAppearance;

  setContent: (content: string) => void;
  setFilePath: (path: string | null) => void;
  setWordCount: (count: number) => void;
  setDirty: (dirty: boolean) => void;
  setAppearance: (appearance: Partial<EditorAppearance>) => void;
  resetEditor: () => void;
}

const defaultAppearance: EditorAppearance = {
  fontSize: 16,
  lineHeight: 1.8,
  opacity: 100,
  padding: 60,
};

export const useEditorStore = create<EditorState>()(
  persist(
    (set) => ({
      content: "",
      filePath: null,
      wordCount: 0,
      isDirty: false,
      appearance: defaultAppearance,

      setContent: (content) => set({ content, isDirty: true }),
      setFilePath: (path) => set({ filePath: path, isDirty: false }),
      setWordCount: (count) => set({ wordCount: count }),
      setDirty: (dirty) => set({ isDirty: dirty }),
      setAppearance: (appearance) =>
        set((state) => ({
          appearance: { ...state.appearance, ...appearance },
        })),
      resetEditor: () =>
        set({
          content: "",
          filePath: null,
          wordCount: 0,
          isDirty: false,
        }),
    }),
    {
      name: "editor-storage",
      partialize: (state) => ({
        appearance: state.appearance,
      }),
    },
  ),
);
