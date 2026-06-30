import { Buffer } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppNotification } from "./app-notification";

const electronMocks = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;

  class MockBrowserWindow {
    private destroyed = false;
    readonly options: unknown;
    readonly handlers = new Map<string, Handler>();
    readonly webContentsHandlers = new Map<string, Handler>();
    readonly close = vi.fn(() => {
      this.destroyed = true;
      this.handlers.get("closed")?.();
    });
    readonly isDestroyed = vi.fn(() => this.destroyed);
    readonly setAlwaysOnTop = vi.fn();
    readonly showInactive = vi.fn();
    readonly loadURL = vi.fn(async (_url: string) => {
      this.handlers.get("ready-to-show")?.();
    });
    readonly once = vi.fn((event: string, handler: Handler) => {
      this.handlers.set(event, handler);
    });
    readonly webContents = {
      on: vi.fn((event: string, handler: Handler) => {
        this.webContentsHandlers.set(event, handler);
      }),
      once: vi.fn((event: string, handler: Handler) => {
        this.webContentsHandlers.set(event, handler);
      }),
      setWindowOpenHandler: vi.fn(),
    };
    constructor(options: unknown) {
      this.options = options;
    }
  }

  return {
    MockBrowserWindow,
    windows: [] as MockBrowserWindow[],
    getLastWindow: () =>
      electronMocks.windows[electronMocks.windows.length - 1],
  };
});

vi.mock("electron", () => ({
  BrowserWindow: class extends electronMocks.MockBrowserWindow {
    constructor(options: unknown) {
      super(options);
      electronMocks.windows.push(this);
    }
  },
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ x: 100, y: 100 })),
    getDisplayNearestPoint: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
    })),
  },
}));

describe("createAppNotification", () => {
  beforeEach(() => {
    electronMocks.windows.length = 0;
    vi.clearAllMocks();
  });

  it("closes persistent notifications after opening details", async () => {
    const onOpen = vi.fn();
    const notification = createAppNotification(
      {
        title: "Read notes",
        body: "today.md",
        openLabel: "打开",
        requireInteraction: true,
      },
      onOpen,
    );

    await notification.show();
    const win = electronMocks.getLastWindow();
    const event = { preventDefault: vi.fn() };

    win.webContentsHandlers.get("will-navigate")?.(
      event,
      "keep-notes-notification://open",
    );

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(win.close).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("calls snooze action and closes the notification", async () => {
    const onSnooze = vi.fn();
    const notification = createAppNotification(
      {
        title: "Read notes",
        body: "today.md",
        openLabel: "打开",
        requireInteraction: true,
      },
      vi.fn(),
      onSnooze,
    );

    await notification.show();
    const win = electronMocks.getLastWindow();
    const event = { preventDefault: vi.fn() };

    win.webContentsHandlers.get("will-navigate")?.(
      event,
      "keep-notes-notification://snooze",
    );

    expect(onSnooze).toHaveBeenCalledTimes(1);
    expect(win.close).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("closes non-persistent notifications after opening", async () => {
    const notification = createAppNotification(
      {
        title: "Read notes",
        body: "today.md",
        openLabel: "打开",
        requireInteraction: false,
      },
      vi.fn(),
    );

    await notification.show();
    const win = electronMocks.getLastWindow();

    win.webContentsHandlers.get("will-navigate")?.(
      { preventDefault: vi.fn() },
      "keep-notes-notification://open",
    );

    expect(win.close).toHaveBeenCalledTimes(1);
  });

  it("creates a platform-matched notification window shell", async () => {
    const notification = createAppNotification({
      title: "任务提醒",
      body: "你有一条待办事项需要处理",
      openLabel: "查看详情",
    });

    await notification.show();
    const win = electronMocks.getLastWindow();
    const windowOptions = win.options as {
      width: number;
      height: number;
      y: number;
      vibrancy?: string;
    };
    const [dataUrl] = win.loadURL.mock.calls[0] as [string];
    const html = Buffer.from(
      dataUrl.replace("data:text/html;base64,", ""),
      "base64",
    ).toString("utf-8");

    if (process.platform === "darwin") {
      expect(windowOptions).toMatchObject({
        width: 356,
        height: 144,
        y: 24,
        vibrancy: "popover",
      });
      expect(html).toContain('class="platform-mac"');
      expect(html).toContain("padding: 10px 18px 0 18px;");
      expect(html).toContain("padding: 4px 16px 10px 66px;");
    } else {
      expect(windowOptions).toMatchObject({
        width: 384,
        height: 188,
        y: 704,
      });
      expect(html).toContain('class="platform-windows"');
    }

    expect(html).toContain('class="app-icon"');
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toContain("file://");
    expect(html).toContain("Keep Notes");
    expect(html).toContain("稍后提醒");
    expect(html).toContain("查看详情");
    expect(html).toContain('class="clock-icon"');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('stroke-linecap="round"');
    expect(html).not.toContain("•••");
  });

  it("renders a custom app name and omits an empty body", async () => {
    const notification = createAppNotification({
      appName: "个人提醒",
      title: "任务提醒",
    });

    await notification.show();
    const win = electronMocks.getLastWindow();
    const [dataUrl] = win.loadURL.mock.calls[0] as [string];
    const html = Buffer.from(
      dataUrl.replace("data:text/html;base64,", ""),
      "base64",
    ).toString("utf-8");

    expect(html).toContain('<div class="app-name">个人提醒</div>');
    expect(html).toContain('aria-label="个人提醒 提醒通知"');
    expect(html).not.toContain('<div class="body">提醒事项</div>');
  });
});
