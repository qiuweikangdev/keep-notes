import { beforeEach, describe, expect, it, vi } from "vitest";

const listeners = new Map<string, (event: unknown, payload: unknown) => void>();

vi.mock("electron", () => ({
  ipcRenderer: {
    send: vi.fn(),
    invoke: vi.fn(),
    on: vi.fn(
      (
        channel: string,
        handler: (event: unknown, payload: unknown) => void,
      ) => {
        listeners.set(channel, handler);
      },
    ),
    removeListener: vi.fn(),
  },
}));

describe("windowApi", () => {
  beforeEach(() => {
    listeners.clear();
  });

  it("buffers the initial window target until the renderer consumes it", async () => {
    const { windowApi } = await import("./window.api");

    listeners.get("window:open-target")?.(null, {
      rootPath: "/workspace/notes",
      filePath: "/workspace/notes/daily.md",
    });

    expect(windowApi.consumeWindowOpenTarget()).toEqual({
      rootPath: "/workspace/notes",
      filePath: "/workspace/notes/daily.md",
    });
    expect(windowApi.consumeWindowOpenTarget()).toBeNull();
  });

  it("proxies zoom operations through the window IPC channels", async () => {
    const { ipcRenderer } = await import("electron");
    const { windowApi } = await import("./window.api");

    await windowApi.getZoomFactor();
    await windowApi.setZoomFactor(1.2);

    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(
      1,
      "window:get-zoom-factor",
    );
    expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(
      2,
      "window:set-zoom-factor",
      1.2,
    );
  });
});
