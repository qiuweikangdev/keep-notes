import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../../shared/constants";
import { quickEditorApi } from "./quick-editor.api";

const ipcRendererMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn(),
}));

vi.mock("electron", () => ({ ipcRenderer: ipcRendererMocks }));

describe("quick editor preload collapse API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invokes the focused collapse channels", async () => {
    ipcRendererMocks.invoke
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(quickEditorApi.getQuickEditorCollapsed()).resolves.toBe(false);
    await expect(
      quickEditorApi.setQuickEditorCollapsed(true, false),
    ).resolves.toBe(true);

    expect(ipcRendererMocks.invoke).toHaveBeenNthCalledWith(
      1,
      IPC_CHANNELS.QUICK_EDITOR.GET_COLLAPSED,
    );
    expect(ipcRendererMocks.invoke).toHaveBeenNthCalledWith(
      2,
      IPC_CHANNELS.QUICK_EDITOR.SET_COLLAPSED,
      true,
      false,
    );
  });

  it("subscribes to native collapsed-state changes", () => {
    const callback = vi.fn();
    const unsubscribe = quickEditorApi.onQuickEditorCollapsedChanged(callback);
    const listener = ipcRendererMocks.on.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.QUICK_EDITOR.COLLAPSED_CHANGED,
    )?.[1];

    expect(listener).toBeTypeOf("function");
    listener?.({}, false);
    expect(callback).toHaveBeenCalledWith(false);

    unsubscribe();
    expect(ipcRendererMocks.removeListener).toHaveBeenCalledWith(
      IPC_CHANNELS.QUICK_EDITOR.COLLAPSED_CHANGED,
      listener,
    );
  });
});
