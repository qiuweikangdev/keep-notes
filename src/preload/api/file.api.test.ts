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

  it("invokes the save-image-attachment channel", async () => {
    const { fileApi } = await import("./file.api");
    const payload = {
      workspaceRootPath: "/workspace/notes",
      markdownFilePath: "/workspace/notes/daily.md",
      fileName: "image.png",
      mimeType: "image/png",
      data: Uint8Array.from([1, 2, 3]).buffer,
    };

    await fileApi.saveImageAttachment(payload);

    expect(invoke).toHaveBeenCalledWith("file:save-image-attachment", payload);
  });

  it("invokes the open-in-new-window channel", async () => {
    const { fileApi } = await import("./file.api");

    await fileApi.openInNewWindow("/workspace/notes/daily.md");

    expect(invoke).toHaveBeenCalledWith(
      "file:open-in-new-window",
      "/workspace/notes/daily.md",
    );
  });

  it("invokes the list-external-open-apps channel", async () => {
    const { fileApi } = await import("./file.api");

    await fileApi.listExternalOpenApps();

    expect(invoke).toHaveBeenCalledWith("file:list-external-open-apps");
  });

  it("invokes the open-with-external-app channel", async () => {
    const { fileApi } = await import("./file.api");

    await fileApi.openWithExternalApp("/workspace/notes/daily.md", "vscode");

    expect(invoke).toHaveBeenCalledWith(
      "file:open-with-external-app",
      "/workspace/notes/daily.md",
      "vscode",
    );
  });
});
