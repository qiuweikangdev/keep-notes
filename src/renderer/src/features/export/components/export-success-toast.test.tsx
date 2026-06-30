import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportSuccessToast } from "./export-success-toast";

describe("ExportSuccessToast", () => {
  beforeEach(() => {
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        openInExplorer: vi.fn(async () => true),
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a success toast and opens the exported directory from the icon action", async () => {
    render(<ExportSuccessToast />);

    window.dispatchEvent(
      new CustomEvent("keep-notes:export-success", {
        detail: {
          directoryPath: "/Users/test/Downloads",
          fileName: "daily.pdf",
        },
      }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent("导出成功");
    expect(screen.getByText("daily.pdf")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "打开导出目录" }));

    await waitFor(() => {
      expect(window.electronAPI.openInExplorer).toHaveBeenCalledWith(
        "/Users/test/Downloads",
      );
    });
  });
});
