import { BlockNoteEditor } from "@blocknote/core";
import { describe, expect, it } from "vitest";

import { editorSchema } from "./blocknote-schema";
import {
  parseMarkdown,
  preserveMarkdownSource,
  serializeMarkdown,
} from "./markdown";

type ShapeBlock = {
  type: string;
  content?: unknown;
  children?: ShapeBlock[];
  props?: Record<string, unknown>;
};
function documentShape(blocks: ShapeBlock[]): unknown {
  return blocks.map((block) => ({
    type: block.type,
    content: block.content,
    language: block.props?.language,
    checked: block.props?.checked,
    children: documentShape(block.children ?? []),
  }));
}

const source = [
  "### 指针语法",
  "",
  "* &变量 = 取地址",
  "",
  "* *类型 = 声明指针类型",
  "",
  "* *指针 = **解引用**，通过指针找到它指向的原始值",
  "",
  "```text",
  "var p *int = &a",
  "",
  "fmt.Println(p)",
  "```",
  "",
].join("\n");

describe("list and code block boundaries", () => {
  it("keeps list container annotations literal outside list heads", async () => {
    const editor = BlockNoteEditor.create({ schema: editorSchema });
    const marker = "<!-- keep-notes:empty-list-item -->";
    const blocks = await parseMarkdown(
      editor,
      `${marker}\n\n\`\`\`text\n* ${marker}\n\`\`\`\n`,
    );
    expect(blocks[0].content).toEqual([
      { type: "text", text: marker, styles: {} },
    ]);
    expect(blocks[1].content).toEqual([
      { type: "text", text: `* ${marker}`, styles: {} },
    ]);
  });
  it.each(["bulletListItem", "numberedListItem"] as const)(
    "preserves styled hard breaks in a standalone %s",
    async (type) => {
      const editor = BlockNoteEditor.create({
        schema: editorSchema,
        initialContent: [
          {
            type,
            content: [
              { type: "text", text: "第一行\n第二行", styles: { bold: true } },
            ],
          },
          { type, content: "下一项" },
        ],
      });
      let blocks = editor.document;
      for (let round = 0; round < 3; round++) {
        blocks = await parseMarkdown(
          editor,
          await serializeMarkdown(editor, blocks),
        );
        expect(documentShape(blocks)).toEqual(documentShape(editor.document));
      }
    },
  );

  it("preserves inline styles across soft paragraph continuations", async () => {
    const editor = BlockNoteEditor.create({ schema: editorSchema });
    const blocks = await parseMarkdown(editor, "* **第一行\n  第二行**\n*\n");
    expect(blocks[0].content).toEqual([
      { type: "text", text: "第一行", styles: { bold: true } },
    ]);
    expect(blocks[0].children[0].content).toEqual([
      { type: "text", text: "第二行", styles: { bold: true } },
    ]);
    expect(
      documentShape(
        await parseMarkdown(editor, await serializeMarkdown(editor, blocks)),
      ),
    ).toEqual(documentShape(blocks));
  });

  it("preserves an empty parent item with a paragraph child", async () => {
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "bulletListItem",
          content: "",
          children: [{ type: "paragraph", content: "子段落" }],
        },
        {
          type: "codeBlock",
          content: "var p *int = &a",
          props: { language: "text" },
        },
      ],
    });
    const serialized = await serializeMarkdown(editor, editor.document);
    expect(documentShape(await parseMarkdown(editor, serialized))).toEqual(
      documentShape(editor.document),
    );
  });

  it("keeps multiline list descendants when an empty sibling is added", async () => {
    const editor = BlockNoteEditor.create({ schema: editorSchema });
    const original = "* 父项\n  * 子项\n    子段落\n\n```text\ncode\n```\n";
    const blocks = await parseMarkdown(editor, original);
    const blank = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "bulletListItem", content: "" }],
    }).document[0];
    const editedBlocks = [blocks[0], blank, ...blocks.slice(1)];
    const serialized = await serializeMarkdown(editor, editedBlocks);
    expect(documentShape(await parseMarkdown(editor, serialized))).toEqual(
      documentShape(editedBlocks),
    );
  });

  it.each(["bulletListItem", "numberedListItem"] as const)(
    "round-trips line breaks and nested code in %s",
    async (type) => {
      const editor = BlockNoteEditor.create({
        schema: editorSchema,
        initialContent: [
          {
            type,
            content: "列表第一行\n第二行",
            children: [
              {
                type: "codeBlock",
                content: "  first()\n\nlast()",
                props: { language: "text" },
              },
            ],
          },
          { type, content: "下一项" },
        ],
      });
      const serialized = await serializeMarkdown(editor, editor.document);
      expect(documentShape(await parseMarkdown(editor, serialized))).toEqual(
        documentShape(editor.document),
      );
    },
  );

  it("does not carry a stale source-only list marker into the saved rich document", async () => {
    const editor = BlockNoteEditor.create({ schema: editorSchema });
    const staleSource = source.replace("\n```text", "\n-\n\n```text");
    const blocks = await parseMarkdown(editor, source);
    const baseline = await serializeMarkdown(editor, blocks);
    const edited = baseline.replace("取地址", "取得地址");
    const saved = preserveMarkdownSource(staleSource, baseline, edited);
    expect(documentShape(await parseMarkdown(editor, saved))).toEqual(
      documentShape(await parseMarkdown(editor, edited)),
    );
  });

  it("keeps fence metadata out of the first code line", async () => {
    const editor = BlockNoteEditor.create({ schema: editorSchema });
    const blocks = await parseMarkdown(
      editor,
      '```go title="指针示例"\nvar p *int = &a\n```',
    );
    expect(blocks[0].content).toEqual([
      { type: "text", text: "var p *int = &a", styles: {} },
    ]);
  });
  it.each(
    ["*", "-", "+"].flatMap((marker) =>
      ["\n", "\r\n"].map((ending) => ({ marker, ending })),
    ),
  )(
    "round-trips successive edits with $marker markers and $ending endings",
    async ({ marker, ending }) => {
      const editor = BlockNoteEditor.create({ schema: editorSchema });
      let saved = source.replace(/^\*/gm, marker).replaceAll("\n", ending);
      let blocks = await parseMarkdown(editor, saved);
      let baseline = await serializeMarkdown(editor, blocks);
      const verify = async () => {
        const exported = await serializeMarkdown(editor, blocks);
        saved = preserveMarkdownSource(saved, baseline, exported);
        expect(documentShape(await parseMarkdown(editor, saved))).toEqual(
          documentShape(blocks),
        );
        baseline = exported;
      };
      const blank = BlockNoteEditor.create({
        schema: editorSchema,
        initialContent: [{ type: "bulletListItem", content: "" }],
      }).document[0];
      if (blank.type !== "bulletListItem")
        throw new Error("Expected list fixture");
      blocks.splice(4, 0, blank);
      await verify();
      blocks[4] = {
        ...blank,
        content: [{ type: "text", text: "新增项", styles: {} }],
      };
      await verify();
      blocks.splice(4, 1);
      const code = blocks.find((block) => block.type === "codeBlock");
      if (!code) throw new Error("Expected code fixture");
      blocks[4] = {
        ...code,
        content: [
          { type: "text", text: "// 新首行\nvar p *int = &a", styles: {} },
        ],
      };
      await verify();
      blocks[3] = {
        ...code,
        content: [
          { type: "text", text: "* *指针 = **解引用**\n```text", styles: {} },
        ],
      };
      await verify();
      blocks = [blocks[0], blocks[4], ...blocks.slice(1, 4)];
      await verify();
    },
  );
  it("retains interior empty items, task items, and parents with children", async () => {
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        { type: "bulletListItem", content: "前项" },
        { type: "bulletListItem", content: "" },
        { type: "bulletListItem", content: "后项" },
        {
          type: "bulletListItem",
          content: "",
          children: [{ type: "bulletListItem", content: "子段落" }],
        },
        { type: "checkListItem", content: "" },
        { type: "codeBlock", content: "*\n-\n1.", props: { language: "text" } },
      ],
    });
    const serialized = await serializeMarkdown(editor, editor.document);
    const parsed = await parseMarkdown(editor, serialized);
    expect(documentShape(parsed)).toEqual(documentShape(editor.document));
    expect(serialized).toContain("子段落");
    expect(parsed.at(-1)?.content).toEqual([
      { type: "text", text: "*\n-\n1.", styles: {} },
    ]);
  });

  it("preserves consecutive empty list tails before paragraphs and within nested lists", async () => {
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "bulletListItem",
          content: "父项",
          children: [
            { type: "bulletListItem", content: "子项" },
            { type: "bulletListItem", content: "" },
            { type: "paragraph", content: "子段落" },
          ],
        },
        { type: "bulletListItem", content: "" },
        { type: "bulletListItem", content: "" },
        { type: "paragraph", content: "后续段落" },
      ],
    });
    const serialized = await serializeMarkdown(editor, editor.document);
    expect(documentShape(await parseMarkdown(editor, serialized))).toEqual(
      documentShape(editor.document),
    );
    expect(serialized).toContain("子段落");
    expect(serialized).toContain("后续段落");
    expect(editor.document).toHaveLength(4);
    expect(editor.document[0].children).toHaveLength(3);
  });

  it("preserves code first-line edits made together with a list deletion", async () => {
    const editor = BlockNoteEditor.create({ schema: editorSchema });
    const blocks = await parseMarkdown(editor, source);
    const baseline = await serializeMarkdown(editor, blocks);
    const editedBlocks = blocks
      .filter((_, index) => index !== 3)
      .map((block) =>
        block.type === "codeBlock"
          ? {
              ...block,
              content: [
                {
                  type: "text" as const,
                  text: "// 新首行\nvar p *int = &a\n\nfmt.Println(p)",
                  styles: {},
                },
              ],
            }
          : block,
      );
    const edited = await serializeMarkdown(editor, editedBlocks);
    const saved = preserveMarkdownSource(source, baseline, edited);
    const reserialized = await serializeMarkdown(
      editor,
      await parseMarkdown(editor, saved),
    );
    expect(reserialized).toBe(edited);
  });
  it.each(["bulletListItem", "numberedListItem"] as const)(
    "preserves an empty %s before a code block",
    async (type) => {
      const editor = BlockNoteEditor.create({
        schema: editorSchema,
        initialContent: [
          { type, content: "列表正文" },
          { type, content: "" },
          {
            type: "codeBlock",
            content: "var p *int = &a",
            props: { language: "text" },
          },
        ],
      });
      const serialized = await serializeMarkdown(editor, editor.document);
      const reparsed = await parseMarkdown(editor, serialized);
      expect(reparsed.map((block) => block.type)).toEqual([
        type,
        type,
        "codeBlock",
      ]);
      expect(editor.document).toHaveLength(3);
    },
  );

  it("keeps list text outside code while repeatedly editing its first line", async () => {
    const editor = BlockNoteEditor.create({ schema: editorSchema });
    let currentSource = source;
    for (const firstLine of [
      "  var p *int = &a",
      "",
      "var p *int = &a // 首行",
    ]) {
      const blocks = await parseMarkdown(editor, currentSource);
      const baseline = await serializeMarkdown(editor, blocks);
      const code = blocks.find((block) => block.type === "codeBlock")!;
      const edited = await serializeMarkdown(
        editor,
        blocks.map((block) =>
          block === code
            ? {
                ...block,
                content: [
                  {
                    type: "text" as const,
                    text: `${firstLine}\n\nfmt.Println(p)`,
                    styles: {},
                  },
                ],
              }
            : block,
        ),
      );
      currentSource = preserveMarkdownSource(currentSource, baseline, edited);
      const reparsed = await parseMarkdown(editor, currentSource);
      expect(reparsed.map((block) => block.type)).toEqual([
        "heading",
        "bulletListItem",
        "bulletListItem",
        "bulletListItem",
        "codeBlock",
      ]);
      expect(reparsed.at(-1)?.content).toEqual([
        { type: "text", text: `${firstLine}\n\nfmt.Println(p)`, styles: {} },
      ]);
    }
  });
});
