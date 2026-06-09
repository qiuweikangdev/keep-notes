import { describe, expect, it } from "vitest";

import {
  ensureEditableBlocks,
  markdownEquals,
  normalizeMarkdown,
  normalizeMarkdownListMarkers,
} from "./markdown";

describe("normalizeMarkdownListMarkers", () => {
  it("normalizes unordered list markers without changing inline asterisks", () => {
    expect(
      normalizeMarkdownListMarkers("* one\n  * nested\ntext * value"),
    ).toBe("- one\n  - nested\ntext * value");
  });
});

describe("normalizeMarkdown", () => {
  it("normalizes line endings and trailing whitespace", () => {
    expect(normalizeMarkdown("  code  \r\ntext\t \r\n")).toBe("  code\ntext\n");
  });

  it("keeps a single final newline for non-empty content", () => {
    expect(normalizeMarkdown("hello\n\n\n")).toBe("hello\n");
    expect(normalizeMarkdown("")).toBe("");
  });
});

describe("markdownEquals", () => {
  it("compares semantically normalized Markdown", () => {
    expect(markdownEquals("* item\r\n", "- item\n")).toBe(true);
  });
});

describe("ensureEditableBlocks", () => {
  it("creates one editable block for an empty document", () => {
    expect(ensureEditableBlocks([], () => "paragraph")).toEqual(["paragraph"]);
  });

  it("preserves parsed blocks when content exists", () => {
    expect(ensureEditableBlocks(["heading"], () => "paragraph")).toEqual([
      "heading",
    ]);
  });
});
