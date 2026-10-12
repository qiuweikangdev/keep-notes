import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DragResizeProvider } from "@/components/drag-resize-provider";
import { useImagePreviewStore } from "../store/image-preview.store";
import { ImagePreviewDialog } from "./image-preview-dialog";

afterEach(() => {
  cleanup();
  useImagePreviewStore.getState().close();
});

describe("ImagePreviewDialog", () => {
  it("ignores an outdated image load after switching files and closes the preview", async () => {
    let resolveFirst: ((value: string) => void) | undefined;
    const loadImageAsDataUrl = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce("data:image/svg+xml;base64,c2Vjb25k");
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { loadImageAsDataUrl },
    });
    useImagePreviewStore.getState().open("/notes/first.png");
    render(
      <DragResizeProvider>
        <ImagePreviewDialog />
      </DragResizeProvider>,
    );
    expect(screen.getByText("正在加载图片…")).toBeInTheDocument();
    act(() => useImagePreviewStore.getState().open("/notes/second.svg"));
    const second = await screen.findByAltText("second.svg");
    await act(async () => resolveFirst?.("data:image/png;base64,Zmlyc3Q="));
    expect(second).toHaveAttribute("src", "data:image/svg+xml;base64,c2Vjb25k");
    expect(screen.queryByAltText("first.png")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    expect(useImagePreviewStore.getState().filePath).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reports a missing or unsupported image instead of rendering a broken file URL", async () => {
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: { loadImageAsDataUrl: vi.fn().mockResolvedValue(null) },
    });
    useImagePreviewStore.getState().open("/notes/missing.png");
    render(
      <DragResizeProvider>
        <ImagePreviewDialog />
      </DragResizeProvider>,
    );
    expect(
      await screen.findByText("图片无法加载，请检查文件是否存在或超过 20 MB"),
    ).toBeVisible();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
