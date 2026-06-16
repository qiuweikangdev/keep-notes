import { describe, expect, it } from "vitest";

import { collectEditorFindRanges } from "./editor-find-highlights";

describe("editor-find-highlights", () => {
  it("collects ranges from editor text and ignores the find widget", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <p>Note one</p>
      <div data-editor-find-ignore>Note widget</div>
      <p>note two</p>
    `;

    const ranges = collectEditorFindRanges(root, "note", {});

    expect(ranges).toHaveLength(2);
    expect(ranges.map((range) => range.toString())).toEqual(["Note", "note"]);
  });
});
