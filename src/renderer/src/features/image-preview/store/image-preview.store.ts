import { create } from "zustand";

interface ImagePreviewState {
  filePath: string | null;
  open: (filePath: string) => void;
  close: () => void;
}

export const useImagePreviewStore = create<ImagePreviewState>((set) => ({
  filePath: null,
  open: (filePath) => set({ filePath }),
  close: () => set({ filePath: null }),
}));
