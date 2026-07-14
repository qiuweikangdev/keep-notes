import process from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { registerWindowsZoomInShortcut } from "./zoom-shortcuts";

const originalPlatform = process.platform;

describe("registerWindowsZoomInShortcut", () => {
  beforeEach(() => {
    Object.defineProperty(process, "platform", { value: "win32" });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it.each([
    { code: "Equal", key: "+", shift: true },
    { code: "Equal", key: "=", shift: false },
    { code: "NumpadAdd", key: "+", shift: false },
    { code: "", key: "+", shift: false },
  ])("zooms in for Ctrl +", (input) => {
    const { win, listener, getZoomLevel, setZoomLevel } = createWindowMock();
    const event = { preventDefault: vi.fn() };

    registerWindowsZoomInShortcut(win);
    listener(event, {
      type: "keyDown",
      control: true,
      alt: false,
      meta: false,
      ...input,
    } as Electron.KeyboardInputEvent);

    expect(getZoomLevel).toHaveBeenCalledOnce();
    expect(setZoomLevel).toHaveBeenCalledWith(3);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("does not handle non-plus shortcuts", () => {
    const { win, listener, setZoomLevel } = createWindowMock();

    registerWindowsZoomInShortcut(win);
    listener({ preventDefault: vi.fn() }, {
      type: "keyDown",
      code: "Minus",
      key: "-",
      control: true,
      alt: false,
      meta: false,
      shift: false,
    } as Electron.KeyboardInputEvent);

    expect(setZoomLevel).not.toHaveBeenCalled();
  });

  it("does not register outside Windows", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const { win, on } = createWindowMock();

    registerWindowsZoomInShortcut(win);

    expect(on).not.toHaveBeenCalled();
  });
});

function createWindowMock() {
  let listener: (
    event: { preventDefault: () => void },
    input: Electron.KeyboardInputEvent,
  ) => void;
  const on = vi.fn(
    (
      _eventName: string,
      callback: (
        event: { preventDefault: () => void },
        input: Electron.KeyboardInputEvent,
      ) => void,
    ) => {
      listener = callback;
    },
  );
  const getZoomLevel = vi.fn(() => 2);
  const setZoomLevel = vi.fn();

  return {
    win: {
      webContents: { on, getZoomLevel, setZoomLevel },
    } as unknown as BrowserWindow,
    on,
    listener: (
      event: { preventDefault: () => void },
      input: Electron.KeyboardInputEvent,
    ) => listener(event, input),
    getZoomLevel,
    setZoomLevel,
  };
}
