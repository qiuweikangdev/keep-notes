import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureReminderGlobalShortcuts,
  closeReminderEditorWindow,
  disposeReminderWindow,
  markReminderEditorRendererReady,
  markReminderEditorRequestApplied,
  prewarmReminderEditorWindow,
  resizeReminderEditorWindow,
  resizeReminderWindow,
  setReminderWindowTheme,
  showReminderEditorWindow,
  showReminderWindow,
} from "./reminder-window";

const electronMocks = vi.hoisted(() => {
  type Handler = () => void;

  class MockBrowserWindow {
    private destroyed = false;
    private visible = false;
    private bounds: Electron.Rectangle;
    readonly options: Electron.BrowserWindowConstructorOptions;
    readonly handlers = new Map<string, Handler>();
    readonly webContents = { send: vi.fn(), getZoomFactor: vi.fn(() => 1) };
    readonly isDestroyed = vi.fn(() => this.destroyed);
    readonly getBounds = vi.fn(() => ({ ...this.bounds }));
    readonly setBounds = vi.fn((bounds: Electron.Rectangle) => {
      this.bounds = { ...bounds };
    });
    readonly setAlwaysOnTop = vi.fn();
    readonly show = vi.fn(() => {
      this.visible = true;
    });
    readonly focus = vi.fn(() => {
      this.handlers.get("focus")?.();
    });
    readonly hide = vi.fn(() => {
      this.visible = false;
    });
    readonly isVisible = vi.fn(() => this.visible);
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
    setReminderWindowTheme("light");
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
      { query: { window: "reminders", theme: "light" } },
    );
    expect(win.show).toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalled();
    expect(win.webContents.send).toHaveBeenCalledWith("reminder:window-shown");
  });

  it("updates reminder windows when the application theme changes", () => {
    const listWindow = showReminderWindow();
    const editorWindow = prewarmReminderEditorWindow();

    setReminderWindowTheme("dark");

    expect(listWindow.webContents.send).toHaveBeenCalledWith(
      "reminder:window-theme-changed",
      "dark",
    );
    expect(editorWindow.webContents.send).toHaveBeenCalledWith(
      "reminder:window-theme-changed",
      "dark",
    );
  });

  it("ignores invalid reminder window themes", () => {
    setReminderWindowTheme("invalid-theme");
    const win = showReminderWindow();

    expect(win.loadFile).toHaveBeenCalledWith(
      expect.stringMatching(/renderer[\\/]index\.html$/),
      { query: { window: "reminders", theme: "light" } },
    );
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

  it("scales the floating list bounds with the renderer zoom", () => {
    const win = showReminderWindow();
    const nativeWindow = electronMocks.windows[0];
    nativeWindow.webContents.getZoomFactor.mockReturnValue(1.25);

    resizeReminderWindow(win, 143);

    expect(nativeWindow.setBounds).toHaveBeenLastCalledWith({
      x: 385,
      y: 361,
      width: 670,
      height: 179,
    });
  });

  it("hides the reminder list when its native window loses focus", () => {
    showReminderWindow();
    const win = electronMocks.windows[0];
    win.hide.mockClear();

    win.handlers.get("blur")?.();

    expect(win.hide).toHaveBeenCalledOnce();
  });

  it("keeps the reminder list visible while its editor child has focus", () => {
    showReminderWindow();
    const editorWindow = showReminderEditorWindow();
    markReminderEditorRendererReady(editorWindow);
    const request = editorWindow.webContents.send.mock.calls.at(-1)?.[1];
    markReminderEditorRequestApplied(editorWindow, request.requestId);
    const listWindow = electronMocks.windows[0];
    listWindow.hide.mockClear();

    listWindow.handlers.get("blur")?.();

    expect(listWindow.hide).not.toHaveBeenCalled();
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
      { query: { window: "reminder-editor", theme: "light" } },
    );

    resizeReminderEditorWindow(editorWindow, 360);
    expect(win.setBounds).toHaveBeenLastCalledWith({
      x: 500,
      y: 240,
      width: 440,
      height: 360,
    });

    editorWindow.setBounds({ x: 500, y: 360, width: 440, height: 360 });
    win.setBounds.mockClear();
    resizeReminderEditorWindow(editorWindow, 620);
    expect(win.setBounds).toHaveBeenLastCalledWith({
      x: 500,
      y: 360,
      width: 440,
      height: 620,
    });

    win.webContents.getZoomFactor.mockReturnValue(1.25);
    resizeReminderEditorWindow(editorWindow, 400);
    expect(win.setBounds).toHaveBeenLastCalledWith({
      x: 445,
      y: 360,
      width: 550,
      height: 500,
    });

    closeReminderEditorWindow(editorWindow);
    expect(win.destroy).toHaveBeenCalled();
  });

  it("reuses a prewarmed editor window for instant reminder creation", () => {
    const prewarmedWindow = prewarmReminderEditorWindow();
    const win = electronMocks.windows[0];

    expect(win.show).not.toHaveBeenCalled();

    const shownWindow = showReminderEditorWindow();

    expect(shownWindow).toBe(prewarmedWindow);
    expect(electronMocks.windows).toHaveLength(1);
    expect(win.show).not.toHaveBeenCalled();

    markReminderEditorRendererReady(shownWindow);
    const request = win.webContents.send.mock.calls.at(-1)?.[1];
    expect(request).toMatchObject({ reminderId: null });

    markReminderEditorRequestApplied(shownWindow, request.requestId);

    expect(win.show).toHaveBeenCalledOnce();
    expect(win.focus).toHaveBeenCalledOnce();
  });

  it("reuses a prewarmed editor window when modifying a reminder", () => {
    const prewarmedWindow = prewarmReminderEditorWindow();
    const win = electronMocks.windows[0];
    markReminderEditorRendererReady(prewarmedWindow);

    const shownWindow = showReminderEditorWindow("reminder-1");
    const request = win.webContents.send.mock.calls.at(-1)?.[1];

    expect(shownWindow).toBe(prewarmedWindow);
    expect(electronMocks.windows).toHaveLength(1);
    expect(win.destroy).not.toHaveBeenCalled();
    expect(request).toMatchObject({ reminderId: "reminder-1" });
    expect(win.show).not.toHaveBeenCalled();

    markReminderEditorRequestApplied(shownWindow, request.requestId);

    expect(win.show).toHaveBeenCalledOnce();
    expect(win.focus).toHaveBeenCalledOnce();
  });

  it("closes the editor on native blur and prepares the next editor", () => {
    showReminderWindow();
    showReminderEditorWindow();
    const editorWindow = electronMocks.windows[1];

    editorWindow.handlers.get("blur")?.();

    expect(editorWindow.destroy).toHaveBeenCalledOnce();
    expect(electronMocks.windows).toHaveLength(3);
    expect(electronMocks.windows[2].show).not.toHaveBeenCalled();
  });

  it("layers the reminder editor over the centered reminder list", () => {
    const listWindow = showReminderWindow();
    const shownWindow = showReminderEditorWindow();
    const editorWindow = electronMocks.windows[1];
    markReminderEditorRendererReady(shownWindow);
    const request = editorWindow.webContents.send.mock.calls.at(-1)?.[1];
    markReminderEditorRequestApplied(shownWindow, request.requestId);

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
