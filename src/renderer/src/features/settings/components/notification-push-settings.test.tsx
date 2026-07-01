import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NOTIFICATION_CONFIG } from "@/types";
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
});
