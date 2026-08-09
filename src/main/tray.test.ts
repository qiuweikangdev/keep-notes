import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTray, disposeTray, refreshTray } from "./tray";

const mocks = vi.hoisted(() => {
  const screenListeners = new Map<string, () => void>();
  const trayInstance = {
    destroy: vi.fn(),
    getBounds: vi.fn(() => ({ height: 24, width: 80, x: 0, y: 0 })),
    isDestroyed: vi.fn(() => false),
    on: vi.fn(),
    setContextMenu: vi.fn(),
    setTitle: vi.fn(),
    setToolTip: vi.fn(),
  };
  const resizedIcon = {
    getSize: vi.fn(() => ({ height: 20, width: 20 })),
    isEmpty: vi.fn(() => false),
  };
  const sourceIcon = { resize: vi.fn(() => resizedIcon) };
  const templateIcon = {
    getSize: vi.fn(() => ({ height: 16, width: 16 })),
    isEmpty: vi.fn(() => false),
    setTemplateImage: vi.fn(),
  };

  return {
    appQuit: vi.fn(),
    buildFromTemplate: vi.fn(
      (template: Electron.MenuItemConstructorOptions[]) => template,
    ),
    createFromPath: vi.fn((path: string) =>
      path === "mock-tray-icon.png" ? templateIcon : sourceIcon,
    ),
    createWindow: vi.fn(),
    focusMainWindow: vi.fn(),
    getMainWindow: vi.fn(),
    resizedIcon,
    screenListeners,
    screenOff: vi.fn((event: string) => screenListeners.delete(event)),
    screenOn: vi.fn((event: string, listener: () => void) =>
      screenListeners.set(event, listener),
    ),
    showQuickEditorWindow: vi.fn(),
    showReminderWindow: vi.fn(),
    sourceIcon,
    templateIcon,
    Tray: vi.fn(() => trayInstance),
    trayInstance,
  };
});

vi.mock("electron", () => ({
  app: { isPackaged: false, quit: mocks.appQuit },
  Menu: { buildFromTemplate: mocks.buildFromTemplate },
  nativeImage: {
    createFromPath: mocks.createFromPath,
  },
  screen: {
    getAllDisplays: vi.fn(() => [
      { bounds: { height: 982, width: 1512, x: 0, y: 0 } },
    ]),
    off: mocks.screenOff,
    on: mocks.screenOn,
  },
  Tray: mocks.Tray,
}));

vi.mock("../../resources/icon.png?asset", () => ({
  default: "mock-icon.png",
}));

vi.mock("../../resources/tray-iconTemplate.png?asset", () => ({
  default: "mock-tray-icon.png",
}));

vi.mock("./window", () => ({
  createWindow: mocks.createWindow,
  focusMainWindow: mocks.focusMainWindow,
  getMainWindow: mocks.getMainWindow,
}));

vi.mock("./reminder-window", () => ({
  showReminderWindow: mocks.showReminderWindow,
}));

vi.mock("./quick-editor-window", () => ({
  showQuickEditorWindow: mocks.showQuickEditorWindow,
}));

function getMenuItem(label: string): Electron.MenuItemConstructorOptions {
  const [template] = mocks.buildFromTemplate.mock.calls[0];
  const item = template.find(
    (candidate: Electron.MenuItemConstructorOptions) =>
      candidate.label === label,
  );
  if (!item) throw new Error(`Missing tray item: ${label}`);
  return item;
}

function clickMenuItem(label: string): void {
  const item = getMenuItem(label);
  if (typeof item.click !== "function") {
    throw new Error(`Tray item is not clickable: ${label}`);
  }
  item.click({} as Electron.MenuItem, {} as Electron.BrowserWindow, {});
}

describe("system tray", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    disposeTray();
    vi.clearAllMocks();
    mocks.screenListeners.clear();
    mocks.trayInstance.isDestroyed.mockReturnValue(false);
    mocks.getMainWindow.mockReturnValue(null);
  });

  afterEach(() => {
    disposeTray();
    vi.useRealTimers();
  });

  it("creates a tray icon with the expected context menu", () => {
    createTray();

    if (process.platform === "darwin") {
      expect(mocks.createFromPath).toHaveBeenCalledWith("mock-tray-icon.png");
      expect(mocks.templateIcon.setTemplateImage).toHaveBeenCalledWith(true);
      expect(mocks.Tray).toHaveBeenCalledWith(mocks.templateIcon);
    } else {
      expect(mocks.createFromPath).toHaveBeenCalledWith("mock-icon.png");
      expect(mocks.Tray).toHaveBeenCalledWith(mocks.resizedIcon);
    }
    expect(mocks.trayInstance.setToolTip).toHaveBeenCalledWith("Keep Notes");
    expect(mocks.trayInstance.setTitle).not.toHaveBeenCalled();
    expect(mocks.trayInstance.setContextMenu).toHaveBeenCalledOnce();
    expect(mocks.buildFromTemplate.mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "设置" }),
        expect.objectContaining({ label: "提醒事项浮窗" }),
        expect.objectContaining({ label: "编辑器浮窗" }),
        expect.objectContaining({ label: "退出" }),
      ]),
    );
  });

  it("opens the reminder and quick editor floating windows", () => {
    createTray();

    clickMenuItem("提醒事项浮窗");
    clickMenuItem("编辑器浮窗");

    expect(mocks.showReminderWindow).toHaveBeenCalledOnce();
    expect(mocks.showQuickEditorWindow).toHaveBeenCalledOnce();
  });

  it("recreates the tray after the display topology changes", () => {
    createTray();

    mocks.screenListeners.get("display-removed")?.();
    vi.advanceTimersByTime(299);
    expect(mocks.Tray).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(1);
    expect(mocks.trayInstance.destroy).toHaveBeenCalledOnce();
    expect(mocks.Tray).toHaveBeenCalledTimes(2);
  });

  it("refreshes the tray when the app is activated from the Dock", () => {
    createTray();

    refreshTray();

    expect(mocks.trayInstance.destroy).toHaveBeenCalledOnce();
    expect(mocks.Tray).toHaveBeenCalledTimes(2);
  });

  it("reveals settings after the main renderer is ready", () => {
    const didFinishLoad = vi.fn();
    const win = {
      isDestroyed: vi.fn(() => false),
      webContents: {
        isLoadingMainFrame: vi.fn(() => true),
        once: vi.fn((event: string, listener: () => void) => {
          if (event === "did-finish-load")
            didFinishLoad.mockImplementation(listener);
        }),
        send: vi.fn(),
      },
    };
    mocks.createWindow.mockReturnValue(win);
    createTray();

    clickMenuItem("设置");
    didFinishLoad();

    expect(mocks.createWindow).toHaveBeenCalledOnce();
    expect(mocks.focusMainWindow).toHaveBeenCalledOnce();
    expect(win.webContents.send).toHaveBeenCalledWith(
      "menu:action",
      "openSettings",
    );
  });

  it("quits from the tray menu", () => {
    createTray();

    clickMenuItem("退出");

    expect(mocks.appQuit).toHaveBeenCalledOnce();
  });
});
