import { BlockNoteEditor } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import { editorSchema } from "./blocknote-schema";
import { parseMarkdown, serializeMarkdown } from "./markdown";

describe("persistent rich table layout", () => {
  it.each(["widths", "cellAlignment"] as const)(
    "retains %s after repeated reopening",
    async (layout) => {
      const editor = BlockNoteEditor.create({
        schema: editorSchema,
        initialContent: [
          {
            type: "table",
            content: {
              type: "tableContent",
              headerRows: 1,
              columnWidths: layout === "widths" ? [240, 120] : undefined,
              rows: [
                { cells: ["A", "B"] },
                {
                  cells: [
                    {
                      type: "tableCell",
                      content: "one",
                      props: {
                        textAlignment:
                          layout === "cellAlignment" ? "right" : "left",
                      },
                    },
                    { type: "tableCell", content: "two" },
                  ],
                },
              ],
            },
          },
        ],
      });
      let blocks = editor.document;
      for (let round = 0; round < 3; round++) {
        const saved = await serializeMarkdown(editor, blocks);
        blocks = await parseMarkdown(editor, saved);
        expect(blocks[0].content).toEqual(editor.document[0].content);
      }
    },
  );

  it("keeps ordinary whole-column alignment as a GFM table", async () => {
    const editor = BlockNoteEditor.create({ schema: editorSchema });
    const blocks = await parseMarkdown(
      editor,
      "| A | B |\n| --- | ---: |\n| one | two |\n",
    );
    const saved = await serializeMarkdown(editor, blocks);
    expect(saved).not.toContain("keep-notes:rich-block");
    expect((await parseMarkdown(editor, saved))[0].content).toEqual(
      blocks[0].content,
    );
  });
});
