import type { DesktopChannelConfig, Reminder } from "../../shared/types";
import { DEFAULT_NOTIFICATION_CONFIG } from "../../shared/types";
import {
  createAppNotification,
  isAppNotificationSupported,
} from "../app-notification";
import type { NotificationChannel } from "./channel.interface";

function createDesktopNotificationOptions(
  config: DesktopChannelConfig,
  title: string,
  body?: string,
): DesktopChannelConfig & {
  title: string;
  body?: string;
  openLabel: string;
} {
  return { ...config, title, body, openLabel: "查看详情" };
}

async function showDesktopNotification(
  config: DesktopChannelConfig,
  title: string,
  body?: string,
): Promise<void> {
  await createAppNotification(
    createDesktopNotificationOptions(config, title, body),
  ).show();
}

export class DesktopChannel implements NotificationChannel {
  type = "desktop" as const;

  private config: DesktopChannelConfig = DEFAULT_NOTIFICATION_CONFIG.desktop;

  constructor(
    config: DesktopChannelConfig = DEFAULT_NOTIFICATION_CONFIG.desktop,
  ) {
    this.updateConfig(config);
  }

  /** 更新桌面通知配置，后续发送和测试都会使用最新的窗口样式参数。 */
  updateConfig(config: DesktopChannelConfig): void {
    this.config = { ...config };
  }

  /** 发送系统桌面通知；系统权限可能拦截展示，调用方负责兜底。 */
  async send(reminder: Reminder): Promise<void> {
    await showDesktopNotification(
      this.config,
      reminder.title,
      reminder.fileName || undefined,
    );
  }

  /** 发送一条测试通知，用于确认 Electron 与系统通知配置是否打通。 */
  async test(): Promise<{ success: boolean; error?: string }> {
    if (!isAppNotificationSupported()) {
      return {
        success: false,
        error: "当前运行环境不支持应用通知窗口",
      };
    }

    try {
      await showDesktopNotification(
        this.config,
        "Keep Notes 测试通知",
        "系统桌面通知已触发",
      );
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "桌面通知发送失败",
      };
    }
  }
}
