import { BlockNoteEditor } from "@blocknote/core";
import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";
import { editorSchema } from "./blocknote-schema";
import { parseMarkdown, serializeMarkdown } from "./markdown";

describe("paragraph hard breaks", () => {
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
