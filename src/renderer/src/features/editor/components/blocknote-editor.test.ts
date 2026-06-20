import { BlockNoteEditor as CoreBlockNoteEditor } from "@blocknote/core";
import { describe, expect, it, vi } from "vitest";

import { editorSchema } from "../lib/blocknote-schema";
import {
  handleRichEditorHeadingShortcut,
  handleRichEditorSelectAllShortcut,
  selectEntireRichEditorContent,
} from "./blocknote-editor";

describe("BlockNoteEditor rich text selection", () => {
  it("selects the entire ProseMirror document", () => {
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        { type: "paragraph", content: "First line" },
        { type: "paragraph", content: "Second line" },
      ],
    });

    expect(selectEntireRichEditorContent(editor)).toBe(true);

    const { doc, selection } = editor.prosemirrorView.state;
    expect(selection.from).toBe(0);
    expect(selection.to).toBe(doc.content.size);
  });

  it("handles command/control+a as full rich editor selection", () => {
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        { type: "paragraph", content: "First line" },
        { type: "paragraph", content: "Second line" },
      ],
    });
    const event = {
      altKey: false,
      ctrlKey: false,
      key: "a",
      metaKey: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      target: document.createElement("div"),
    };

    expect(handleRichEditorSelectAllShortcut(event, editor)).toBe(true);

    const { doc, selection } = editor.prosemirrorView.state;
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(selection.from).toBe(0);
    expect(selection.to).toBe(doc.content.size);
  });
});

describe("BlockNoteEditor heading shortcuts", () => {
  it("handles command/control+number as heading level shortcut", () => {
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "Heading text" }],
    });
    editor.setTextCursorPosition(editor.document[0].id, "end");
    const event = {
      altKey: false,
      ctrlKey: true,
      key: "2",
      metaKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    expect(handleRichEditorHeadingShortcut(event, editor)).toBe(true);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(editor.document[0].type).toBe("heading");
    expect(editor.document[0].props.level).toBe(2);
  });
});
