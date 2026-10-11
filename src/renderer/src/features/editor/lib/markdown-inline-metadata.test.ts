import { BlockNoteEditor } from "@blocknote/core";
import { describe, expect, it } from "vitest";
import { editorSchema } from "./blocknote-schema";
import {
  parseMarkdown,
  preserveMarkdownSource,
  serializeMarkdown,
} from "./markdown";

describe("inline Markdown source metadata", () => {
  it.each(["small", "large"] as const)(
    "preserves images and link titles while editing another block (%s)",
    async (size) => {
      const padding =
        size === "large" ? "\n\n" + "Long paragraph. ".repeat(1300) : "";
      const source =
        'Before ![alt](./test.png) after\n\n[link](https://example.com "title")' +
        padding +
        "\n";
      const editor = BlockNoteEditor.create({ schema: editorSchema });
      const blocks = await parseMarkdown(editor, source);
      const baseline = await serializeMarkdown(editor, blocks);
      const extra = await parseMarkdown(editor, "New content\n");
      const saved = preserveMarkdownSource(
        source,
        baseline,
        await serializeMarkdown(editor, [...blocks, ...extra]),
      );
      expect(saved).toContain("![alt](./test.png)");
      expect(saved).toContain('[link](https://example.com "title")');
      expect(saved).toContain("New content");
    },
  );

  it("does not restore metadata from a deleted block", () => {
    const source = "Before ![alt](./test.png) after\n\nKeep\n";
    expect(
      preserveMarkdownSource(source, "Before  after\n\nKeep\n", "Keep\n"),
    ).toBe("Keep\n");
  });
});
