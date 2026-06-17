import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("electron", () => ({
  ipcRenderer: {
    invoke,
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

describe("fileApi", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("invokes the copy-path channel", async () => {
    const { fileApi } = await import("./file.api");

    await fileApi.copyPath("/workspace/notes/daily.md");

    expect(invoke).toHaveBeenCalledWith(
      "file:copy-path",
      "/workspace/notes/daily.md",
    );
  });

  it("invokes the open-in-new-window channel", async () => {
    const { fileApi } = await import("./file.api");

    await fileApi.openInNewWindow("/workspace/notes/daily.md");

    expect(invoke).toHaveBeenCalledWith(
      "file:open-in-new-window",
      "/workspace/notes/daily.md",
    );
  });
});
