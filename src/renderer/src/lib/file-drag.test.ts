import { afterEach, describe, expect, it, vi } from "vitest";
import { getDraggedFilePath, KEEP_NOTES_FILE_DRAG_TYPE } from "./file-drag";

describe("file drag paths", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the internal file-tree path", () => {
    expect(
      getDraggedFilePath({
        files: [],
        getData: (type) =>
          type === KEEP_NOTES_FILE_DRAG_TYPE ? "/notes/internal.md" : "",
      }),
    ).toBe("/notes/internal.md");
  });

  it("resolves a system file through the preload API", () => {
    const file = new File(["# External"], "external.md");
    const getPathForFile = vi.fn(() => "/outside/external.md");
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { getPathForFile },
    });

    expect(getDraggedFilePath({ files: [file], getData: () => "" })).toBe(
      "/outside/external.md",
    );
    expect(getPathForFile).toHaveBeenCalledWith(file);
  });
});
