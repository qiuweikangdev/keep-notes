import { createHmac } from "node:crypto";
import dayjs from "dayjs";
import type { FeishuChannelConfig, Reminder } from "../../shared/types";
import type { NotificationChannel } from "./channel.interface";

export class FeishuChannel implements NotificationChannel {
  type = "feishu" as const;
  private config: FeishuChannelConfig;

  constructor(config: FeishuChannelConfig) {
    this.config = { ...config };
  }

  updateConfig(config: FeishuChannelConfig): void {
    this.config = { ...config };
  }

  /** 提醒消息只包含标题、文件名和时间，不发送本地文件路径。 */
  async send(reminder: Reminder): Promise<void> {
    if (!this.config.enabled) return;
    await this.sendText(
      `Keep Notes 提醒事项\n标题: ${reminder.title}\n文件: ${reminder.fileName || "无关联文件"}\n时间: ${dayjs(reminder.scheduledAt).format("YYYY-MM-DD HH:mm")}`,
    );
  }

  async test(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.sendText("Keep Notes 测试通知：飞书推送配置成功");
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "飞书推送失败",
      };
    }
  }

  /** 校验官方机器人地址，按飞书协议签名，并同时检查 HTTP 与业务状态。 */
  private async sendText(text: string): Promise<void> {
    const { webhookUrl, secret } = this.config;
    let url: URL;
    try {
      url = new URL(webhookUrl.trim());
    } catch {
      throw new Error("请输入有效的飞书机器人 Webhook 地址");
    }
    if (
      url.protocol !== "https:" ||
      url.hostname !== "open.feishu.cn" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/open-apis\/bot\/v2\/hook\/[a-zA-Z0-9-]+$/.test(url.pathname)
    ) {
      throw new Error(
        "请使用 https://open.feishu.cn/open-apis/bot/v2/hook/ 开头的机器人地址",
      );
    }
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = secret.trim()
      ? {
          timestamp,
          sign: createHmac("sha256", `${timestamp}\n${secret.trim()}`).digest(
            "base64",
          ),
        }
      : {};
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msg_type: "text",
          content: { text },
          ...signature,
        }),
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
    } catch {
      // 不向日志或界面透传网络异常，避免其中携带 Webhook 凭据。
      throw new Error("飞书请求失败或超时，请检查网络后重试");
    }
    if (!response.ok)
      throw new Error(`飞书请求失败（HTTP ${response.status}）`);
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error("飞书返回了无效响应");
    }
    if (!data || typeof data !== "object")
      throw new Error("飞书返回了无效响应");
    const result = data as { code?: unknown; StatusCode?: unknown };
    const code = result.code ?? result.StatusCode;
    if (code !== 0) {
      throw new Error(
        typeof code === "number"
          ? `飞书推送失败（错误码 ${code}），请检查机器人关键词、签名密钥及安全设置`
          : "飞书返回了无效响应",
      );
    }
  }
}
