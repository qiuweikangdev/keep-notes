import { describe, expect, it, vi } from "vitest";

import {
  ensureEditableBlocks,
  markdownEquals,
  parseMarkdown,
  preserveMarkdownSource,
  repairMarkdownSourceBeforeParse,
  resolveEditorImageUrl,
  serializeMarkdown,
} from "./markdown";

describe("Markdown source preservation", () => {
  type TestBlock = {
    content?: string;
    children?: TestBlock[];
    type: string;
  };

  it("serializes multiline markup with source line breaks", async () => {
    const exported = `<GoogleAdsenseBanner\\
  :ad-slot="adSlot"\\
  ad-format="horizontal"\\
/>`;

    await expect(
      serializeMarkdown<TestBlock>({ blocksToMarkdownLossy: () => exported }, [
        { type: "paragraph" },
      ]),
    ).resolves.toBe(exported.replaceAll("\\\n", "\n"));
  });

  it("serializes multiline CSS source without hard-break escapes", async () => {
    const exported = `:deep(.home-adsense-banner--pc) {\\
  padding: 24px 0px;\\
}`;

    await expect(
      serializeMarkdown<TestBlock>({ blocksToMarkdownLossy: () => exported }, [
        { type: "paragraph" },
      ]),
    ).resolves.toBe(exported.replaceAll("\\\n", "\n"));
  });

  it("removes the spacer line emitted after markup hard breaks", async () => {
    const exported = `<GoogleAdsenseBanner

  :ad-slot="adSlot"

  ad-format="horizontal"

/>`;

    await expect(
      serializeMarkdown<TestBlock>({ blocksToMarkdownLossy: () => exported }, [
        { type: "paragraph" },
      ]),
    ).resolves.toBe(`<GoogleAdsenseBanner
  :ad-slot="adSlot"
  ad-format="horizontal"
/>`);
  });

  it("preserves user-authored blank lines inside markup", async () => {
    const exported = `<section>


  <p>First</p>

  <p>Second</p>

</section>`;

    await expect(
      serializeMarkdown<TestBlock>({ blocksToMarkdownLossy: () => exported }, [
        { type: "paragraph" },
      ]),
    ).resolves.toBe(`<section>

  <p>First</p>
  <p>Second</p>
</section>`);
  });

  it("keeps non-markup hard breaks and fenced code unchanged", async () => {
    const ordinaryText = "First\\\nSecond";
    const fencedCode = "```html\n<Component\\\n/>\n```";

    await expect(
      serializeMarkdown<TestBlock>(
        { blocksToMarkdownLossy: () => ordinaryText },
        [{ type: "paragraph" }],
      ),
    ).resolves.toBe(ordinaryText);
    await expect(
      serializeMarkdown<TestBlock>(
        { blocksToMarkdownLossy: () => fencedCode },
        [{ type: "codeBlock" }],
      ),
    ).resolves.toBe(fencedCode);
  });

  it("removes only serializer-added trailing backslashes from code blocks", async () => {
    const content = [
      '<BookOpenText aria-hidden="true" />',
      '<h1 className="title">Title</h1>',
      "<p>",
      "  Content",
      "</p>",
    ].join("\n");
    const exported = [
      "```javascript",
      '<BookOpenText aria-hidden="true" />\\',
      '<h1 className="title">Title</h1>\\',
      "<p>\\",
      "  Content\\",
      "</p>",
      "```",
      "",
    ].join("\n");

    await expect(
      serializeMarkdown<TestBlock>({ blocksToMarkdownLossy: () => exported }, [
        { type: "codeBlock", content },
      ]),
    ).resolves.toBe(["```javascript", content, "```", ""].join("\n"));
  });

  it("preserves trailing backslashes that belong to code block content", async () => {
    const content = ["const first = one \\", "  + two \\", "  + three;"].join(
      "\n",
    );
    const exported = ["```javascript", content, "```", ""].join("\n");

    await expect(
      serializeMarkdown<TestBlock>({ blocksToMarkdownLossy: () => exported }, [
        { type: "codeBlock", content },
      ]),
    ).resolves.toBe(exported);
  });

  it("escapes markup only in prose before parsing", async () => {
    let received = "";
    const source = [
      "# Intro",
      "",
      '<section class="card">',
      "  <h2>Title</h2>",
      "</section>",
      "",
      "`<InlineTag />`",
      "",
      "<https://example.com>",
      "",
      "```tsx",
      "<CodeTag />",
      "```",
    ].join("\n");

    await parseMarkdown<TestBlock>(
      {
        tryParseMarkdownToBlocks: (markdown) => {
          received = markdown;
          return [];
        },
      },
      source,
    );

    expect(received).not.toContain('<section class="card">');
    expect(received).not.toContain("<h2>Title</h2>");
    expect(received).toContain("`<InlineTag />`");
    expect(received).toContain("<https://example.com>");
    expect(received).toContain("```tsx\n<CodeTag />\n```");
  });

  it("nests quoted markdown list items under their quote after parsing", async () => {
    let received = "";
    const blocks = await parseMarkdown<TestBlock>(
      {
        tryParseMarkdownToBlocks: (markdown) => {
          received = markdown;
          return [
            { type: "quote", content: "Quote text" },
            { type: "bulletListItem", content: "First item" },
            { type: "bulletListItem", content: "Second item" },
          ];
        },
      },
      "> Quote text\n>\n> - First item\n> - Second item\n",
    );

    expect(received).toBe("> Quote text\n\n- First item\n- Second item\n");
    expect(blocks).toEqual([
      {
        type: "quote",
        content: "Quote text",
        children: [
          { type: "bulletListItem", content: "First item" },
          { type: "bulletListItem", content: "Second item" },
        ],
      },
    ]);
  });

  it("restores nested quoted list levels under one empty parent quote", async () => {
    let received = "";
    const blocks = await parseMarkdown<TestBlock>(
      {
        tryParseMarkdownToBlocks: (markdown) => {
          received = markdown;
          return [
            { type: "quote", content: "" },
            { type: "bulletListItem", content: "1" },
            {
              type: "bulletListItem",
              content: "2",
              children: [{ type: "bulletListItem", content: "2" }],
            },
          ];
        },
      },
      "> - 1\n> - 2\n>   - 2\n",
    );

    expect(received).toBe(">\n\n- 1\n- 2\n  - 2\n");
    expect(blocks).toEqual([
      {
        type: "quote",
        content: "",
        children: [
          { type: "bulletListItem", content: "1" },
          {
            type: "bulletListItem",
            content: "2",
            children: [{ type: "bulletListItem", content: "2" }],
          },
        ],
      },
    ]);
  });

  it("serializes quote-owned bullet items as nested quote markdown", async () => {
    const serialize = vi.fn((blocks: TestBlock[]) =>
      blocks[0]?.type === "quote"
        ? "> Quote text\n"
        : "* First item\n* Second item\n",
    );

    await expect(
      serializeMarkdown<TestBlock>({ blocksToMarkdownLossy: serialize }, [
        {
          type: "quote",
          content: "Quote text",
          children: [
            { type: "bulletListItem", content: "First item" },
            { type: "bulletListItem", content: "Second item" },
          ],
        },
      ]),
    ).resolves.toBe("> Quote text\n>\n> - First item\n> - Second item\n");
    expect(serialize).toHaveBeenCalledWith([
      { type: "quote", content: "Quote text", children: [] },
    ]);
  });

  it("omits the empty quote placeholder before a nested child list", async () => {
    const serialize = vi.fn((blocks: TestBlock[]) =>
      blocks[0]?.type === "quote" ? ">\n" : "* 1\n* 2\n  * 2\n",
    );

    await expect(
      serializeMarkdown<TestBlock>({ blocksToMarkdownLossy: serialize }, [
        {
          type: "quote",
          content: "",
          children: [
            { type: "bulletListItem", content: "1" },
            {
              type: "bulletListItem",
              content: "2",
              children: [{ type: "bulletListItem", content: "2" }],
            },
          ],
        },
      ]),
    ).resolves.toBe("> - 1\n> - 2\n>   - 2\n");
  });

  it("restores missing quote prefixes around a preserved child list", () => {
    const source = ">\n\n* 1\n* 2\n  * 2\n";
    const serialized = "> - 1\n> - 2\n>   - 2\n";

    expect(preserveMarkdownSource(source, serialized, serialized)).toBe(
      serialized,
    );
  });

  it("does not pull a serialized outer list into an empty quote", () => {
    const source = ">\n\n* outside\n";
    const serialized = ">\n\n- outside\n";

    expect(preserveMarkdownSource(source, serialized, serialized)).toBe(source);
  });

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

describe("repairMarkdownSourceBeforeParse", () => {
  it("recovers Chinese first-line content joined to a bash fence", () => {
    const source = [
      "核心步骤",
      "",
      "```bash写一个 while True 无限循环",
      "不断从数据库查任务",
      "```",
      "",
    ].join("\n");

    expect(repairMarkdownSourceBeforeParse(source)).toBe(
      [
        "核心步骤",
        "",
        "```bash",
        "写一个 while True 无限循环",
        "不断从数据库查任务",
        "```",
        "",
      ].join("\n"),
    );
  });

  it("canonicalizes a bash alias when recovering joined content", () => {
    expect(
      repairMarkdownSourceBeforeParse(
        "~~~sh echo ready\r\necho next\r\n~~~\r\n",
      ),
    ).toBe("~~~bash\r\necho ready\r\necho next\r\n~~~\r\n");
  });

  it("leaves valid and unsupported fenced-code openings unchanged", () => {
    const source = [
      "```bash",
      "echo ready",
      "```",
      "",
      "```unknownlang joined content",
      "value",
      "```",
      "",
    ].join("\n");

    expect(repairMarkdownSourceBeforeParse(source)).toBe(source);
  });

  it("does not split a supported one-character prefix from a custom language", () => {
    const source = "```customlang joined content\nvalue\n```\n";

    expect(repairMarkdownSourceBeforeParse(source)).toBe(source);
  });

  it("does not guess how to split an existing ASCII fence info string", () => {
    const source = [
      "```texthtml.h5-layout {",
      "  color: red;",
      "}",
      "```",
      "",
    ].join("\n");

    expect(repairMarkdownSourceBeforeParse(source)).toBe(source);
  });

  it("does not repair fence-like text inside an open code block", () => {
    const source = ["````text", "```bash写一个循环", "````", ""].join("\n");

    expect(repairMarkdownSourceBeforeParse(source)).toBe(source);
  });

  it.each(["```not-a-close", "````not-a-close"])(
    "does not treat a fence with trailing text as a closing fence: %s",
    (fenceLikeContent) => {
      const source = [
        "```text",
        fenceLikeContent,
        "```bash写一个循环",
        "```",
        "",
      ].join("\n");

      expect(repairMarkdownSourceBeforeParse(source)).toBe(source);
    },
  );
});

describe("preserveMarkdownSource", () => {
  it("repairs partially joined nested list items from the rich-text baseline", () => {
    const source = [
      "## API",
      "* `invoke()`",
      "  * sync",
      "  * `ainvoke()`  * async",
      "* `stream()`  * stream child",
    ].join("\n");
    const baseline = [
      "## API",
      "",
      "* `invoke()`",
      "",
      "  * sync",
      "",
      "* `ainvoke()`",
      "",
      "  * async",
      "",
      "* `stream()`",
      "",
      "  * stream child",
    ].join("\n");

    expect(preserveMarkdownSource(source, baseline, baseline)).toBe(
      [
        "## API",
        "* `invoke()`",
        "  * sync",
        "* `ainvoke()`",
        "  * async",
        "* `stream()`",
        "  * stream child",
      ].join("\n"),
    );
  });

  it("keeps new nested list items on separate lines with editor indentation", () => {
    const source = [
      "* `invoke()`",
      "  * sync",
      "* `stream()`",
      "  * stream child",
    ].join("\n");
    const baseline = [
      "* `invoke()`",
      "",
      "  * sync",
      "",
      "* `stream()`",
      "",
      "  * stream child",
    ].join("\n");
    const edited = [
      "* `invoke()`",
      "",
      "  * sync",
      "",
      "* `ainvoke()`",
      "",
      "  * async",
      "",
      "* `stream()`",
      "",
      "  * stream child",
    ].join("\n");

    expect(preserveMarkdownSource(source, baseline, edited)).toBe(
      [
        "* `invoke()`",
        "  * sync",
        "* `ainvoke()`",
        "  * async",
        "* `stream()`",
        "  * stream child",
      ].join("\n"),
    );
  });

  it.each(["", "\n", "\r\n"])(
    "uses multiline markup serialization directly for a blank source",
    (source) => {
      const serialized = `<GoogleAdsenseBanner
  :ad-slot="googleAdsenseConfig.comment.mb.slot"
  ad-format="horizontal"
/>
`;

      expect(preserveMarkdownSource(source, "\n", serialized)).toBe(
        serialized.trimEnd(),
      );
    },
  );

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

  it.each([
    { ending: "\n", fence: "```", name: "backtick fences with LF" },
    { ending: "\r\n", fence: "~~~", name: "tilde fences with CRLF" },
  ])(
    "keeps the language and first code line separate for $name",
    ({ ending, fence }) => {
      const serialized = [
        `${fence}text`,
        "html.h5-layout {",
        "  color: red;",
        "}",
        fence,
        "",
      ].join(ending);

      expect(preserveMarkdownSource("", ending, serialized)).toBe(
        serialized.slice(0, -ending.length),
      );
    },
  );

  it("keeps the fence boundary separate across later code edits", () => {
    const source = [
      "```text",
      "html.h5-layout {",
      "  color: red;",
      "}",
      "```",
    ].join("\n");
    const baseline = `${source}\n`;
    const edited = baseline.replace("color: red", "color: blue");

    expect(preserveMarkdownSource(source, baseline, edited)).toBe(
      source.replace("color: red", "color: blue"),
    );
  });

  it("skips character-level source preservation for large documents", () => {
    const text = "a".repeat(9_000);
    const source = `* ${text}\r\n`;
    const baseline = `- ${text}\n`;
    const edited = `- ${text}b\n`;

    expect(preserveMarkdownSource(source, baseline, edited)).toBe(
      `* ${text}b\r\n`,
    );
  });

  it("preserves dash list markers in large documents when the serializer emits stars", () => {
    const exportedJson = "a".repeat(9_000);
    const source = [
      "## 账户1 【已废】",
      "",
      "- 2026/6/18 : <qqqiuwk@gmail.com>",
      "- cockpit-tools",
      "- 目前 已废",
      "",
      "```json",
      exportedJson,
      "```",
      "",
    ].join("\n");
    const baseline = source.replaceAll("- ", "* ");
    const edited = baseline.replace("cockpit-tools", "cockpit-tools1");

    expect(preserveMarkdownSource(source, baseline, edited)).toBe(
      source.replace("cockpit-tools", "cockpit-tools1"),
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
