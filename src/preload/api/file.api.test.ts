import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const getPathForFile = vi.fn();

vi.mock("electron", () => ({
  ipcRenderer: {
    invoke,
    on: vi.fn(),
    removeListener: vi.fn(),
  },
  webUtils: { getPathForFile },
}));

describe("fileApi", () => {
  beforeEach(() => {
    invoke.mockReset();
    getPathForFile.mockReset();
  });

  it("gets a dropped file path through Electron webUtils", async () => {
    const { fileApi } = await import("./file.api");
    const file = new File(["# Note"], "note.md");
    getPathForFile.mockReturnValue("/workspace/notes/note.md");

    expect(fileApi.getPathForFile(file)).toBe("/workspace/notes/note.md");
    expect(getPathForFile).toHaveBeenCalledWith(file);
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

  it("invokes the untitled-close confirmation channel", async () => {
    const { fileApi } = await import("./file.api");

    await fileApi.confirmCloseUntitled("会议记录");

    expect(invoke).toHaveBeenCalledWith(
      "file:confirm-close-untitled",
      "会议记录",
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
