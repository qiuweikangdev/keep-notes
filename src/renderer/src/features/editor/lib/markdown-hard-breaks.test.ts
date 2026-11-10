import { BlockNoteEditor } from "@blocknote/core";
import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";
import { editorSchema } from "./blocknote-schema";
import { parseMarkdown, serializeMarkdown } from "./markdown";

describe("paragraph hard breaks", () => {
  it.each(["paragraph", "heading", "bulletListItem", "quote"] as const)(
    "does not serialize trailing breaks as literal backslashes in a %s",
    async (type) => {
      const editor = BlockNoteEditor.create({ schema: editorSchema });
      for (const ending of ["\n", "\n ", "\n\u00a0", "\n\n"]) {
        for (const styles of [{}, { bold: true }]) {
          editor.replaceBlocks(editor.document, [
            {
              type,
              content: [
                {
                  type: "text",
                  text: `${type === "heading" ? "" : "First\n"}Last${ending}`,
                  styles,
                },
              ],
            },
          ]);
          const originalContent = editor.document[0].content;
          const saved = await serializeMarkdown(editor, editor.document);
          expect(saved).not.toMatch(/\\\n(?:[> \t]*\n)*$/u);
          expect(new MarkdownIt().render(saved)).not.toContain("Last\\");
          if (type !== "heading") expect(saved).toContain("\\\n");
          expect(editor.document[0].content).toEqual(originalContent);
          const reopened = await parseMarkdown(editor, saved);
          expect(await serializeMarkdown(editor, reopened)).toBe(saved);
        }
      }
    },
  );

  it("trims terminal breaks split across inline styles and links", async () => {
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Text", styles: { bold: true } },
            { type: "text", text: "\n", styles: {} },
            {
              type: "link",
              href: "https://example.com",
              content: [
                { type: "text", text: "\u00a0", styles: { italic: true } },
              ],
            },
          ],
        },
      ],
    });
    expect(await serializeMarkdown(editor, editor.document)).toBe("**Text**\n");
  });

  it("preserves literal backslashes, standalone breaks and code whitespace", async () => {
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        { type: "paragraph", content: "Text\\" },
        { type: "paragraph", content: "\n" },
        {
          type: "codeBlock",
          props: { language: "text" },
          content: "Text\\\n ",
        },
      ],
    });
    const saved = await serializeMarkdown(editor, editor.document);
    expect(saved).toContain("Text\\");
    expect(saved).toContain("<br />");
    expect(saved).toContain("```text\nText\\\n \n```");
  });

  it("keeps trailing breaks in authored rich HTML blocks", async () => {
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Text\n", styles: { underline: true } },
          ],
        },
      ],
    });
    const saved = await serializeMarkdown(editor, editor.document);
    const reopened = await parseMarkdown(editor, saved);
    expect(reopened[0].content).toEqual(editor.document[0].content);
  });

  it.each([{}, { bold: true }])(
    "keeps rich paragraph breaks through standard Markdown and repeated reopening (%j)",
    async (styles) => {
      const editor = BlockNoteEditor.create({
        schema: editorSchema,
        initialContent: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "First\nSecond", styles }],
          },
        ],
      });
      let blocks = editor.document;
      for (let round = 0; round < 3; round++) {
        const saved = await serializeMarkdown(editor, blocks);
        expect(new MarkdownIt().render(saved)).toContain("<br>");
        blocks = await parseMarkdown(editor, saved);
        expect(blocks[0].content).toEqual(editor.document[0].content);
      }
    },
  );

  it.each(["First  \nSecond\n", "First\\\nSecond\n"])(
    "does not add whitespace after an authored hard break (%j)",
    async (source) => {
      const editor = BlockNoteEditor.create({ schema: editorSchema });
      expect((await parseMarkdown(editor, source))[0].content).toEqual([
        { type: "text", text: "First\nSecond", styles: {} },
      ]);
    },
  );
});
