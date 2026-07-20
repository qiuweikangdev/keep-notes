import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiffViewer } from "./diff-viewer";

const fileDiffSpy = vi.hoisted(() => vi.fn());
const parseDiffFromFileSpy = vi.hoisted(() =>
  vi.fn(() => ({
    hunks: [
      {
        additionLines: 2,
        deletionLines: 1,
      },
    ],
  })),
);

vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({
    theme: "dark",
    isDark: true,
  }),
}));

vi.mock("@pierre/diffs/react", () => ({
  FileDiff: (props: unknown) => {
    fileDiffSpy(props);
    return <div data-testid="mock-file-diff" />;
  },
}));

vi.mock("@pierre/diffs", () => ({
  parseDiffFromFile: parseDiffFromFileSpy,
}));

describe("DiffViewer", () => {
  beforeEach(() => {
    fileDiffSpy.mockClear();
    parseDiffFromFileSpy.mockClear();
  });

  it("does not render a diff when content only differs by line endings", () => {
    render(
      <DiffViewer
        oldContent={"# same\n- item\n"}
        newContent={"# same\r\n- item\r\n"}
        fileName="readme.md"
      />,
    );

    expect(parseDiffFromFileSpy).not.toHaveBeenCalled();
    expect(fileDiffSpy).not.toHaveBeenCalled();
  });

  it("reserves space beside the scrollbar when shown in a resizable dialog", () => {
    const { container } = render(
      <DiffViewer
        oldContent={"# same\n"}
        newContent={"# same\n"}
        fileName="readme.md"
        reserveDialogResizeHandleSpace
      />,
    );

    expect(container.querySelector(".diff-viewer__body")).toHaveClass(
      "mb-3",
      "mr-3",
    );
  });

  it("passes dark-theme surface overrides into pierre diff unsafe CSS", async () => {
    render(
      <DiffViewer
        oldContent={"# old\n"}
        newContent={"# new\n"}
        fileName="readme.md"
      />,
    );

    await waitFor(() => {
      expect(fileDiffSpy).toHaveBeenCalledTimes(1);
    });

    const props = fileDiffSpy.mock.calls[0]?.[0] as {
      options?: { unsafeCSS?: string };
    };
    const unsafeCSS = props.options?.unsafeCSS ?? "";

    expect(unsafeCSS).toContain(":host");
    expect(unsafeCSS).toContain(
      ":host, [data-code], [data-gutter], [data-content], [data-content-buffer] {",
    );
    expect(unsafeCSS).toContain(
      "background-color: var(--bg-primary) !important;",
    );
    expect(unsafeCSS).toContain("--diffs-bg: var(--bg-primary) !important;");
    expect(unsafeCSS).toContain(
      "--diffs-bg-context: var(--bg-primary) !important;",
    );
    expect(unsafeCSS).toContain(
      "--diffs-bg-separator: var(--bg-secondary) !important;",
    );
    expect(unsafeCSS).toContain("--diffs-line-bg:");
    expect(unsafeCSS).toContain(
      '[data-line-type="change-addition"][data-line]',
    );
    expect(unsafeCSS).toContain(
      '[data-line-type="change-deletion"][data-line]',
    );
    expect(unsafeCSS).toContain(
      '[data-line-type="change-addition"] [data-diff-span]',
    );
    expect(unsafeCSS).toContain(
      '[data-line-type="change-deletion"] [data-diff-span]',
    );
  });
});
