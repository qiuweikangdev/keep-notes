import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NOTIFICATION_CONFIG } from "@/types";
import type { NotificationConfig } from "@/types";
import { useNotificationStore } from "@/store/notification.store";
import { NotificationPushSettings } from "./notification-push-settings";

describe("NotificationPushSettings", () => {
  const electronAPI = {
    getNotificationConfig: vi.fn(async () => DEFAULT_NOTIFICATION_CONFIG),
    setNotificationConfig: vi.fn(async () => undefined),
    testNotificationChannel: vi.fn(async () => ({ success: true })),
    onNotificationConfigChanged: vi.fn(() => vi.fn()),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: electronAPI,
    });
    useNotificationStore.setState({
      config: DEFAULT_NOTIFICATION_CONFIG,
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders QQ mail push settings in the notification push tab", async () => {
    render(<NotificationPushSettings />);

    expect(await screen.findByText("QQ 邮箱推送")).toBeInTheDocument();
    expect(screen.queryByText("桌面通知")).not.toBeInTheDocument();
  });

  it("fills missing Feishu settings from a legacy notification config", async () => {
    electronAPI.getNotificationConfig.mockResolvedValueOnce({
      desktop: DEFAULT_NOTIFICATION_CONFIG.desktop,
      email: DEFAULT_NOTIFICATION_CONFIG.email,
    } as unknown as NotificationConfig);

    render(<NotificationPushSettings />);

    expect(await screen.findByLabelText("飞书推送")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("飞书推送"));

    expect(await screen.findByLabelText("Webhook 地址")).toBeInTheDocument();
  });

  it("updates the QQ mail push switch", async () => {
    render(<NotificationPushSettings />);

    fireEvent.click(await screen.findByLabelText("QQ 邮箱推送"));

    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenCalledWith({
        ...DEFAULT_NOTIFICATION_CONFIG,
        email: {
          ...DEFAULT_NOTIFICATION_CONFIG.email,
          enabled: true,
          smtpHost: "smtp.qq.com",
          smtpPort: 465,
        },
      });
    });
  });
  it("saves the current Feishu form without sending a test message", async () => {
    render(<NotificationPushSettings />);
    fireEvent.click(await screen.findByLabelText("飞书推送"));
    await waitFor(() => {
      expect(screen.queryByText("飞书配置已保存")).not.toBeInTheDocument();
    });
    const input = await screen.findByLabelText("Webhook 地址");
    fireEvent.change(input, {
      target: {
        value: "https://open.feishu.cn/open-apis/bot/v2/hook/test-bot",
      },
    });
    fireEvent.change(screen.getByLabelText("签名密钥（可选）"), {
      target: { value: "test-secret" },
    });
    expect(
      screen.queryByRole("button", { name: "保存并发送测试消息" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存配置" }));
    await waitFor(() => {
      expect(electronAPI.setNotificationConfig).toHaveBeenLastCalledWith({
        ...DEFAULT_NOTIFICATION_CONFIG,
        feishu: {
          enabled: true,
          webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/test-bot",
          secret: "test-secret",
        },
      });
    });
    expect(electronAPI.testNotificationChannel).not.toHaveBeenCalled();
  });
});
