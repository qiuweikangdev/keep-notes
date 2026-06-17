import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  openPathInNewWindow,
  resolveWindowOpenTarget,
  type WindowOpenTarget,
} from "./window";

vi.mock("electron", () => ({
  BrowserWindow: class {},
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
