import { beforeEach, describe, expect, it, vi } from "vitest";

const listeners = new Map<string, (event: unknown, payload: unknown) => void>();

vi.mock("electron", () => ({
  ipcRenderer: {
    send: vi.fn(),
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
});
