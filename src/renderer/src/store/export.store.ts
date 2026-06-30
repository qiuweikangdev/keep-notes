import { create } from "zustand";
import type { ExportConfig } from "@/types";
import { DEFAULT_EXPORT_CONFIG } from "@/types";

interface ExportState {
  config: ExportConfig;
  isLoading: boolean;
  loadConfig: () => Promise<void>;
  updateConfig: (config: Partial<ExportConfig>) => Promise<void>;
  subscribeToChanges: () => () => void;
}

export const useExportStore = create<ExportState>()((set, get) => ({
  config: DEFAULT_EXPORT_CONFIG,
  isLoading: false,

  /** 从主进程加载导出配置 */
  loadConfig: async () => {
    set({ isLoading: true });
    try {
      const config = await window.electronAPI.getExportConfig();
      set({ config });
    } finally {
      set({ isLoading: false });
    }
  },

  /** 更新导出配置并同步到主进程 */
  updateConfig: async (partial) => {
    const current = get().config;
    const updated: ExportConfig = {
      enabledFormats: partial.enabledFormats ?? current.enabledFormats,
      defaultDirectoryMode:
        partial.defaultDirectoryMode ?? current.defaultDirectoryMode,
      customDirectoryPath:
        partial.customDirectoryPath ?? current.customDirectoryPath,
      openDirectoryAfterExport:
        partial.openDirectoryAfterExport ?? current.openDirectoryAfterExport,
    };
    set({ config: updated });
    await window.electronAPI.setExportConfig(updated);
  },

  /** 订阅导出配置变更事件，返回取消订阅函数 */
  subscribeToChanges: () => {
    return window.electronAPI.onExportConfigChanged((config) => {
      set({ config });
    });
  },
}));
