import { afterEach, describe, expect, it, vi } from "vitest";

import {
  collectEditorFindRanges,
  renderEditorFindHighlightFallback,
} from "./editor-find-highlights";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("editor-find-highlights", () => {
  it("collects ranges from editor text and ignores the find widget", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <p>Note one</p>
      <div data-editor-find-ignore>Note widget</div>
      <div aria-hidden="true">Note hidden preview</div>
      <p>note two</p>
    `;

    const ranges = collectEditorFindRanges(root, "note", {});

    expect(ranges).toHaveLength(2);
    expect(ranges.map((range) => range.toString())).toEqual(["Note", "note"]);
  });

  it("ignores CodeMirror line-number gutters", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="cm-gutters"><div class="cm-gutterElement">1</div></div>
      <div class="cm-content">const value = 1</div>
    `;

    const ranges = collectEditorFindRanges(root, "1", {});

    expect(ranges).toHaveLength(1);
    expect(ranges[0]?.toString()).toBe("1");
  });

  it("renders a fallback overlay when native custom highlights are unavailable", () => {
    const root = document.createElement("div");
    root.innerHTML = "<p>Note one</p>";
    document.body.append(root);
    const [range] = collectEditorFindRanges(root, "note", {});
    expect(range).toBeDefined();
    if (!range) return;

    Object.defineProperty(range, "getClientRects", {
      configurable: true,
      value: () => [new DOMRect(32, 48, 28, 16)],
    });

    const clearFallback = renderEditorFindHighlightFallback(root, [range], 0);
    const marker = document.body.querySelector<HTMLElement>(
      "[data-editor-find-highlight]",
    );

    expect(marker).toHaveStyle({
      height: "12px",
      left: "31px",
      top: "50px",
      width: "30px",
    });
    expect(marker).toHaveAttribute("data-editor-find-highlight-active", "true");

    clearFallback();
    expect(
      document.body.querySelector("[data-editor-find-highlight-overlay]"),
    ).toBeNull();
  });
});
