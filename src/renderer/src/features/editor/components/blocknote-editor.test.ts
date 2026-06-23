import { BlockNoteEditor as CoreBlockNoteEditor } from "@blocknote/core";
import { describe, expect, it, vi } from "vitest";

import { editorSchema } from "../lib/blocknote-schema";
import {
  handleRichEditorHeadingShortcut,
  handleRichEditorSelectAllShortcut,
  selectEntireRichEditorContent,
  shouldLetCodeMirrorHandleKeyboardEvent,
  shouldMarkRichEditorPointerIntent,
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

  it("lets CodeMirror handle command/control+a inside code blocks", () => {
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        { type: "paragraph", content: "First line" },
        { type: "paragraph", content: "Second line" },
      ],
    });
    const codeMirror = document.createElement("div");
    codeMirror.className = "editor-code-block__codemirror";
    const content = document.createElement("div");
    content.className = "cm-content";
    codeMirror.append(content);
    const event = {
      altKey: false,
      ctrlKey: false,
      key: "a",
      metaKey: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      target: content,
    };

    expect(shouldLetCodeMirrorHandleKeyboardEvent(content)).toBe(true);
    expect(handleRichEditorSelectAllShortcut(event, editor)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
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

describe("BlockNoteEditor user intent tracking", () => {
  it("ignores pointer events from code block display controls", () => {
    const shell = document.createElement("div");
    shell.className = "editor-code-block-shell";
    const gutter = document.createElement("div");
    gutter.className = "cm-gutters";
    const foldButton = document.createElement("button");
    foldButton.className = "cm-foldGutter";
    gutter.append(foldButton);
    shell.append(gutter);

    expect(shouldMarkRichEditorPointerIntent(foldButton)).toBe(false);
    expect(shouldMarkRichEditorPointerIntent(gutter)).toBe(false);
  });

  it("keeps pointer intent tracking for code block toolbar actions", () => {
    const toolbar = document.createElement("div");
    toolbar.className = "editor-code-block__toolbar";
    const languageButton = document.createElement("button");
    languageButton.className = "editor-code-block-language-trigger";
    toolbar.append(languageButton);

    expect(shouldMarkRichEditorPointerIntent(languageButton)).toBe(true);
  });

  it("keeps pointer intent tracking for editable code content", () => {
    const shell = document.createElement("div");
    shell.className = "editor-code-block-shell";
    const code = document.createElement("code");
    code.className = "editor-code-block__content";
    shell.append(code);

    expect(shouldMarkRichEditorPointerIntent(code)).toBe(true);
  });
});
