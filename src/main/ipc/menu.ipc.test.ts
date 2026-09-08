import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../../shared/constants";
import { registerMenuIpc } from "./menu.ipc";

const originalPlatform = process.platform;

const ipcMainMocks = vi.hoisted(() => ({
  handle: vi.fn(),
  on: vi.fn(),
}));

const utilsMocks = vi.hoisted(() => ({
  getBrowserWindow: vi.fn(),
}));

vi.mock("electron", () => ({ ipcMain: ipcMainMocks }));
vi.mock("../utils", () => utilsMocks);

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;

function getListener(channel: string): IpcHandler {
  const listener = ipcMainMocks.on.mock.calls.find(
    ([name]) => name === channel,
  )?.[1];
  if (typeof listener !== "function") {
    throw new Error(`Missing IPC listener: ${channel}`);
  }
  return listener as IpcHandler;
}

describe("window movement IPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, "platform", { value: "win32" });
    registerMenuIpc();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("keeps the drag-start size while moving a Windows window", () => {
    const win = {
      setBounds: vi.fn(),
      setPosition: vi.fn(),
    };
    const bounds = { x: 120, y: 230, width: 900, height: 670 };
    utilsMocks.getBrowserWindow.mockReturnValue(win);

    getListener(IPC_CHANNELS.WINDOW.MOVE)({}, bounds);

    expect(win.setBounds).toHaveBeenCalledWith(bounds);
    expect(win.setPosition).not.toHaveBeenCalled();
  });

  it("preserves position-only movement on non-Windows platforms", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const win = {
      setBounds: vi.fn(),
      setPosition: vi.fn(),
    };
    utilsMocks.getBrowserWindow.mockReturnValue(win);

    getListener(IPC_CHANNELS.WINDOW.MOVE)(
      {},
      {
        x: 120,
        y: 230,
        width: 900,
        height: 670,
      },
    );

    expect(win.setPosition).toHaveBeenCalledWith(120, 230);
    expect(win.setBounds).not.toHaveBeenCalled();
  });

  it("ignores invalid bounds from the renderer", () => {
    const win = {
      setBounds: vi.fn(),
      setPosition: vi.fn(),
    };
    utilsMocks.getBrowserWindow.mockReturnValue(win);

    getListener(IPC_CHANNELS.WINDOW.MOVE)(
      {},
      {
        x: 120,
        y: 230,
        width: 0,
        height: 670,
      },
    );

    expect(win.setBounds).not.toHaveBeenCalled();
    expect(win.setPosition).not.toHaveBeenCalled();
  });
});
