import { beforeAll, describe, expect, it, vi } from "vitest";
import { getCachedDirtyState, registerEditorIpc } from "./editor.ipc";

const ipcMainMocks = vi.hoisted(() => ({
  on: vi.fn(),
  handle: vi.fn(),
}));

vi.mock("electron", () => ({
  ipcMain: ipcMainMocks,
}));

vi.mock("../utils", () => ({
  getBrowserWindow: vi.fn(),
}));

function createSender(id: number) {
  let destroyedListener: (() => void) | undefined;

  return {
    sender: {
      id,
      once: vi.fn((event: string, listener: () => void) => {
        if (event === "destroyed") destroyedListener = listener;
      }),
    },
    destroy: () => destroyedListener?.(),
  };
}

function createWindow(senderId: number): Electron.BrowserWindow {
  return {
    webContents: { id: senderId },
  } as unknown as Electron.BrowserWindow;
}

describe("editor dirty-state cache", () => {
  beforeAll(() => {
    registerEditorIpc();
  });

  it("keeps interleaved dirty reports isolated by sender", () => {
    const updateDirtyState = ipcMainMocks.on.mock.calls[0][1];
    const senderA = createSender(101);
    const senderB = createSender(202);

    updateDirtyState({ sender: senderA.sender }, true);
    updateDirtyState({ sender: senderB.sender }, false);

    expect(getCachedDirtyState(createWindow(101))).toBe(true);
    expect(getCachedDirtyState(createWindow(202))).toBe(false);

    senderA.destroy();
    senderB.destroy();
  });

  it("removes a sender's cached state when its webContents is destroyed", () => {
    const updateDirtyState = ipcMainMocks.on.mock.calls[0][1];
    const sender = createSender(303);
    const win = createWindow(303);

    updateDirtyState({ sender: sender.sender }, true);
    expect(getCachedDirtyState(win)).toBe(true);

    sender.destroy();

    expect(getCachedDirtyState(win)).toBe(false);
  });
});
