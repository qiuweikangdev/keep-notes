import { BlockNoteEditor } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import { editorSchema } from "./blocknote-schema";
import {
  parseMarkdown,
  preserveMarkdownSource,
  serializeMarkdown,
} from "./markdown";

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "id")
        .map(([key, child]) => [key, shape(child)]),
    );
  return value;
}

describe("structured Markdown quotes", () => {
  it.each([
    ["ordered", "> Intro\n>\n> 3. First\n> 4. Second\n", "numberedListItem"],
    ["task", "> Intro\n>\n> - [x] Done\n> - [ ] Todo\n", "checkListItem"],
    ["code", "> Intro\n>\n> ```js\n> const a = 1;\n> ```\n", "codeBlock"],
    [
      "table",
      "> Intro\n>\n> | A | B |\n> | --- | --- |\n> | one | two |\n",
      "table",
    ],
    ["nested", "> Intro\n>\n> > Inner\n", "quote"],
    ["paragraph", "> Intro\n>\n> Second\n", "paragraph"],
  ])(
    "retains quoted %s through editing and reopening",
    async (_name, source, childType) => {
      const editor = BlockNoteEditor.create({ schema: editorSchema });
      const blocks = await parseMarkdown(editor, source);
      expect(blocks[0].type).toBe("quote");
      expect(blocks[0].children[0].type).toBe(childType);
      expect(blocks[0].content).toEqual([
        { type: "text", text: "Intro", styles: {} },
      ]);
      const baseline = await serializeMarkdown(editor, blocks);
      expect(shape(await parseMarkdown(editor, baseline))).toEqual(
        shape(blocks),
      );
      const extra = await parseMarkdown(editor, "New content\n");
      const saved = preserveMarkdownSource(
        source,
        baseline,
        await serializeMarkdown(editor, [...blocks, ...extra]),
      );
      expect(shape(await parseMarkdown(editor, saved))).toEqual(
        shape([...blocks, ...extra]),
      );
    },
  );
});
