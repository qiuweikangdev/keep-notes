import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createWindow,
  openPathInNewWindow,
  resolveWindowOpenTarget,
  type WindowOpenTarget,
} from "./window";

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
      loadFile: vi.fn(),
      loadURL: vi.fn(),
      isDestroyed: vi.fn(() => false),
      show: vi.fn(),
    };
  }),
);

vi.mock("electron", () => ({
  BrowserWindow: BrowserWindowMock,
  app: { isPackaged: true },
  shell: { openExternal: vi.fn() },
  dialog: { showMessageBox: vi.fn(), showSaveDialog: vi.fn() },
}));

vi.mock("@electron-toolkit/utils", () => ({
  is: { dev: false },
}));

vi.mock("./shortcuts", () => ({
  registerWindowShortcuts: vi.fn(),
}));

vi.mock("./ipc/editor.ipc", () => ({
  getCachedDirtyState: vi.fn(() => false),
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
  it("uses the app icon for Windows and Linux development windows", () => {
    createWindow();

    expect(BrowserWindowMock).toHaveBeenCalledWith(
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
