import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkAndCloseWindow,
  createWindow,
  openPathInNewWindow,
  resolveWindowOpenTarget,
  saveAndClose,
  type WindowOpenTarget,
} from "./window";

const electronMocks = vi.hoisted(() => ({
  showMessageBox: vi.fn(),
  showSaveDialog: vi.fn(),
}));
const getCachedDirtyState = vi.hoisted(() => vi.fn(() => false));

function createRendererExecutor(renderer: Record<string, unknown>) {
  return vi.fn(async (script: string) => {
    return Function("window", `"use strict"; return (${script});`)(renderer);
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

type CloseHandler = (event: {
  preventDefault: ReturnType<typeof vi.fn>;
}) => Promise<void> | void;

function getCloseHandler(win: Electron.BrowserWindow): CloseHandler {
  const on = win.on as unknown as {
    mock: { calls: Array<[string, CloseHandler]> };
  };
  const registration = on.mock.calls.find(([event]) => event === "close");

  if (!registration) throw new Error("Close handler was not registered");
  return registration[1];
}

const BrowserWindowMock = vi.hoisted(() =>
  vi.fn(function BrowserWindow(
    options: Electron.BrowserWindowConstructorOptions,
  ) {
    return {
      options,
      webContents: {
        openDevTools: vi.fn(),
        once: vi.fn(),
        setWindowOpenHandler: vi.fn(),
        send: vi.fn(),
      },
      on: vi.fn(),
      once: vi.fn(),
      loadFile: vi.fn(),
      loadURL: vi.fn(),
      isDestroyed: vi.fn(() => false),
      destroy: vi.fn(),
      show: vi.fn(),
    };
  }),
);

vi.mock("electron", () => ({
  BrowserWindow: BrowserWindowMock,
  app: { isPackaged: true },
  shell: { openExternal: vi.fn() },
  dialog: electronMocks,
}));

vi.mock("@electron-toolkit/utils", () => ({
  is: { dev: false },
}));

vi.mock("./shortcuts", () => ({
  registerWindowShortcuts: vi.fn(),
}));

vi.mock("./ipc/editor.ipc", () => ({
  getCachedDirtyState,
}));

vi.mock("../../resources/icon.png?asset", () => ({
  default: "mock-icon.png",
}));

describe("resolveWindowOpenTarget", () => {
  it("uses the clicked folder as the new workspace root", async () => {
    const target = "/workspace/notes";

    const result = await resolveWindowOpenTarget(
      target,
      vi.fn(async () => ({
        isDirectory: () => true,
        isFile: () => false,
      })) as any,
    );

    expect(result).toEqual<WindowOpenTarget>({
      rootPath: target,
    });
  });

  it("opens files in a new window with their parent folder as workspace", async () => {
    const filePath = "/workspace/notes/daily.md";

    const result = await resolveWindowOpenTarget(
      filePath,
      vi.fn(async () => ({
        isDirectory: () => false,
        isFile: () => true,
      })) as any,
    );

    expect(result).toEqual<WindowOpenTarget>({
      rootPath: path.dirname(filePath),
      filePath,
    });
  });
});

describe("createWindow", () => {
  it("configures the app icon for the current platform", () => {
    createWindow();

    const [options] = BrowserWindowMock.mock.calls[0];

    if (process.platform === "darwin") {
      expect(options).not.toHaveProperty("icon");
      return;
    }

    expect(options).toEqual(
      expect.objectContaining({
        icon: "mock-icon.png",
      }),
    );
  });
});

describe("openPathInNewWindow", () => {
  it("creates a new window with the resolved root and file path", async () => {
    const filePath = "/workspace/notes/daily.md";
    const createWindow = vi.fn();

    const result = await openPathInNewWindow(filePath, {
      createWindow,
      stat: vi.fn(async () => ({
        isDirectory: () => false,
        isFile: () => true,
      })) as any,
    });

    expect(result).toBe(true);
    expect(createWindow).toHaveBeenCalledWith({
      rootPath: path.dirname(filePath),
      filePath,
    });
  });
});

describe("window close draft protection", () => {
  const writeFile = vi.spyOn(fs.promises, "writeFile");

  beforeEach(() => {
    vi.clearAllMocks();
    getCachedDirtyState.mockReturnValue(true);
    writeFile.mockResolvedValue();
  });

  afterEach(() => {
    writeFile.mockReset();
  });

  it("starts only one close flow for rapid repeated close events", async () => {
    const confirmation = createDeferred<{ response: number }>();
    electronMocks.showMessageBox.mockReturnValue(confirmation.promise);
    const win = createWindow();
    const close = getCloseHandler(win);
    const firstEvent = { preventDefault: vi.fn() };
    const secondEvent = { preventDefault: vi.fn() };

    const firstClose = close(firstEvent);
    const secondClose = close(secondEvent);

    confirmation.resolve({ response: 2 });
    await firstClose;
    await secondClose;

    expect(firstEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(secondEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(electronMocks.showMessageBox).toHaveBeenCalledTimes(1);
  });

  it("allows closing again after the user cancels", async () => {
    electronMocks.showMessageBox.mockResolvedValue({ response: 2 });
    const win = createWindow();
    const close = getCloseHandler(win);

    await close({ preventDefault: vi.fn() });
    await close({ preventDefault: vi.fn() });

    expect(electronMocks.showMessageBox).toHaveBeenCalledTimes(2);
  });

  it("keeps close flows isolated between windows", async () => {
    const confirmation = createDeferred<{ response: number }>();
    electronMocks.showMessageBox.mockReturnValue(confirmation.promise);
    const firstWindow = createWindow();
    const secondWindow = createWindow();

    const firstClose = getCloseHandler(firstWindow)({
      preventDefault: vi.fn(),
    });
    const secondClose = getCloseHandler(secondWindow)({
      preventDefault: vi.fn(),
    });

    expect(electronMocks.showMessageBox).toHaveBeenCalledTimes(2);

    confirmation.resolve({ response: 1 });
    await firstClose;
    await secondClose;

    expect(firstWindow.destroy).toHaveBeenCalledTimes(1);
    expect(secondWindow.destroy).toHaveBeenCalledTimes(1);
  });

  it("shows the save confirmation when the renderer reports any dirty tab", async () => {
    electronMocks.showMessageBox.mockResolvedValue({ response: 2 });
    const win = {
      isDestroyed: vi.fn(() => false),
      destroy: vi.fn(),
    } as unknown as Electron.BrowserWindow;

    await checkAndCloseWindow(win);

    expect(getCachedDirtyState).toHaveBeenCalledWith(win);
    expect(electronMocks.showMessageBox).toHaveBeenCalledTimes(1);
    expect(win.destroy).not.toHaveBeenCalled();
  });

  it("saves an untitled draft by identity and closes after no dirty tabs remain", async () => {
    const executeJavaScript = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          groupId: "group-1",
          tabId: "tab-draft",
          content: "draft",
          filePath: null,
        }),
      )
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce("null");
    const win = {
      isDestroyed: vi.fn(() => false),
      destroy: vi.fn(),
      webContents: { executeJavaScript },
    } as unknown as Electron.BrowserWindow;
    electronMocks.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: "C:\\notes\\draft.md",
    });

    await saveAndClose(win);

    expect(writeFile).toHaveBeenCalledWith(
      "C:\\notes\\draft.md",
      "draft",
      "utf-8",
    );
    expect(executeJavaScript.mock.calls[1][0]).toContain(
      "__onCloseSaveSuccess",
    );
    expect(executeJavaScript.mock.calls[1][0]).toContain("tab-draft");
    expect(executeJavaScript.mock.calls[1][0]).toContain("draft");
    expect(win.destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps the window open when the dirty snapshot getter is missing", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const executeJavaScript = createRendererExecutor({});
    const win = {
      isDestroyed: vi.fn(() => false),
      destroy: vi.fn(),
      webContents: { executeJavaScript },
    } as unknown as Electron.BrowserWindow;

    try {
      await saveAndClose(win);

      expect(executeJavaScript).toHaveBeenCalledTimes(1);
      expect(win.destroy).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        "Error during save:",
        expect.objectContaining({
          message: "Close-save snapshot bridge is unavailable",
        }),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("keeps the window open when the save success callback is missing", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const snapshots = [
      {
        groupId: "group-1",
        tabId: "tab-draft",
        content: "draft",
        filePath: "C:\\notes\\draft.md",
      },
      null,
    ];
    const executeJavaScript = createRendererExecutor({
      __getNextDirtyEditor: () => snapshots.shift(),
    });
    const win = {
      isDestroyed: vi.fn(() => false),
      destroy: vi.fn(),
      webContents: { executeJavaScript },
    } as unknown as Electron.BrowserWindow;

    try {
      await saveAndClose(win);

      expect(writeFile).toHaveBeenCalledTimes(1);
      expect(executeJavaScript).toHaveBeenCalledTimes(2);
      expect(win.destroy).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        "Error during save:",
        expect.objectContaining({
          message: "Close-save success bridge is unavailable",
        }),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it.each([false, 0, "", {}])(
    "keeps the window open for invalid dirty snapshot %#",
    async (invalidSnapshot) => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const executeJavaScript = vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify(invalidSnapshot));
      const win = {
        isDestroyed: vi.fn(() => false),
        destroy: vi.fn(),
        webContents: { executeJavaScript },
      } as unknown as Electron.BrowserWindow;

      try {
        await saveAndClose(win);

        expect(writeFile).not.toHaveBeenCalled();
        expect(win.destroy).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalledWith(
          "Error during save:",
          expect.objectContaining({
            message: "Invalid close-save snapshot",
          }),
        );
      } finally {
        consoleError.mockRestore();
      }
    },
  );

  it("writes dirty snapshots in order and closes only after consuming null", async () => {
    const firstSnapshot = {
      groupId: 'group-"1',
      tabId: "tab-first",
      content: 'first "draft"\nline',
      filePath: "C:\\notes\\first.md",
    };
    const secondSnapshot = {
      groupId: "group-2",
      tabId: "tab-second",
      content: "second draft",
      filePath: "C:\\notes\\second.md",
    };
    const snapshots = [firstSnapshot, secondSnapshot, null];
    const savedSnapshots: unknown[][] = [];
    const executeJavaScript = createRendererExecutor({
      __getNextDirtyEditor: () => snapshots.shift(),
      __onCloseSaveSuccess: (...args: unknown[]) => savedSnapshots.push(args),
    });
    const win = {
      isDestroyed: vi.fn(() => false),
      destroy: vi.fn(),
      webContents: { executeJavaScript },
    } as unknown as Electron.BrowserWindow;

    await saveAndClose(win);

    expect(writeFile.mock.calls).toEqual([
      [firstSnapshot.filePath, firstSnapshot.content, "utf-8"],
      [secondSnapshot.filePath, secondSnapshot.content, "utf-8"],
    ]);
    expect(savedSnapshots).toEqual([
      [
        firstSnapshot.groupId,
        firstSnapshot.tabId,
        firstSnapshot.filePath,
        firstSnapshot.content,
      ],
      [
        secondSnapshot.groupId,
        secondSnapshot.tabId,
        secondSnapshot.filePath,
        secondSnapshot.content,
      ],
    ]);
    expect(executeJavaScript).toHaveBeenCalledTimes(5);
    expect(win.destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps the window open when Save As is canceled", async () => {
    const executeJavaScript = vi.fn().mockResolvedValueOnce(
      JSON.stringify({
        groupId: "group-1",
        tabId: "tab-draft",
        content: "draft",
        filePath: null,
      }),
    );
    const win = {
      isDestroyed: vi.fn(() => false),
      destroy: vi.fn(),
      webContents: { executeJavaScript },
    } as unknown as Electron.BrowserWindow;
    electronMocks.showSaveDialog.mockResolvedValue({ canceled: true });

    await saveAndClose(win);

    expect(writeFile).not.toHaveBeenCalled();
    expect(win.destroy).not.toHaveBeenCalled();
  });
});
