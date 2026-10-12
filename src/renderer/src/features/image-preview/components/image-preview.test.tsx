import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ImagePreview } from "./image-preview";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("fits large images, zooms at original resolution and adapts to viewport resizing", () => {
  const width = vi
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockReturnValue(640);
  const height = vi
    .spyOn(HTMLElement.prototype, "clientHeight", "get")
    .mockReturnValue(360);
  let resize: (() => void) | undefined;
  vi.stubGlobal(
    "ResizeObserver",
    vi.fn().mockImplementation((callback: () => void) => {
      resize = callback;
      return { observe: vi.fn(), disconnect: vi.fn() };
    }),
  );
  const { getByAltText, getByRole } = render(
    <ImagePreview source="data:image/png;base64,dGVzdA==" label="photo.png" />,
  );
  const image = getByAltText("photo.png");
  Object.defineProperties(image, {
    naturalWidth: { value: 1200 },
    naturalHeight: { value: 800 },
  });
  fireEvent.load(image);
  expect(image).toHaveStyle({ width: "468px", height: "312px" });
  fireEvent.click(getByRole("button", { name: "放大图片" }));
  expect(image).toHaveStyle({ width: "600px", height: "400px" });
  fireEvent.doubleClick(image);
  expect(image).toHaveStyle({ width: "468px", height: "312px" });
  fireEvent.doubleClick(image);
  expect(image).toHaveStyle({ width: "1200px", height: "800px" });
  fireEvent.doubleClick(image);
  width.mockReturnValue(320);
  height.mockReturnValue(280);
  act(() => resize?.());
  expect(image).toHaveStyle({ width: "272px" });
  fireEvent.doubleClick(image);
  expect(image).toHaveStyle({ width: "1200px" });
  fireEvent.doubleClick(image);
  expect(image).toHaveStyle({ width: "272px" });
});

it("clears the previous error and zoom when the image source changes", () => {
  const { getByAltText, getByRole, queryByRole, rerender } = render(
    <ImagePreview source="data:image/png;base64,b2xk" label="old.png" />,
  );
  fireEvent.error(getByAltText("old.png"));
  expect(getByRole("alert")).toHaveTextContent("图片无法预览");
  rerender(
    <ImagePreview source="data:image/png;base64,bmV3" label="new.png" />,
  );
  expect(queryByRole("alert")).not.toBeInTheDocument();
  expect(getByAltText("new.png")).toHaveAttribute(
    "src",
    "data:image/png;base64,bmV3",
  );
});
