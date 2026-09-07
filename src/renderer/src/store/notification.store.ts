import { create } from "zustand";
import type { NotificationChannelType, NotificationConfig } from "@/types";
import { DEFAULT_NOTIFICATION_CONFIG } from "@/types";

type NotificationConfigInput = Partial<{
  desktop: Partial<NotificationConfig["desktop"]>;
  email: Partial<NotificationConfig["email"]>;
  feishu: Partial<NotificationConfig["feishu"]>;
}>;

/** 补全旧版本配置，避免新增通知渠道字段缺失导致渲染层崩溃。 */
function normalizeConfig(
  config: NotificationConfigInput | null | undefined,
): NotificationConfig {
  return {
    desktop: { ...DEFAULT_NOTIFICATION_CONFIG.desktop, ...config?.desktop },
    email: { ...DEFAULT_NOTIFICATION_CONFIG.email, ...config?.email },
    feishu: { ...DEFAULT_NOTIFICATION_CONFIG.feishu, ...config?.feishu },
  };
}

interface NotificationState {
  config: NotificationConfig;
  isLoading: boolean;
  loadConfig: () => Promise<void>;
  updateConfig: (config: Partial<NotificationConfig>) => Promise<void>;
  testChannel: (
    type: NotificationChannelType,
  ) => Promise<{ success: boolean; error?: string }>;
  subscribeToChanges: () => () => void;
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  config: DEFAULT_NOTIFICATION_CONFIG,
  isLoading: false,

  /** 从主进程加载通知配置 */
  loadConfig: async () => {
    set({ isLoading: true });
    try {
      const config = await window.electronAPI.getNotificationConfig();
      set({ config: normalizeConfig(config) });
    } finally {
      set({ isLoading: false });
    }
  },

  /** 更新通知配置并同步到主进程 */
  updateConfig: async (partial) => {
    const current = get().config;
    const updated: NotificationConfig = {
      desktop: { ...current.desktop, ...partial.desktop },
      email: { ...current.email, ...partial.email },
      feishu: { ...current.feishu, ...partial.feishu },
    };
    await window.electronAPI.setNotificationConfig(updated);
    set({ config: updated });
  },

  /** 测试指定通知渠道的连通性 */
  testChannel: async (type) => {
    return window.electronAPI.testNotificationChannel(type);
  },

  /** 订阅通知配置变更事件，返回取消订阅函数 */
  subscribeToChanges: () => {
    return window.electronAPI.onNotificationConfigChanged((config) => {
      set({ config: normalizeConfig(config) });
    });
  },
}));
