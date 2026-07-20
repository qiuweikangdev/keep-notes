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

  it("forwards editor requests to the prewarmed renderer", () => {
    const callback = vi.fn();
    const unsubscribe = reminderApi.onReminderEditorRequested(callback);
    const handler = ipcRendererMocks.on.mock.calls[0]?.[1];
    const request = { requestId: 7, reminderId: "reminder-1" };

    handler?.({}, request);
    unsubscribe();

    expect(callback).toHaveBeenCalledWith(request);
    expect(ipcRendererMocks.removeListener).toHaveBeenCalledWith(
      IPC_CHANNELS.REMINDER.EDITOR_REQUESTED,
      handler,
    );
  });

  it("reports editor renderer and request readiness to the main process", () => {
    reminderApi.notifyReminderEditorRendererReady();
    reminderApi.notifyReminderEditorRequestApplied(7);

    expect(ipcRendererMocks.send).toHaveBeenNthCalledWith(
      1,
      IPC_CHANNELS.REMINDER.EDITOR_RENDERER_READY,
    );
    expect(ipcRendererMocks.send).toHaveBeenNthCalledWith(
      2,
      IPC_CHANNELS.REMINDER.EDITOR_REQUEST_APPLIED,
      7,
    );
  });
});
