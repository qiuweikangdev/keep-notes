import { BlockNoteEditor as CoreBlockNoteEditor } from "@blocknote/core";
import { describe, expect, it, vi } from "vitest";

import { editorSchema } from "../lib/blocknote-schema";
import {
  handleRichEditorHeadingShortcut,
  handleRichEditorSelectAllShortcut,
  focusEditorOutlineBlock,
  moveCursorAfterUploadedImage,
  richEditorDefaultUIProps,
  uploadEditorImageFileAsAttachment,
  selectEntireRichEditorContent,
  shouldLetCodeMirrorHandleKeyboardEvent,
  shouldMarkRichEditorPointerIntent,
} from "./blocknote-editor";

describe("BlockNoteEditor rich text selection", () => {
  it("enables the default block side menu for block insert and drag controls", () => {
    expect(richEditorDefaultUIProps.sideMenu).toBe(true);
  });

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

describe("BlockNoteEditor outline navigation focus", () => {
  it("focuses the editor before moving the cursor to an outline block", () => {
    const calls: string[] = [];
    const editor = {
      getBlock: vi.fn(() => ({ id: "heading-1", type: "heading" })),
      focus: vi.fn(() => calls.push("focus")),
      setTextCursorPosition: vi.fn(() => calls.push("set-cursor")),
    };
    const scrollSelection = vi.fn(() => {
      calls.push("scroll-selection");
      return true;
    });

    expect(focusEditorOutlineBlock(editor, "heading-1", scrollSelection)).toBe(
      true,
    );

    expect(calls).toEqual(["focus", "set-cursor", "scroll-selection"]);
    expect(editor.setTextCursorPosition).toHaveBeenCalledWith(
      "heading-1",
      "start",
    );
  });
});

describe("BlockNoteEditor pasted image selection", () => {
  it("moves the cursor to the following text block after an uploaded image", () => {
    const editor = {
      document: [
        { id: "image-1", type: "image" },
        { id: "paragraph-1", type: "paragraph" },
      ],
      getBlock: vi.fn((id: string) =>
        id === "image-1" ? { id: "image-1", type: "image" } : undefined,
      ),
      insertBlocks: vi.fn(),
      setTextCursorPosition: vi.fn(),
    };

    expect(moveCursorAfterUploadedImage(editor, "image-1")).toBe(true);

    expect(editor.insertBlocks).not.toHaveBeenCalled();
    expect(editor.setTextCursorPosition).toHaveBeenCalledWith(
      "paragraph-1",
      "start",
    );
  });

  it("creates a following text block when the uploaded image is last", () => {
    const insertedBlock = { id: "paragraph-2", type: "paragraph" };
    const editor = {
      document: [{ id: "image-1", type: "image" }],
      getBlock: vi.fn((id: string) =>
        id === "image-1" ? { id: "image-1", type: "image" } : undefined,
      ),
      insertBlocks: vi.fn(() => [insertedBlock]),
      setTextCursorPosition: vi.fn(),
    };

    expect(moveCursorAfterUploadedImage(editor, "image-1")).toBe(true);

    expect(editor.insertBlocks).toHaveBeenCalledWith(
      [{ type: "paragraph", content: "" }],
      "image-1",
      "after",
    );
    expect(editor.setTextCursorPosition).toHaveBeenCalledWith(
      "paragraph-2",
      "start",
    );
  });

  it("does not move the cursor for non-image upload blocks", () => {
    const editor = {
      document: [{ id: "paragraph-1", type: "paragraph" }],
      getBlock: vi.fn(() => ({ id: "paragraph-1", type: "paragraph" })),
      insertBlocks: vi.fn(),
      setTextCursorPosition: vi.fn(),
    };

    expect(moveCursorAfterUploadedImage(editor, "paragraph-1")).toBe(false);

    expect(editor.insertBlocks).not.toHaveBeenCalled();
    expect(editor.setTextCursorPosition).not.toHaveBeenCalled();
  });
});

describe("BlockNoteEditor pasted image upload", () => {
  it("uses the latest workspace path when saving pasted images", async () => {
    let workspaceRootPath: string | null = null;
    const saveImageAttachment = vi.fn(async () => ({
      code: 1,
      data: {
        filePath: "/workspace/notes/attachments/1782999636770-image.png",
        url: "attachments/1782999636770-image.png",
      },
    }));
    const file = new File([Uint8Array.from([1, 2, 3])], "image.png", {
      type: "image/png",
    });

    workspaceRootPath = "/workspace/notes";
    const url = await uploadEditorImageFileAsAttachment(file, {
      getWorkspaceRootPath: () => workspaceRootPath,
      getMarkdownFilePath: () => "/workspace/notes/daily.md",
      saveImageAttachment,
      moveCursorAfterUpload: vi.fn(),
    });

    expect(url).toBe("attachments/1782999636770-image.png");
    expect(saveImageAttachment).toHaveBeenCalledWith({
      workspaceRootPath: "/workspace/notes",
      markdownFilePath: "/workspace/notes/daily.md",
      fileName: "image.png",
      mimeType: "image/png",
      data: Uint8Array.from([1, 2, 3]).buffer,
    });
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
