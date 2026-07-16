import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureReminderGlobalShortcuts,
  closeReminderEditorWindow,
  disposeReminderWindow,
  resizeReminderEditorWindow,
  resizeReminderWindow,
  showReminderEditorWindow,
  showReminderWindow,
} from "./reminder-window";

const electronMocks = vi.hoisted(() => {
  type Handler = () => void;

  class MockBrowserWindow {
    private destroyed = false;
    private bounds: Electron.Rectangle;
    readonly options: Electron.BrowserWindowConstructorOptions;
    readonly handlers = new Map<string, Handler>();
    readonly webContents = { send: vi.fn() };
    readonly isDestroyed = vi.fn(() => this.destroyed);
    readonly getBounds = vi.fn(() => ({ ...this.bounds }));
    readonly setBounds = vi.fn((bounds: Electron.Rectangle) => {
      this.bounds = { ...bounds };
    });
    readonly setAlwaysOnTop = vi.fn();
    readonly show = vi.fn();
    readonly focus = vi.fn();
    readonly hide = vi.fn();
    readonly destroy = vi.fn(() => {
      this.destroyed = true;
      this.handlers.get("closed")?.();
    });
    readonly once = vi.fn((event: string, handler: Handler) => {
      this.handlers.set(event, handler);
    });
    readonly loadURL = vi.fn(async () => {
      this.handlers.get("ready-to-show")?.();
    });
    readonly loadFile = vi.fn(async () => {
      this.handlers.get("ready-to-show")?.();
    });

    constructor(options: Electron.BrowserWindowConstructorOptions) {
      this.options = options;
      this.bounds = {
        x: options.x ?? 0,
        y: options.y ?? 0,
        width: options.width ?? 0,
        height: options.height ?? 0,
      };
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

describe("reminder window global shortcut", () => {
  beforeEach(() => {
    disposeReminderWindow();
    electronMocks.windows.length = 0;
    vi.clearAllMocks();
    electronMocks.register.mockReturnValue(true);
  });

  it("registers renderer key names as Electron accelerators", () => {
    const result = configureReminderGlobalShortcuts([
      "CmdOrCtrl+Alt+ArrowLeft",
    ]);

    expect(result).toEqual({ success: true, failedKeys: [] });
    expect(electronMocks.register).toHaveBeenCalledWith(
      "CommandOrControl+Alt+Left",
      showReminderWindow,
    );
  });

  it("rolls back to the previous shortcut when a new key is occupied", () => {
    configureReminderGlobalShortcuts(["CmdOrCtrl+Alt+R"]);
    electronMocks.register.mockImplementation(
      (accelerator) => accelerator !== "CommandOrControl+Alt+X",
    );

    const result = configureReminderGlobalShortcuts(["CmdOrCtrl+Alt+X"]);

    expect(result).toEqual({
      success: false,
      failedKeys: ["CmdOrCtrl+Alt+X"],
    });
    expect(electronMocks.register).toHaveBeenLastCalledWith(
      "CommandOrControl+Alt+R",
      showReminderWindow,
    );
  });

  it("reuses a compact floating window and focuses its search surface", () => {
    const first = showReminderWindow();
    const second = showReminderWindow();
    const win = electronMocks.windows[0];

    expect(first).toBe(second);
    expect(electronMocks.windows).toHaveLength(1);
    expect(win.options).toMatchObject({
      x: 452,
      y: 360,
      width: 536,
      height: 180,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
    });
    expect(win.loadFile).toHaveBeenCalledWith(
      expect.stringMatching(/renderer[\\/]index\.html$/),
      { query: { window: "reminders" } },
    );
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith("reminder:window-shown");
  });

  it("fits the content, centers the first size, and preserves later positions", () => {
    const win = showReminderWindow();

    resizeReminderWindow(win, 150);
    expect(electronMocks.windows[0].setBounds).toHaveBeenLastCalledWith({
      x: 452,
      y: 375,
      width: 536,
      height: 150,
    });

    electronMocks.windows[0].setBounds({
      x: 120,
      y: 160,
      width: 536,
      height: 150,
    });
    resizeReminderWindow(win, 220);
    expect(electronMocks.windows[0].setBounds).toHaveBeenLastCalledWith({
      x: 120,
      y: 160,
      width: 536,
      height: 220,
    });

    electronMocks.windows[0].setBounds.mockClear();
    showReminderWindow();
    expect(electronMocks.windows[0].setBounds).not.toHaveBeenCalled();
  });

  it("opens a separate content-sized reminder editor window", () => {
    const editorWindow = showReminderEditorWindow();
    const win = electronMocks.windows[0];

    expect(win.options).toMatchObject({
      x: 500,
      y: 240,
      width: 440,
      height: 420,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
    });
    expect(win.loadFile).toHaveBeenCalledWith(
      expect.stringMatching(/renderer[\\/]index\.html$/),
      { query: { window: "reminder-editor" } },
    );

    resizeReminderEditorWindow(editorWindow, 360);
    expect(win.setBounds).toHaveBeenLastCalledWith({
      x: 500,
      y: 240,
      width: 440,
      height: 360,
    });

    closeReminderEditorWindow(editorWindow);
    expect(win.destroy).toHaveBeenCalled();
  });

  it("layers the reminder editor over the centered reminder list", () => {
    const listWindow = showReminderWindow();
    showReminderEditorWindow();
    const editorWindow = electronMocks.windows[1];

    expect(editorWindow.options).toMatchObject({
      x: 500,
      y: 400,
      width: 440,
      height: 420,
      parent: listWindow,
    });
    expect(editorWindow.show).toHaveBeenCalled();
    expect(editorWindow.focus).toHaveBeenCalled();
  });
});
