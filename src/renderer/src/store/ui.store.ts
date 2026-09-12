import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ThemeName } from "@/config/themes";
import type { LayoutName } from "@/config/layouts";

interface UIState {
  theme: ThemeName;
  layout: LayoutName;
  panelSize: number;
  isSettingsOpen: boolean;
  activeTab: string;

  setTheme: (theme: ThemeName) => void;
  setLayout: (layout: LayoutName) => void;
  setPanelSize: (size: number) => void;
  setSettingsOpen: (open: boolean) => void;
  setActiveTab: (tab: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      theme: "dark" as ThemeName,
      layout: "classic" as LayoutName,
      panelSize: 25,
      isSettingsOpen: false,
      activeTab: "file",

      setTheme: (theme) => set({ theme }),
      setLayout: (layout) => set({ layout }),
      setPanelSize: (size) => set({ panelSize: size }),
      setSettingsOpen: (open) => {
        const hash = open ? "#/settings" : "#/";
        if (window.location.hash !== hash) window.location.hash = hash;
        set({ isSettingsOpen: open });
      },
      setActiveTab: (tab) => set({ activeTab: tab }),
    }),
    {
      name: "ui-storage",
      partialize: (state) => ({
        theme: state.theme,
        layout: state.layout,
        panelSize: state.panelSize,
      }),
    },
  ),
);
