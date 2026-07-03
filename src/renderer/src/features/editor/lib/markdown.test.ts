import { describe, expect, it } from "vitest";

import {
  ensureEditableBlocks,
  markdownEquals,
  parseMarkdown,
  preserveMarkdownSource,
  resolveEditorImageUrl,
  serializeMarkdown,
} from "./markdown";

describe("Markdown source preservation", () => {
  it("normalizes only the parser input while retaining source whitespace", async () => {
    const source = "\uFEFF# Title  \r\n\r\n* item\t \r\n\r\n";
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

    expect(received).toBe("# Title  \n\n* item\t \n\n");
    expect(source).toBe("\uFEFF# Title  \r\n\r\n* item\t \r\n\r\n");
  });

  it("hydrates parsed image block URLs for editor rendering", async () => {
    await expect(
      parseMarkdown(
        {
          tryParseMarkdownToBlocks: () => [
            {
              type: "image",
              props: {
                url: "images/demo.webp",
              },
            },
          ],
        },
        "![img](images/demo.webp)",
        {
          markdownFilePath: "/Users/me/notes/a.md",
          resolveImageUrl: async (url) => `data:${url}`,
        },
      ),
    ).resolves.toEqual([
      {
        type: "image",
        props: {
          url: "data:file:///Users/me/notes/images/demo.webp",
        },
      },
    ]);
  });

  it("promotes markdown image syntax paragraphs to image blocks", async () => {
    const sourceUrl =
      "https://file-cdn.example.com/image.jpg?image_process=resize,w_702/quality,Q_70/format,webp/w_1920/sharpen,60";

    await expect(
      parseMarkdown(
        {
          tryParseMarkdownToBlocks: () => [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "!",
                  styles: {},
                },
                {
                  type: "link",
                  href: sourceUrl,
                  content: [
                    {
                      type: "text",
                      text: "image-20260702141804557",
                      styles: {},
                    },
                  ],
                },
              ],
            },
          ],
        },
        `![image-20260702141804557](${sourceUrl})`,
        {
          resolveImageUrl: async (url) => `data:${url}`,
        },
      ),
    ).resolves.toEqual([
      {
        type: "image",
        props: {
          name: "image-20260702141804557",
          url: `data:${sourceUrl}`,
        },
      },
    ]);
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

describe("preserveMarkdownSource", () => {
  it("transfers a small rich-text edit without adopting serializer spacing", () => {
    const source = [
      "# AI SDK Core",
      "",
      "- 文本生成",
      "- 结构化数据生成",
      "- 工具调用",
      "",
    ].join("\n");
    const baseline = [
      "# AI SDK Core",
      "",
      "- 文本生成",
      "",
      "- 结构化数据生成",
      "",
      "- 工具调用",
      "",
    ].join("\n");
    const edited = baseline.replace("文本生成", "文本生成1");

    expect(preserveMarkdownSource(source, baseline, edited)).toBe(
      source.replace("文本生成", "文本生成1"),
    );
  });

  it("preserves line endings, list markers, and trailing spaces", () => {
    const source = "# Title  \r\n\r\n* alpha  \r\n* beta\r\n";
    const baseline = "# Title\n\n- alpha\n\n- beta\n";
    const edited = "# Title\n\n- alpha1\n\n- beta\n";

    expect(preserveMarkdownSource(source, baseline, edited)).toBe(
      "# Title  \r\n\r\n* alpha1  \r\n* beta\r\n",
    );
  });

  it("returns the exact source when the rich document did not change", () => {
    const source = "* item\r\n";
    const baseline = "- item\n";

    expect(preserveMarkdownSource(source, baseline, baseline)).toBe(source);
  });

  it("maps an edit to the correct repeated line", () => {
    const source = "- item\n- item\n";
    const baseline = "- item\n\n- item\n";
    const edited = "- item\n\n- item2\n";

    expect(preserveMarkdownSource(source, baseline, edited)).toBe(
      "- item\n- item2\n",
    );
  });

  it("preserves formatting across consecutive rich-text edits", () => {
    const source = "* alpha\r\n* beta\r\n";
    const baseline = "- alpha\n\n- beta\n";
    const firstEdited = "- alpha1\n\n- beta\n";
    const firstSource = preserveMarkdownSource(source, baseline, firstEdited);
    const secondEdited = "- alpha1\n\n- beta2\n";

    expect(preserveMarkdownSource(firstSource, firstEdited, secondEdited)).toBe(
      "* alpha1\r\n* beta2\r\n",
    );
  });

  it("removes a rich-text block without rewriting neighboring spacing", () => {
    const source = "- alpha\n- beta\n";
    const baseline = "- alpha\n\n- beta\n";
    const edited = "- alpha\n";

    expect(preserveMarkdownSource(source, baseline, edited)).toBe("- alpha\n");
  });

  it("preserves fenced code language and content when editing surrounding text", () => {
    const source = [
      "Before",
      "",
      "```ts",
      "const value = 1;",
      "```",
      "",
      "After",
      "",
    ].join("\n");
    const baseline = source;
    const edited = source.replace("Before", "Before edit");

    expect(preserveMarkdownSource(source, baseline, edited)).toBe(
      source.replace("Before", "Before edit"),
    );
  });

  it("skips character-level source preservation for large documents", () => {
    const text = "a".repeat(9_000);
    const source = `* ${text}\r\n`;
    const baseline = `- ${text}\n`;
    const edited = `- ${text}b\n`;

    expect(preserveMarkdownSource(source, baseline, edited)).toBe(
      `- ${text}b\r\n`,
    );
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

describe("resolveEditorImageUrl", () => {
  it("keeps absolute and data URLs unchanged", () => {
    expect(
      resolveEditorImageUrl("https://example.com/a.png", "/notes/a.md"),
    ).toBe("https://example.com/a.png");
    expect(
      resolveEditorImageUrl("data:image/png;base64,abc", "/notes/a.md"),
    ).toBe("data:image/png;base64,abc");
  });

  it("resolves relative image URLs against the markdown file directory", () => {
    expect(
      resolveEditorImageUrl("images/demo image.png", "/Users/me/notes/a.md"),
    ).toBe("file:///Users/me/notes/images/demo%20image.png");
  });

  it("converts absolute local paths to file URLs", () => {
    expect(
      resolveEditorImageUrl("/Users/me/Pictures/a.png", "/notes/a.md"),
    ).toBe("file:///Users/me/Pictures/a.png");
  });

  it("leaves relative URLs unchanged when the markdown file path is unknown", () => {
    expect(resolveEditorImageUrl("images/a.png", null)).toBe("images/a.png");
  });
});
