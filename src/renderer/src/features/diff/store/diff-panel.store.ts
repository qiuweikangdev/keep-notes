import { create } from "zustand";

interface DiffPanelPayload {
  filePath: string;
  oldContent: string;
  newContent: string;
}

interface DiffPanelState {
  isOpen: boolean;
  filePath: string | null;
  oldContent: string;
  newContent: string;

  open: (payload: DiffPanelPayload) => void;
  close: () => void;
}

export const useDiffPanelStore = create<DiffPanelState>()((set) => ({
  isOpen: false,
  filePath: null,
  oldContent: "",
  newContent: "",

  open: ({ filePath, oldContent, newContent }) =>
    set({ isOpen: true, filePath, oldContent, newContent }),

  close: () =>
    set({ isOpen: false, filePath: null, oldContent: "", newContent: "" }),
}));
