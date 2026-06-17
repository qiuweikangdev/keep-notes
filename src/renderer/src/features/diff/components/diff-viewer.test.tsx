import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiffViewer } from "./diff-viewer";

const fileDiffSpy = vi.fn();

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
  parseDiffFromFile: vi.fn(() => ({
    hunks: [
      {
        additionLines: 2,
        deletionLines: 1,
      },
    ],
  })),
}));

describe("DiffViewer", () => {
  it("passes dark-theme surface overrides into pierre diff unsafe CSS", () => {
    render(
      <DiffViewer
        oldContent={"# old\n"}
        newContent={"# new\n"}
        fileName="readme.md"
      />,
    );

    expect(fileDiffSpy).toHaveBeenCalledTimes(1);

    const props = fileDiffSpy.mock.calls[0]?.[0] as {
      options?: { unsafeCSS?: string };
    };
    const unsafeCSS = props.options?.unsafeCSS ?? "";

    expect(unsafeCSS).toContain(":host");
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
