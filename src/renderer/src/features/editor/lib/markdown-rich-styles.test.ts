import { BlockNoteEditor } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import { editorSchema } from "./blocknote-schema";
import { parseMarkdown, serializeMarkdown } from "./markdown";

describe("rich styles in Markdown", () => {
  it.each(["underline", "textColor", "backgroundColor"] as const)(
    "persists %s across reopening",
    async (style) => {
      const editor = BlockNoteEditor.create({
        schema: editorSchema,
        initialContent: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Styled",
                styles: { [style]: style === "underline" ? true : "red" },
              },
            ],
          },
        ],
      });
      const saved = await serializeMarkdown(editor, editor.document);
      const reopened = await parseMarkdown(editor, saved);
      expect(reopened[0].content).toEqual(editor.document[0].content);
    },
  );
  it("keeps styled descendants and code in one quoted structure", async () => {
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "quote",
          content: "Intro",
          children: [
            {
              type: "numberedListItem",
              props: { start: 3 },
              content: [
                {
                  type: "text",
                  text: "Styled",
                  styles: { underline: true, textColor: "red" },
                },
              ],
            },
            {
              type: "codeBlock",
              props: { language: "js" },
              content: "first\n\nsecond",
            },
          ],
        },
      ],
    });
    const saved = await serializeMarkdown(editor, editor.document);
    const reopened = await parseMarkdown(editor, saved);
    expect(reopened[0].children[0].content).toEqual(
      editor.document[0].children[0].content,
    );
    expect(reopened[0].children[1]).toMatchObject({
      type: "codeBlock",
      props: { language: "js" },
      content: [{ type: "text", text: "first\n\nsecond" }],
    });
    expect(await serializeMarkdown(editor, reopened)).toBe(saved);
    expect(saved).not.toContain("data-id=");
  });

  it("leaves rich-block markers inside a code fence literal", async () => {
    const editor = BlockNoteEditor.create({ schema: editorSchema });
    const content =
      "<!-- keep-notes:rich-block -->\n<p><u>Example</u></p>\n<!-- keep-notes:rich-block-end -->";
    const blocks = await parseMarkdown(
      editor,
      "```html\n" + content + "\n```\n",
    );
    expect(blocks[0]).toMatchObject({
      type: "codeBlock",
      content: [{ text: content }],
    });
  });
});
