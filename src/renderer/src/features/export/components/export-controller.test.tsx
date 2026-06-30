import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportController } from "./export-controller";

describe("ExportController", () => {
  beforeEach(() => {
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        exportFile: vi.fn(async () => ({
          directoryPath: "/Users/test/Downloads",
          filePaths: ["/Users/test/Downloads/daily.pdf"],
        })),
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("runs export when the file tree dispatches an export request", async () => {
    const onExportSuccess = vi.fn();
    window.addEventListener("keep-notes:export-success", onExportSuccess);
    render(<ExportController />);

    window.dispatchEvent(
      new CustomEvent("keep-notes:export-file", {
        detail: { filePath: "/Users/test/notes/daily.md" },
      }),
    );

    await waitFor(() => {
      expect(window.electronAPI.exportFile).toHaveBeenCalledWith(
        "/Users/test/notes/daily.md",
      );
    });
    expect(onExportSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          directoryPath: "/Users/test/Downloads",
          fileName: "daily.pdf",
        },
      }),
    );

    window.removeEventListener("keep-notes:export-success", onExportSuccess);
  });
});
