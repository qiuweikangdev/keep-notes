import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureQuickEditorGlobalShortcuts,
  consumePendingQuickEditorContent,
  createQuickEditorWindow,
  disposeQuickEditorWindow,
  returnToMainWindowFromQuickEditor,
  showQuickEditorWindow,
} from "./quick-editor-window";

const windowMocks = vi.hoisted(() => ({
  checkAndCloseWindow: vi.fn(),
  focusMainWindow: vi.fn(),
  getMainWindow: vi.fn(),
  mainWindow: {
    webContents: {
      send: vi.fn(),
    },
  },
}));

const electronMocks = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;

  class MockBrowserWindow {
    private destroyed = false;
    readonly handlers = new Map<string, Handler>();
    readonly options: Electron.BrowserWindowConstructorOptions;
    readonly webContentsHandlers = new Map<string, Handler>();
    readonly webContents = {
      id: 1,
      once: vi.fn((event: string, handler: Handler) => {
        this.webContentsHandlers.set(event, handler);
      }),
    };
    readonly isDestroyed = vi.fn(() => this.destroyed);
    readonly setAlwaysOnTop = vi.fn();
    readonly show = vi.fn();
    readonly focus = vi.fn();
    readonly close = vi.fn(() => {
      this.handlers.get("close")?.({ preventDefault: vi.fn() });
    });
    readonly destroy = vi.fn(() => {
      this.destroyed = true;
      this.handlers.get("closed")?.();
    });
    readonly once = vi.fn((event: string, handler: Handler) => {
      this.handlers.set(event, handler);
    });
    readonly on = vi.fn((event: string, handler: Handler) => {
      this.handlers.set(event, handler);
    });
    readonly loadURL = vi.fn(async () => {
      this.webContentsHandlers.get("did-finish-load")?.();
      this.handlers.get("ready-to-show")?.();
    });
    readonly loadFile = vi.fn(async () => {
      this.webContentsHandlers.get("did-finish-load")?.();
      this.handlers.get("ready-to-show")?.();
    });

    constructor(options: Electron.BrowserWindowConstructorOptions) {
      this.options = options;
    }
  }

  return {
    MockBrowserWindow,
    windows: [] as MockBrowserWindow[],
    register: vi.fn<(accelerator: string, callback: () => unknown) => boolean>(
      () => true,
    ),
    unregister: vi.fn(),
  };
});

vi.mock("./window", () => windowMocks);

vi.mock("electron", () => ({
  BrowserWindow: class extends electronMocks.MockBrowserWindow {
    constructor(options: Electron.BrowserWindowConstructorOptions) {
      super(options);
      electronMocks.windows.push(this);
    }
  },
  globalShortcut: {
    register: electronMocks.register,
    unregister: electronMocks.unregister,
  },
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ x: 100, y: 100 })),
    getDisplayNearestPoint: vi.fn(() => ({
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
    })),
  },
}));

vi.mock("@electron-toolkit/utils", () => ({
  is: { dev: false },
}));

vi.mock("../../resources/icon.png?asset", () => ({
  default: "mock-icon.png",
}));

describe("quick editor floating window", () => {
  beforeEach(() => {
    disposeQuickEditorWindow();
    electronMocks.windows.length = 0;
    vi.clearAllMocks();
    electronMocks.register.mockReturnValue(true);
    windowMocks.getMainWindow.mockReturnValue(windowMocks.mainWindow);
    windowMocks.checkAndCloseWindow.mockImplementation(async (win) => {
      win.destroy();
    });
  });

  it("registers the global shortcut and opens the editor", () => {
    const result = configureQuickEditorGlobalShortcuts([
      "CmdOrCtrl+Alt+ArrowUp",
    ]);

    expect(result).toEqual({ success: true, failedKeys: [] });
    expect(electronMocks.register).toHaveBeenCalledWith(
      "CommandOrControl+Alt+Up",
      showQuickEditorWindow,
    );
  });

  it("creates a centered editor-only floating window", () => {
    const first = showQuickEditorWindow();
    const win = electronMocks.windows[0];

    expect(win.show).toHaveBeenCalledOnce();
    expect(win.focus).toHaveBeenCalledOnce();

    const second = showQuickEditorWindow();

    expect(first).toBe(second);
    expect(win.options).toMatchObject({
      x: 400,
      y: 240,
      width: 640,
      height: 420,
      minWidth: 440,
      minHeight: 300,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
    });
    expect(win.loadFile).toHaveBeenCalledWith(
      expect.stringMatching(/renderer[\\/]index\.html$/),
      { query: { window: "quick-editor" } },
    );
    expect(win.show).toHaveBeenCalledTimes(2);
    expect(win.focus).toHaveBeenCalledTimes(2);
  });

  it("creates additional independent floating editors with offset bounds", () => {
    const first = showQuickEditorWindow();
    const second = createQuickEditorWindow();

    expect(second).not.toBe(first);
    expect(electronMocks.windows).toHaveLength(2);
    expect(electronMocks.windows[1].options).toMatchObject({
      x: 428,
      y: 268,
      width: 640,
      height: 420,
    });

    returnToMainWindowFromQuickEditor("second draft", second);

    expect(second.destroy).toHaveBeenCalledOnce();
    expect(first.destroy).not.toHaveBeenCalled();
    expect(consumePendingQuickEditorContent()).toBe("second draft");
  });

  it("checks unsaved content before closing", async () => {
    const win = showQuickEditorWindow();

    win.close();

    await vi.waitFor(() => {
      expect(windowMocks.checkAndCloseWindow).toHaveBeenCalledWith(win);
    });
  });

  it("imports the draft and returns without opening the close confirmation", () => {
    const win = showQuickEditorWindow();

    returnToMainWindowFromQuickEditor("quick draft", win);

    expect(windowMocks.mainWindow.webContents.send).toHaveBeenCalledWith(
      "quick-editor:import-content",
    );
    expect(consumePendingQuickEditorContent()).toBe("quick draft");
    expect(consumePendingQuickEditorContent()).toBeNull();
    expect(windowMocks.checkAndCloseWindow).not.toHaveBeenCalled();
    expect(win.destroy).toHaveBeenCalledOnce();
    expect(windowMocks.focusMainWindow).toHaveBeenCalledOnce();
  });

  it("keeps the quick editor open when no main application is available", () => {
    const win = showQuickEditorWindow();
    windowMocks.getMainWindow.mockReturnValueOnce(null);

    returnToMainWindowFromQuickEditor("quick draft", win);

    expect(win.destroy).not.toHaveBeenCalled();
    expect(windowMocks.focusMainWindow).not.toHaveBeenCalled();
    expect(consumePendingQuickEditorContent()).toBeNull();
  });
});
