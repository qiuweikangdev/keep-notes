import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  it("recursively extracts styled text inside heading links", () => {
    expect(
      extractQuickEditorOutlineHeadings([
        {
          id: "heading-link",
          type: "heading",
          props: { level: 2 },
          content: [
            { type: "text", text: "Read " },
            {
              type: "link",
              href: "https://example.com",
              content: [
                { type: "text", text: "linked", styles: { bold: true } },
                { type: "text", text: " notes", styles: { italic: true } },
              ],
            },
          ],
        },
      ]),
    ).toEqual([{ id: "heading-link", level: 2, text: "Read linked notes" }]);
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
    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

  it("keeps long active headings contained and keyboard focus visible", () => {
    const css = readFileSync(
      join(
        process.cwd(),
        "src/renderer/src/features/editor/components/quick-editor-window.css",
      ),
      "utf8",
    );

    expect(css).toMatch(
      /\.quick-editor-outline__list\s*\{[^}]*overflow-x:\s*hidden;/s,
    );
    expect(css).toMatch(
      /\.quick-editor-outline__item\s*\{[^}]*min-width:\s*0;/s,
    );
    expect(css).toMatch(
      /\.quick-editor-outline__item\s+span\s*\{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
    );
    expect(css).toMatch(
      /\.quick-editor-outline__item:focus-visible\s*\{[^}]*(?:outline|box-shadow):/s,
    );
  });
});
