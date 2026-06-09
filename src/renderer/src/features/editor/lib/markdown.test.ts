import { describe, expect, it } from "vitest";

import {
  ensureEditableBlocks,
  markdownEquals,
  parseMarkdown,
  serializeMarkdown,
} from "./markdown";

describe("Markdown source preservation", () => {
  it("passes the original source to the parser without normalization", async () => {
    const source = "# Title  \r\n\r\n* item\t \r\n\r\n";
    let received = "";

    await parseMarkdown(
      {
        tryParseMarkdownToBlocks: (markdown) => {
          received = markdown;
          return [];
        },
      },
      source,
    );

    expect(received).toBe(source);
  });

  it("returns the serializer output without rewriting whitespace", async () => {
    const serialized = "# Title  \r\n\r\n* item\t \r\n";

    await expect(
      serializeMarkdown(
        {
          blocksToMarkdownLossy: () => serialized,
        },
        [],
      ),
    ).resolves.toBe(serialized);
  });
});

describe("markdownEquals", () => {
  it("does not hide source formatting differences", () => {
    expect(markdownEquals("* item\r\n", "- item\n")).toBe(false);
    expect(markdownEquals("# Title  \n", "# Title\n")).toBe(false);
    expect(markdownEquals("# Title\n", "# Title\n")).toBe(true);
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
