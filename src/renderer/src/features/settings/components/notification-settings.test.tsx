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
import { NotificationSettings } from "./notification-settings";

describe("NotificationSettings", () => {
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

  it("updates the desktop notification app name", async () => {
    render(<NotificationSettings />);

    const input = await screen.findByLabelText("通知标题");
    fireEvent.change(input, { target: { value: "个人提醒" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(window.electronAPI.setNotificationConfig).toHaveBeenCalledWith({
        ...DEFAULT_NOTIFICATION_CONFIG,
        desktop: {
          ...DEFAULT_NOTIFICATION_CONFIG.desktop,
          appName: "个人提醒",
        },
      });
    });
  });

  it("places the notification title setting below persistent display", async () => {
    render(<NotificationSettings />);

    const persistentLabel = await screen.findByText("持续显示");
    const titleLabel = screen.getByText("通知标题");

    expect(
      persistentLabel.compareDocumentPosition(titleLabel) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
