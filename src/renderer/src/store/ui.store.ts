import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ThemeName } from "@/config/themes";

interface UIState {
  theme: ThemeName;
  panelSize: number;
  isSettingsOpen: boolean;
  activeTab: string;

  setTheme: (theme: ThemeName) => void;
  setPanelSize: (size: number) => void;
  setSettingsOpen: (open: boolean) => void;
  setActiveTab: (tab: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "light" as ThemeName,
      panelSize: 25,
      isSettingsOpen: false,
      activeTab: "file",

      setTheme: (theme) => set({ theme }),
      setPanelSize: (size) => set({ panelSize: size }),
      setSettingsOpen: (open) => set({ isSettingsOpen: open }),
      setActiveTab: (tab) => set({ activeTab: tab }),
    }),
    {
      name: "ui-storage",
      partialize: (state) => ({
        theme: state.theme,
        panelSize: state.panelSize,
      }),
    },
  ),
);
