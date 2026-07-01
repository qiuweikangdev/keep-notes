import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Reminder } from "../../shared/types";
import { DEFAULT_NOTIFICATION_CONFIG } from "../../shared/types";
import { createAppNotification } from "../app-notification";
import { DesktopChannel } from "./desktop.channel";

const electronMocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();

  return {
    handlers,
    isSupported: vi.fn(),
    show: vi.fn(() => {
      handlers.get("show")?.({});
    }),
    on: vi.fn(),
    once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    }),
  };
});

const appNotificationMocks = vi.hoisted(() => ({
  isSupported: vi.fn(() => true),
  show: vi.fn(() => Promise.resolve()),
}));

vi.mock("electron", () => ({
  Notification: class {
    static isSupported = electronMocks.isSupported;
    show = electronMocks.show;
    on = electronMocks.on;
    once = electronMocks.once;
  },
}));

vi.mock("../app-notification", () => ({
  createAppNotification: vi.fn(() => ({ show: appNotificationMocks.show })),
  isAppNotificationSupported: appNotificationMocks.isSupported,
}));

const reminder: Reminder = {
  id: "reminder-1",
  title: "Read notes",
  filePath: "/workspace/notes/today.md",
  fileName: "today.md",
  scheduledAt: "2026-06-21T09:00:00.000Z",
  repeat: "never",
  completed: false,
  createdAt: "2026-06-21T08:00:00.000Z",
  updatedAt: "2026-06-21T08:00:00.000Z",
};

const customizedDesktopConfig = {
  ...DEFAULT_NOTIFICATION_CONFIG.desktop,
  appName: "Custom Keep Notes",
  showAppIcon: false,
  appNameFontSize: 20,
  appNameColor: "#f8fafc",
  showActions: false,
  backgroundColor: "#0f172a",
  sizePreset: "large" as const,
};

describe("DesktopChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electronMocks.handlers.clear();
    electronMocks.isSupported.mockReturnValue(true);
    appNotificationMocks.isSupported.mockReturnValue(true);
  });

  it("shows a test desktop notification with the custom notification window", async () => {
    const channel = new DesktopChannel();
    channel.updateConfig(customizedDesktopConfig);

    await expect(channel.test()).resolves.toEqual({ success: true });

    expect(appNotificationMocks.show).toHaveBeenCalledTimes(1);
    expect(createAppNotification).toHaveBeenCalledWith({
      ...customizedDesktopConfig,
      title: "Keep Notes 测试通知",
      body: "系统桌面通知已触发",
      openLabel: "查看详情",
    });
    expect(electronMocks.show).not.toHaveBeenCalled();
  });

  it("reports unsupported desktop notification environments", async () => {
    appNotificationMocks.isSupported.mockReturnValue(false);
    const channel = new DesktopChannel();

    await expect(channel.test()).resolves.toEqual({
      success: false,
      error: "当前运行环境不支持应用通知窗口",
    });
  });

  it("reports custom notification window failures", async () => {
    appNotificationMocks.show.mockRejectedValueOnce(
      new Error("Notifications unavailable"),
    );
    const channel = new DesktopChannel();

    await expect(channel.test()).resolves.toEqual({
      success: false,
      error: "Notifications unavailable",
    });
  });

  it("sends reminder desktop notifications", async () => {
    const channel = new DesktopChannel();
    channel.updateConfig(customizedDesktopConfig);

    await channel.send(reminder);

    expect(appNotificationMocks.show).toHaveBeenCalledTimes(1);
    expect(createAppNotification).toHaveBeenCalledWith({
      ...customizedDesktopConfig,
      title: "Read notes",
      body: "today.md",
      openLabel: "查看详情",
    });
    expect(electronMocks.show).not.toHaveBeenCalled();
  });
});
