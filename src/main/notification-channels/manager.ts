import fs from "node:fs";
import { app } from "electron";
import { join } from "node:path";
import type {
  NotificationConfig,
  NotificationChannelType,
  Reminder,
} from "../../shared/types";
import { DEFAULT_NOTIFICATION_CONFIG } from "../../shared/types";
import type { NotificationChannel } from "./channel.interface";
import { DesktopChannel } from "./desktop.channel";
import { EmailChannel } from "./email.channel";

export class NotificationChannelManager {
  private channels: Map<NotificationChannelType, NotificationChannel> =
    new Map();
  private config: NotificationConfig = DEFAULT_NOTIFICATION_CONFIG;
  private desktopChannel: DesktopChannel;
  private emailChannel: EmailChannel;

  constructor() {
    this.desktopChannel = new DesktopChannel();
    this.emailChannel = new EmailChannel(this.config.email);
    this.channels.set("desktop", this.desktopChannel);
    this.channels.set("email", this.emailChannel);
  }

  /** 获取当前通知配置的副本 */
  getConfig(): NotificationConfig {
    return { ...this.config };
  }

  /** 更新通知配置并同步到邮件渠道 */
  updateConfig(config: NotificationConfig): void {
    this.config = { ...config };
    this.emailChannel.updateConfig(config.email);
  }

  /** 从 JSON 文件加载通知配置，文件不存在时使用默认配置 */
  async loadConfig(): Promise<NotificationConfig> {
    try {
      const content = await fs.promises.readFile(this.getConfigPath(), "utf-8");
      const parsed = JSON.parse(content) as unknown;
      if (parsed && typeof parsed === "object") {
        this.config = {
          ...DEFAULT_NOTIFICATION_CONFIG,
          ...(parsed as Partial<NotificationConfig>),
        };
        this.emailChannel.updateConfig(this.config.email);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("Failed to read notification config:", error);
      }
    }
    return this.getConfig();
  }

  /** 保存通知配置到 JSON 文件并更新内存中的配置 */
  async saveConfig(config: NotificationConfig): Promise<void> {
    this.updateConfig(config);
    await fs.promises.mkdir(app.getPath("userData"), { recursive: true });
    await fs.promises.writeFile(
      this.getConfigPath(),
      JSON.stringify(this.config, null, 2),
      "utf-8",
    );
  }

  /** 向所有已启用的通知渠道发送提醒，单个渠道失败不影响其他渠道 */
  async sendAll(reminder: Reminder): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.config.email.enabled) {
      promises.push(
        this.emailChannel.send(reminder).catch((error) => {
          console.error("Failed to send email notification:", error);
        }),
      );
    }

    await Promise.allSettled(promises);
  }

  /** 测试指定通知渠道的连通性 */
  async testChannel(
    type: NotificationChannelType,
  ): Promise<{ success: boolean; error?: string }> {
    const channel = this.channels.get(type);
    if (!channel) {
      return { success: false, error: "不支持的通知渠道" };
    }
    return channel.test();
  }

  /** 获取通知配置文件路径 */
  private getConfigPath(): string {
    return join(app.getPath("userData"), "notification-config.json");
  }
}

export const notificationChannelManager = new NotificationChannelManager();
