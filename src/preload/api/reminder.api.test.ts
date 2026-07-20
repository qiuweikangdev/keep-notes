import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../../shared/constants";
import { reminderApi } from "./reminder.api";

const ipcRendererMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn(),
}));

vi.mock("electron", () => ({ ipcRenderer: ipcRendererMocks }));

describe("reminder window theme preload API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("publishes the application theme to the main process", () => {
    reminderApi.setReminderWindowTheme("light");

    expect(ipcRendererMocks.send).toHaveBeenCalledWith(
      IPC_CHANNELS.REMINDER.SET_WINDOW_THEME,
      "light",
    );
  });

  it("forwards reminder window theme changes and removes the listener", () => {
    const callback = vi.fn();
    const unsubscribe = reminderApi.onReminderWindowThemeChanged(callback);
    const handler = ipcRendererMocks.on.mock.calls[0]?.[1];

    handler?.({}, "dark");
    unsubscribe();

    expect(callback).toHaveBeenCalledWith("dark");
    expect(ipcRendererMocks.removeListener).toHaveBeenCalledWith(
      IPC_CHANNELS.REMINDER.WINDOW_THEME_CHANGED,
      handler,
    );
  });
});
