import { BlockNoteEditor as CoreBlockNoteEditor } from "@blocknote/core";
import { closeHistory, undoDepth } from "@tiptap/pm/history";
import { afterEach, describe, expect, it } from "vitest";

import { editorSchema } from "./blocknote-schema";
import { configureRichTextUndoHistory } from "./editor-undo-history";

const mountedEditors: Array<{
  editor: CoreBlockNoteEditor;
  host: HTMLDivElement;
}> = [];

function createMountedEditor() {
  const host = document.createElement("div");
  document.body.append(host);

  const editor = CoreBlockNoteEditor.create({
    schema: editorSchema,
    initialContent: [{ type: "paragraph", content: "" }],
  });
  editor.mount(host);
  mountedEditors.push({ editor, host });

  return editor;
}

function insertSeparateHistoryEvent(editor: CoreBlockNoteEditor) {
  const view = editor.prosemirrorView;
  view.dispatch(
    closeHistory(view.state.tr.insertText("x", view.state.selection.from)),
  );
}

afterEach(() => {
  for (const { editor, host } of mountedEditors.splice(0)) {
    editor.unmount();
    host.remove();
  }
});

describe("rich text undo history", () => {
  it("keeps more than the default 100 separate edit events undoable", () => {
    const editor = createMountedEditor();

    expect(configureRichTextUndoHistory(editor)).toBe(true);
    for (let index = 0; index < 150; index += 1) {
      insertSeparateHistoryEvent(editor);
    }

    expect(undoDepth(editor.prosemirrorState)).toBe(150);
    for (let index = 0; index < 150; index += 1) {
      expect(editor.undo()).toBe(true);
    }
    expect(editor.prosemirrorState.doc.textContent).toBe("");
    expect(editor.undo()).toBe(false);
  });

  it("does not reset existing history when configured again", () => {
    const editor = createMountedEditor();

    expect(configureRichTextUndoHistory(editor)).toBe(true);
    insertSeparateHistoryEvent(editor);
    expect(undoDepth(editor.prosemirrorState)).toBe(1);

    expect(configureRichTextUndoHistory(editor)).toBe(true);
    expect(undoDepth(editor.prosemirrorState)).toBe(1);
    expect(editor.undo()).toBe(true);
    expect(editor.prosemirrorState.doc.textContent).toBe("");
  });
});
