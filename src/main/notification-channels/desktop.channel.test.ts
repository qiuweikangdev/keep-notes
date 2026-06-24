import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Reminder } from "../../shared/types";
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

vi.mock("electron", () => ({
  Notification: class {
    static isSupported = electronMocks.isSupported;
    show = electronMocks.show;
    on = electronMocks.on;
    once = electronMocks.once;
  },
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

describe("DesktopChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    electronMocks.handlers.clear();
    electronMocks.isSupported.mockReturnValue(true);
  });

  it("shows a test desktop notification when supported", async () => {
    const channel = new DesktopChannel();

    await expect(channel.test()).resolves.toEqual({ success: true });

    expect(electronMocks.show).toHaveBeenCalledTimes(1);
    expect(electronMocks.once).toHaveBeenCalledWith(
      "failed",
      expect.any(Function),
    );
  });

  it("reports unsupported desktop notification environments", async () => {
    electronMocks.isSupported.mockReturnValue(false);
    const channel = new DesktopChannel();

    await expect(channel.test()).resolves.toEqual({
      success: false,
      error: "当前运行环境不支持系统桌面通知",
    });
  });

  it("reports native desktop notification failures", async () => {
    electronMocks.show.mockImplementationOnce(() => {
      electronMocks.handlers.get("failed")?.({}, "Notifications unavailable");
    });
    const channel = new DesktopChannel();

    await expect(channel.test()).resolves.toEqual({
      success: false,
      error: "Notifications unavailable",
    });
  });

  it("sends reminder desktop notifications", async () => {
    const channel = new DesktopChannel();

    await channel.send(reminder);

    expect(electronMocks.show).toHaveBeenCalledTimes(1);
  });
});
