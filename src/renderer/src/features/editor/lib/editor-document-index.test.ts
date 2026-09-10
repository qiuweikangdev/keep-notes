import { BlockNoteEditor } from "@blocknote/core";
import { describe, expect, it, vi } from "vitest";
import { EditorDocumentIndex } from "./editor-document-index";

function createHarness() {
  const editor = BlockNoteEditor.create({
    initialContent: [
      { id: "heading", type: "heading", content: "Title" },
      { id: "paragraph", type: "paragraph", content: "text" },
      { id: "tail", type: "paragraph", content: "x".repeat(100_000) },
    ],
  });
  const index = new EditorDocumentIndex();
  index.read(editor.prosemirrorState.doc);
  // oxlint-disable-next-line eslint/no-underscore-dangle
  editor._tiptapEditor.on("transaction", ({ transaction }) => {
    index.apply(transaction);
  });
  const read = () => index.read(editor.prosemirrorState.doc);
  return { editor, index, read };
}

describe("EditorDocumentIndex", () => {
  it("reuses the outline and structure while typing ordinary text", () => {
    const { editor, index, read } = createHarness();
    const before = read();
    const revision = index.revision;
    const scan = vi.spyOn(editor.prosemirrorState.doc, "descendants");
    editor.prosemirrorView.dispatch(
      editor.prosemirrorState.tr.insertText("中文输入", 12, 16),
    );
    expect(read()).toBe(before);
    expect(index.revision).toBeGreaterThan(revision);
    expect(index.textLength).toBe(
      editor.prosemirrorState.doc.textContent.length,
    );
    expect(scan).not.toHaveBeenCalled();
  });

  it("updates only the heading text and preserves the block navigation map", () => {
    const { editor, index, read } = createHarness();
    const before = read();
    editor.prosemirrorView.dispatch(
      editor.prosemirrorState.tr.insertText("Changed", 3, 8),
    );
    const after = read();
    expect(after.headings).toEqual([
      { id: "heading", text: "Changed", level: 1 },
    ]);
    expect(after.activeHeadingIdByBlockId).toBe(
      before.activeHeadingIdByBlockId,
    );
    expect(index.textLength).toBe(
      editor.prosemirrorState.doc.textContent.length,
    );
  });

  it("rebuilds for heading level changes, insertion, movement, and deletion", () => {
    const { editor, index, read } = createHarness();
    editor.updateBlock("heading", { props: { level: 2 } });
    expect(read().headings[0].level).toBe(2);
    editor.insertBlocks(
      [{ id: "nested", type: "heading", content: "Nested" }],
      "paragraph",
      "after",
    );
    expect(read().activeHeadingIdByBlockId.get("tail")).toBe("nested");
    editor.moveBlocksUp("nested");
    expect(read().activeHeadingIdByBlockId.get("paragraph")).toBe("nested");
    editor.removeBlocks(["heading"]);
    expect(read().headings.map((heading) => heading.id)).toEqual(["nested"]);
    expect(index.textLength).toBe(
      editor.prosemirrorState.doc.textContent.length,
    );
  });

  it("recovers from a rejected or superseded transaction", () => {
    const { editor, index, read } = createHarness();
    const actualDoc = editor.prosemirrorState.doc;
    const transaction = editor.prosemirrorState.tr.insertText("ignored", 3);
    index.apply(transaction);
    read();
    expect(index.textLength).toBe(actualDoc.textContent.length);
    expect(read().headings[0].text).toBe("Title");
  });
});
