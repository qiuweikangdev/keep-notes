import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  extractQuickEditorOutlineHeadings,
  QuickEditorOutline,
} from "./quick-editor-outline";

describe("quick editor outline", () => {
  it("extracts nested headings in document order", () => {
    expect(
      extractQuickEditorOutlineHeadings([
        {
          id: "heading-1",
          type: "heading",
          props: { level: 1 },
          content: [{ type: "text", text: "Overview" }],
          children: [
            {
              id: "heading-2",
              type: "heading",
              props: { level: 2 },
              content: [{ type: "text", text: "Details" }],
            },
          ],
        },
      ]),
    ).toEqual([
      { id: "heading-1", level: 1, text: "Overview" },
      { id: "heading-2", level: 2, text: "Details" },
    ]);
  });

  it("renders an empty state and forwards heading selection", () => {
    const { rerender } = render(
      <QuickEditorOutline
        headings={[]}
        activeHeadingId={null}
        onHeadingSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("暂无标题")).toBeInTheDocument();

    const onHeadingSelect = vi.fn();
    rerender(
      <QuickEditorOutline
        headings={[{ id: "heading-1", level: 1, text: "Overview" }]}
        activeHeadingId="heading-1"
        onHeadingSelect={onHeadingSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(onHeadingSelect).toHaveBeenCalledWith("heading-1");
  });
});
