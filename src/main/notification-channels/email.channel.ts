import nodemailer from "nodemailer";
import type { Reminder, EmailChannelConfig } from "../../shared/types";
import type { NotificationChannel } from "./channel.interface";
import dayjs from "dayjs";

export class EmailChannel implements NotificationChannel {
  type = "email" as const;

  private config: EmailChannelConfig;

  constructor(config: EmailChannelConfig) {
    this.config = config;
  }

  /** 更新邮件渠道配置 */
  updateConfig(config: EmailChannelConfig): void {
    this.config = config;
  }

  /** 创建 SMTP 传输器，使用 QQ 邮箱 SMTP 服务 */
  private createTransporter() {
    return nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: this.config.smtpPort === 465,
      auth: {
        user: this.config.senderEmail,
        pass: this.config.authorizationCode,
      },
    });
  }

  /** 发送提醒邮件，包含标题、文件名和提醒时间 */
  async send(reminder: Reminder): Promise<void> {
    if (!this.config.enabled) return;

    const transporter = this.createTransporter();
    const scheduledTime = dayjs(reminder.scheduledAt).format(
      "YYYY-MM-DD HH:mm",
    );

    await transporter.sendMail({
      from: this.config.senderEmail,
      to: this.config.receiverEmail,
      subject: `提醒事项: ${reminder.title}`,
      text: `您的笔记提醒已触发:\n\n标题: ${reminder.title}\n文件: ${reminder.fileName}\n时间: ${scheduledTime}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2 style="color: #333;">提醒事项</h2>
          <p style="color: #666;">您的笔记提醒已触发:</p>
          <table style="border-collapse: collapse; width: 100%; max-width: 400px;">
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">标题</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${reminder.title}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">文件</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${reminder.fileName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">时间</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${scheduledTime}</td>
            </tr>
          </table>
        </div>
      `,
    });
  }

  /** 测试 SMTP 连接是否成功，用于设置页面的"测试连接"按钮 */
  async test(): Promise<{ success: boolean; error?: string }> {
    try {
      const transporter = this.createTransporter();
      await transporter.verify();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "连接失败",
      };
    }
  }
}
