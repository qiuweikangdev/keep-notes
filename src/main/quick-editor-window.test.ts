import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  configureQuickEditorGlobalShortcuts,
  consumePendingQuickEditorContent,
  createQuickEditorWindow,
  disposeQuickEditorWindow,
  returnToMainWindowFromQuickEditor,
  showQuickEditorWindow,
  syncQuickEditorContent,
} from "./quick-editor-window";

const windowMocks = vi.hoisted(() => ({
  checkAndCloseWindow: vi.fn(),
  focusMainWindow: vi.fn(),
  getMainWindow: vi.fn(),
  mainWindow: {
    isDestroyed: vi.fn(() => false),
    webContents: {
      send: vi.fn(),
    },
  },
}));

const fileMocks = vi.hoisted(() => ({
  writeFileContent: vi.fn(async () => undefined),
}));

const electronMocks = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  let nextWebContentsId = 1;

  class MockBrowserWindow {
    private destroyed = false;
    readonly handlers = new Map<string, Handler>();
    readonly options: Electron.BrowserWindowConstructorOptions;
    readonly webContentsHandlers = new Map<string, Handler[]>();
    readonly webContents = {
      id: nextWebContentsId++,
      once: vi.fn((event: string, handler: Handler) => {
        const handlers = this.webContentsHandlers.get(event) ?? [];
        handlers.push(handler);
        this.webContentsHandlers.set(event, handlers);
      }),
      send: vi.fn(),
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
      this.webContentsHandlers
        .get("did-finish-load")
        ?.forEach((handler) => handler());
      this.handlers.get("ready-to-show")?.();
    });
    readonly loadFile = vi.fn(async () => {
      this.webContentsHandlers
        .get("did-finish-load")
        ?.forEach((handler) => handler());
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
vi.mock("./file", () => fileMocks);

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

    returnToMainWindowFromQuickEditor(
      { content: "second draft", source: null },
      second,
    );

    expect(second.destroy).toHaveBeenCalledOnce();
    expect(first.destroy).not.toHaveBeenCalled();
    expect(consumePendingQuickEditorContent()).toEqual({
      content: "second draft",
      source: null,
    });
  });

  it("sends initial content only to the floating editor that owns it", () => {
    createQuickEditorWindow({ content: "# First draft", source: null });
    createQuickEditorWindow({ content: "# Second draft", source: null });

    expect(electronMocks.windows[0].webContents.send).toHaveBeenCalledWith(
      "quick-editor:initial-content",
      { content: "# First draft", source: null },
    );
    expect(electronMocks.windows[1].webContents.send).toHaveBeenCalledWith(
      "quick-editor:initial-content",
      { content: "# Second draft", source: null },
    );
  });

  it("broadcasts source-tab edits to every associated floating editor", async () => {
    const source = {
      groupId: "group-1",
      tabId: "tab-1",
      filePath: "/notes/readme.md",
    };
    const content = { content: "# Updated", source };
    createQuickEditorWindow({ content: "# Initial", source });
    createQuickEditorWindow({ content: "# Initial", source });

    syncQuickEditorContent(content);

    expect(electronMocks.windows[0].webContents.send).toHaveBeenCalledWith(
      "quick-editor:content-updated",
      content,
    );
    expect(electronMocks.windows[1].webContents.send).toHaveBeenCalledWith(
      "quick-editor:content-updated",
      content,
    );
  });

  it("writes associated floating-editor updates to the real source file", async () => {
    const source = {
      groupId: "group-1",
      tabId: "tab-1",
      filePath: "/notes/readme.md",
    };
    const win = createQuickEditorWindow({ content: "# Initial", source });

    syncQuickEditorContent(
      { content: "# Updated in floating editor", source },
      win,
    );

    await vi.waitFor(() => {
      expect(fileMocks.writeFileContent).toHaveBeenCalledWith(
        "/notes/readme.md",
        "# Updated in floating editor",
      );
    });
  });

  it("cleans up a closed window without reading its destroyed webContents", () => {
    const win = createQuickEditorWindow({ content: "# Draft", source: null });
    const nativeWindow = electronMocks.windows[0];

    Object.defineProperty(nativeWindow.webContents, "id", {
      get: () => {
        throw new Error("Object has been destroyed");
      },
    });

    expect(() => win.destroy()).not.toThrow();
  });

  it("checks unsaved content before closing", async () => {
    const win = showQuickEditorWindow();

    win.close();

    await vi.waitFor(() => {
      expect(windowMocks.checkAndCloseWindow).toHaveBeenCalledWith(win);
    });
  });

  it("closes a source-linked editor without showing the unsaved-content prompt", () => {
    const win = createQuickEditorWindow({
      content: "# Synced note",
      source: {
        groupId: "group-1",
        tabId: "tab-1",
        filePath: "/notes/synced.md",
      },
    });

    win.close();

    expect(windowMocks.checkAndCloseWindow).not.toHaveBeenCalled();
  });

  it("imports the draft and returns without opening the close confirmation", () => {
    const win = showQuickEditorWindow();

    returnToMainWindowFromQuickEditor(
      { content: "quick draft", source: null },
      win,
    );

    expect(windowMocks.mainWindow.webContents.send).toHaveBeenCalledWith(
      "quick-editor:import-content",
    );
    expect(consumePendingQuickEditorContent()).toEqual({
      content: "quick draft",
      source: null,
    });
    expect(consumePendingQuickEditorContent()).toBeNull();
    expect(windowMocks.checkAndCloseWindow).not.toHaveBeenCalled();
    expect(win.destroy).toHaveBeenCalledOnce();
    expect(windowMocks.focusMainWindow).toHaveBeenCalledOnce();
  });

  it("keeps the quick editor open when no main application is available", () => {
    const win = showQuickEditorWindow();
    windowMocks.getMainWindow.mockReturnValueOnce(null);

    returnToMainWindowFromQuickEditor(
      { content: "quick draft", source: null },
      win,
    );

    expect(win.destroy).not.toHaveBeenCalled();
    expect(windowMocks.focusMainWindow).not.toHaveBeenCalled();
    expect(consumePendingQuickEditorContent()).toBeNull();
  });
});
