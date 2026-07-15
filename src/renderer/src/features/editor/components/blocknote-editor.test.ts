import { BlockNoteEditor as CoreBlockNoteEditor } from "@blocknote/core";
import {
  FormattingToolbarExtension,
  SideMenuExtension,
} from "@blocknote/core/extensions";
import { BlockNoteView } from "@blocknote/mantine";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { TextSelection } from "@tiptap/pm/state";
import { createElement, StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDiffStore } from "@/store/diff.store";
import type { EditorPanelGroup } from "@/store/editor.store";
import { useEditorStore } from "@/store/editor.store";
import { editorSchema } from "../lib/blocknote-schema";
import {
  editorCache,
  editorSaveCoordinator,
  richPaneViewStateRegistry,
} from "../lib/editor-runtime";
import { RichPreviewCache } from "../lib/rich-preview-cache";
import {
  BlockNoteEditor,
  EditorFormattingToolbar,
  focusEditorAtPreviewAnchor,
  handleRichEditorHeadingShortcut,
  handleRichEditorSelectAllShortcut,
  focusEditorOutlineBlock,
  moveCursorAfterUploadedImage,
  resolveEditorTextPosition,
  resolveEditorTextPositions,
  richEditorDefaultUIProps,
  uploadEditorImageFileAsAttachment,
  selectEntireRichEditorContent,
  shouldLetCodeMirrorHandleKeyboardEvent,
  shouldMarkRichEditorPointerIntent,
  type RichBlockNoteRuntime,
  type RichEditorSessionController,
} from "./blocknote-editor";

type SerializeMarkdown = typeof import("../lib/markdown").serializeMarkdown;

interface TestTiptapEditor {
  dispatchTransaction: (transaction: unknown) => void;
  off: (
    event: "transaction",
    listener: (payload: { transaction: { scrolledIntoView: boolean } }) => void,
  ) => void;
  on: (
    event: "transaction",
    listener: (payload: { transaction: { scrolledIntoView: boolean } }) => void,
  ) => void;
}

function getTestTiptapEditor(editor: CoreBlockNoteEditor) {
  return Reflect.get(
    editor,
    ["_", "tiptapEditor"].join(""),
  ) as TestTiptapEditor;
}

const markdownMocks = vi.hoisted(() => ({
  actualSerializeMarkdown: null as SerializeMarkdown | null,
  serializeMarkdown: vi.fn<SerializeMarkdown>(),
}));

const editorPerformanceMocks = vi.hoisted(() => ({
  measure: vi.fn(<T>(_operation: string, callback: () => T) => callback()),
}));

vi.mock("../lib/editor-performance", () => ({
  measureEditorOperation: editorPerformanceMocks.measure,
}));

vi.mock("../lib/markdown", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/markdown")>();
  markdownMocks.actualSerializeMarkdown = actual.serializeMarkdown;
  return {
    ...actual,
    serializeMarkdown: markdownMocks.serializeMarkdown,
  };
});

beforeEach(() => {
  editorPerformanceMocks.measure.mockClear();
  markdownMocks.serializeMarkdown.mockReset();
  markdownMocks.serializeMarkdown.mockImplementation((...args) =>
    markdownMocks.actualSerializeMarkdown!(...args),
  );
});

afterEach(() => {
  cleanup();
  richPaneViewStateRegistry.clear();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function createRect() {
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function* emptyRectIterator() {
  yield* [];
}

function createRectList() {
  return {
    length: 0,
    item: () => null,
    [Symbol.iterator]: emptyRectIterator,
  } as DOMRectList;
}

function setupMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: false,
      media: "",
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
}

function setupDomMeasurements() {
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: createRect,
  });
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: createRectList,
  });
  Object.defineProperty(HTMLElement.prototype, "getClientRects", {
    configurable: true,
    value: createRectList,
  });
}

function selectTextByContent(editor: CoreBlockNoteEditor, text: string) {
  const view = editor.prosemirrorView;
  let from: number | null = null;
  let to: number | null = null;

  view.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === text) {
      from = pos;
      to = pos + node.nodeSize;
      return false;
    }

    return true;
  });

  if (from === null || to === null) {
    throw new Error(`Could not find text: ${text}`);
  }

  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)),
  );
}

describe("BlockNoteEditor rich text selection", () => {
  it("lets the quote-aware controller own the block side menu", () => {
    expect(richEditorDefaultUIProps.sideMenu).toBe(false);
  });

  it("keeps a parent quote side menu visible while the pointer hovers it", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    const path = "C:/notes/quote-side-menu-hover.md";
    const session = renderRealSession(path, false, "> - First\n> - Second");

    await waitFor(() => expect(session.runtime.current).not.toBeNull());
    const editor = session.runtime.current!.editor;
    const sideMenu = editor.getExtension(SideMenuExtension)!;
    const freezeMenu = vi
      .spyOn(sideMenu, "freezeMenu")
      .mockImplementation(() => {});
    const unfreezeMenu = vi
      .spyOn(sideMenu, "unfreezeMenu")
      .mockImplementation(() => {});

    act(() => {
      sideMenu.store.setState({
        block: editor.document[0],
        referencePos: new DOMRect(),
        show: true,
      });
    });

    const menu = await waitFor(() => {
      const element = document.querySelector<HTMLElement>(
        '.editor-side-menu[data-quote-has-children="true"]',
      );
      expect(element).not.toBeNull();
      return element!;
    });

    fireEvent.mouseEnter(menu);
    expect(freezeMenu).toHaveBeenCalledTimes(1);

    fireEvent.mouseLeave(menu);
    expect(unfreezeMenu).toHaveBeenCalledTimes(1);
    session.view.unmount();
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

describe("focusEditorAtPreviewAnchor", () => {
  it("focuses an empty preview activation without scrolling the previous selection", () => {
    const editorFocus = vi.fn();
    const domFocus = vi.fn();
    const editor = {
      focus: editorFocus,
      prosemirrorView: { dom: { focus: domFocus } },
    } as unknown as CoreBlockNoteEditor;

    focusEditorAtPreviewAnchor(editor, null);

    expect(editorFocus).not.toHaveBeenCalled();
    expect(domFocus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("stops walking before trailing blocks after resolving an early target", () => {
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: Array.from({ length: 200 }, (_, index) => ({
        type: "paragraph" as const,
        content: `Block ${index}`,
      })),
    });
    const targetBlockId = editor.document[0].id;
    const blockGroup = editor.prosemirrorView.state.doc.child(0);
    const trailingBlock = blockGroup.child(blockGroup.childCount - 1);
    const trailingAttrs = trailingBlock.attrs;
    let trailingAttrsReadCount = 0;
    Object.defineProperty(trailingBlock, "attrs", {
      configurable: true,
      get: () => {
        trailingAttrsReadCount += 1;
        return trailingAttrs;
      },
    });

    expect(resolveEditorTextPosition(editor, targetBlockId, 2)).not.toBeNull();

    expect(trailingAttrsReadCount).toBe(0);
  });

  it("resolves both selection endpoints in one bounded document pass", () => {
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: Array.from({ length: 200 }, (_, index) => ({
        type: "paragraph" as const,
        content: `Block ${index}`,
      })),
    });
    const [firstBlockId, secondBlockId] = editor.document.map(
      (block) => block.id,
    );
    const blockGroup = editor.prosemirrorView.state.doc.child(0);
    const firstBlock = blockGroup.child(0);
    const firstAttrs = firstBlock.attrs;
    const trailingBlock = blockGroup.child(blockGroup.childCount - 1);
    const trailingAttrs = trailingBlock.attrs;
    let firstAttrsReadCount = 0;
    let trailingAttrsReadCount = 0;
    Object.defineProperty(firstBlock, "attrs", {
      configurable: true,
      get: () => {
        firstAttrsReadCount += 1;
        return firstAttrs;
      },
    });
    Object.defineProperty(trailingBlock, "attrs", {
      configurable: true,
      get: () => {
        trailingAttrsReadCount += 1;
        return trailingAttrs;
      },
    });

    const positions = resolveEditorTextPositions(editor, [
      { blockId: firstBlockId, textOffset: 2 },
      { blockId: secondBlockId, textOffset: 3 },
    ]);

    expect(positions.every((position) => position !== null)).toBe(true);
    expect(firstAttrsReadCount).toBe(1);
    expect(trailingAttrsReadCount).toBe(0);
  });

  it("keeps globally correct positions for nested block containers", () => {
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "paragraph",
          content: "Parent",
          children: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Nested ", styles: {} },
                { type: "text", text: "target", styles: { italic: true } },
              ],
            },
          ],
        },
      ],
    });
    const nestedBlock = editor.document[0].children[0];
    const position = resolveEditorTextPosition(editor, nestedBlock.id, 9);

    expect(position).not.toBeNull();
    const resolved = editor.prosemirrorView.state.doc.resolve(position!);
    expect(resolved.parent.textContent).toBe("Nested target");
    expect(resolved.parentOffset).toBe(9);
  });

  it("maps exact nested rich-text offsets and clamps them to block content", () => {
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello ", styles: {} },
            { type: "text", text: "world", styles: { bold: true } },
          ],
        },
      ],
    });
    const blockId = editor.document[0].id;
    const fallback = vi.spyOn(editor, "setTextCursorPosition");

    expect(resolveEditorTextPosition(editor, blockId, 9)).toBe(12);
    focusEditorAtPreviewAnchor(editor, { blockId, textOffset: 9 });
    expect(fallback).not.toHaveBeenCalled();
    expect(
      editor.prosemirrorView.state.selection.$from.parent.textContent,
    ).toBe("Hello world");
    expect(editor.prosemirrorView.state.selection.$from.parentOffset).toBe(9);

    focusEditorAtPreviewAnchor(editor, { blockId, textOffset: -20 });
    expect(editor.prosemirrorView.state.selection.$from.parentOffset).toBe(0);
    focusEditorAtPreviewAnchor(editor, { blockId, textOffset: 999 });
    expect(editor.prosemirrorView.state.selection.$from.parentOffset).toBe(11);
  });

  it("maps empty inline blocks and normalizes non-finite offsets", () => {
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        { type: "paragraph", content: "" },
        { type: "paragraph", content: "Finite" },
      ],
    });
    const [emptyBlock, textBlock] = editor.document;
    const emptyPosition = resolveEditorTextPosition(editor, emptyBlock.id, 12);
    const zeroPosition = resolveEditorTextPosition(editor, textBlock.id, 0);

    expect(emptyPosition).not.toBeNull();
    expect(
      editor.prosemirrorView.state.doc.resolve(emptyPosition!).parent
        .inlineContent,
    ).toBe(true);
    expect(resolveEditorTextPosition(editor, textBlock.id, Number.NaN)).toBe(
      zeroPosition,
    );
    expect(
      resolveEditorTextPosition(editor, textBlock.id, Number.POSITIVE_INFINITY),
    ).toBe(zeroPosition);
    expect(
      resolveEditorTextPosition(editor, textBlock.id, Number.NEGATIVE_INFINITY),
    ).toBe(zeroPosition);
  });

  it("places the exact selection without requesting browser scrolling", () => {
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "Scroll target" }],
    });
    const blockId = editor.document[0].id;
    let dispatchedTransaction: { scrolledIntoView: boolean } | null = null;
    const tiptapEditor = getTestTiptapEditor(editor);
    const readTransaction = (payload: {
      transaction: { scrolledIntoView: boolean };
    }) => {
      dispatchedTransaction = payload.transaction;
    };
    tiptapEditor.on("transaction", readTransaction);

    focusEditorAtPreviewAnchor(editor, {
      blockId,
      textOffset: 6,
    });

    expect(dispatchedTransaction?.scrolledIntoView).toBe(false);
    expect(editor.prosemirrorView.state.selection.$from.parentOffset).toBe(6);
    tiptapEditor.off("transaction", readTransaction);
  });

  it("falls back safely when the block ID is missing", () => {
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "Known" }],
    });
    const fallback = vi.spyOn(editor, "setTextCursorPosition");

    expect(() =>
      focusEditorAtPreviewAnchor(editor, {
        blockId: "missing-block",
        textOffset: 4,
      }),
    ).not.toThrow();
    expect(fallback).not.toHaveBeenCalled();
  });

  it.each(["resolve", "dispatch"] as const)(
    "falls back safely when ProseMirror %s fails",
    (failure) => {
      const editor = CoreBlockNoteEditor.create({
        schema: editorSchema,
        initialContent: [{ type: "paragraph", content: "Fallback" }],
      });
      const blockId = editor.document[0].id;
      const view = editor.prosemirrorView;
      if (failure === "resolve") {
        vi.spyOn(view.state.doc, "resolve").mockImplementationOnce(() => {
          throw new Error("selection failed");
        });
      } else {
        vi.spyOn(
          getTestTiptapEditor(editor),
          "dispatchTransaction",
        ).mockImplementationOnce(() => {
          throw new Error("dispatch failed");
        });
      }
      const fallback = vi.spyOn(editor, "setTextCursorPosition");

      expect(() =>
        focusEditorAtPreviewAnchor(editor, {
          blockId,
          textOffset: 4,
        }),
      ).not.toThrow();
      expect(fallback).not.toHaveBeenCalled();
    },
  );

  it("falls back to the BlockNote cursor API for a non-text image block", () => {
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "image",
          props: { url: "https://example.com/image.png" },
        },
      ],
    });
    const blockId = editor.document[0].id;
    const setTextCursorPosition = vi.spyOn(editor, "setTextCursorPosition");

    focusEditorAtPreviewAnchor(editor, { blockId, textOffset: 42 });

    expect(setTextCursorPosition).not.toHaveBeenCalled();
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

describe("BlockNoteEditor formatting toolbar", () => {
  it("shows an inline code action in the floating formatting toolbar", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "测试" }],
    });

    const { container } = render(
      createElement(
        BlockNoteView,
        {
          editor,
          formattingToolbar: false,
        },
        createElement(EditorFormattingToolbar),
      ),
    );

    editor.setTextCursorPosition(editor.document[0].id, "start");

    act(() => {
      editor.getExtension(FormattingToolbarExtension)?.store.setState(true);
    });

    await waitFor(() => {
      expect(
        container.querySelector(
          'button[aria-label="Inline code (persists in markdown)"]',
        ),
      ).not.toBe(null);
    });
  });

  it("turns selected markdown inline code markers into a code style", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "`test`" }],
    });

    const { container } = render(
      createElement(
        BlockNoteView,
        {
          editor,
          formattingToolbar: false,
        },
        createElement(EditorFormattingToolbar),
      ),
    );

    selectTextByContent(editor, "`test`");

    act(() => {
      editor.getExtension(FormattingToolbarExtension)?.store.setState(true);
    });

    const button = await waitFor(() => {
      const action = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Inline code (persists in markdown)"]',
      );
      expect(action).not.toBe(null);
      return action!;
    });

    fireEvent.click(button);

    expect(editor.document[0].content).toEqual([
      {
        type: "text",
        text: "test",
        styles: {
          code: true,
        },
      },
    ]);
  });
});

describe("BlockNoteEditor outline navigation focus", () => {
  it("moves the outline cursor without requesting an unmanaged selection scroll", () => {
    const calls: string[] = [];
    const editor = {
      getBlock: vi.fn(() => ({ id: "heading-1", type: "heading" })),
      focus: vi.fn(() => calls.push("focus")),
      setTextCursorPosition: vi.fn(() => calls.push("set-cursor")),
    };

    expect(focusEditorOutlineBlock(editor, "heading-1")).toBe(true);

    expect(calls).toEqual(["set-cursor"]);
    expect(editor.focus).not.toHaveBeenCalled();
    expect(editor.setTextCursorPosition).toHaveBeenCalledWith(
      "heading-1",
      "start",
    );
  });

  it("does not fall back to a scrolling cursor API when ProseMirror fails", () => {
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        { type: "heading", props: { level: 1 }, content: "Heading" },
      ],
    });
    const blockId = editor.document[0].id;
    vi.spyOn(
      getTestTiptapEditor(editor),
      "dispatchTransaction",
    ).mockImplementationOnce(() => {
      throw new Error("dispatch failed");
    });
    const fallback = vi.spyOn(editor, "setTextCursorPosition");

    expect(focusEditorOutlineBlock(editor, blockId)).toBe(false);
    expect(fallback).not.toHaveBeenCalled();
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

describe("BlockNoteEditor persistent session runtime", () => {
  it("keeps the live editor surface opaque at reduced window opacity", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    setupSessionTab("C:/notes/opaque-surface.md");
    const appearance = useEditorStore.getState().appearance;
    useEditorStore.setState({
      appearance: { ...appearance, opacity: 60 },
    });
    const session = renderRealSession("C:/notes/opaque-surface.md");

    try {
      await waitFor(() => expect(session.runtime.current).not.toBeNull());
      expect(
        session.view.container.querySelector<HTMLElement>(".editor-rich-scroll")
          ?.style.opacity,
      ).toBe("");
      expect(session.surface.dataset.richSurfaceOpacity).toBe("0.6");
    } finally {
      useEditorStore.setState({ appearance });
      session.view.unmount();
    }
  });

  it("does not create a core editor for a render that never commits", () => {
    setupMatchMedia();
    setupDomMeasurements();
    setupSessionTab("C:/notes/discarded.md");
    const createEditor = vi.spyOn(CoreBlockNoteEditor, "create");
    const session = createRealSession("C:/notes/discarded.md");

    try {
      renderToString(session.editor);
    } catch {
      // 当前实现会在 SSR 深入 BlockNote 子树后失败；本用例只观察 commit 前是否构造 core editor。
    }

    expect(createEditor).not.toHaveBeenCalled();
    expect(session.runtime.current).toBeNull();
  });

  it("uses normalized path identity for runtime state and a real preview cache", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    setupSessionTab("C:\\notes\\shared.md", {
      isDirty: true,
      loadStatus: "loading",
      saveStatus: "saving",
    });
    const seed = vi.spyOn(RichPreviewCache.prototype, "seed");
    const handleTransaction = vi.spyOn(
      RichPreviewCache.prototype,
      "handleTransaction",
    );
    const session = renderRealSession("C:/notes/shared.md");

    await waitFor(() => expect(session.runtime.current).not.toBeNull());
    const runtime = session.runtime.current!;

    expect(runtime.isDirty()).toBe(true);
    expect(runtime.isSaving()).toBe(true);
    expect(runtime.isReloading()).toBe(true);
    expect(seed).toHaveBeenCalledTimes(1);
    expect(runtime.previewCache).toBeInstanceOf(RichPreviewCache);

    const scrollContainer = session.view.container.querySelector<HTMLElement>(
      ".editor-rich-scroll",
    );
    expect(scrollContainer).not.toBeNull();
    scrollContainer!.scrollTop = 84;
    expect(runtime.readViewState().scrollTop).toBe(84);
    runtime.restoreViewState({ scrollTop: 21, selection: null });
    expect(scrollContainer!.scrollTop).toBe(21);

    const transactionCount = handleTransaction.mock.calls.length;
    editorPerformanceMocks.measure.mockClear();
    act(() => {
      runtime.editor.updateBlock(runtime.editor.document[0], {
        content: "Changed once",
      });
    });
    expect(handleTransaction).toHaveBeenCalledTimes(transactionCount + 1);
    expect(editorPerformanceMocks.measure).toHaveBeenCalledWith(
      "editor:transaction",
      expect.any(Function),
    );

    vi.stubEnv("DEV", false);
    editorPerformanceMocks.measure.mockClear();
    const productionTransactionCount = handleTransaction.mock.calls.length;
    act(() => {
      runtime.editor.updateBlock(runtime.editor.document[0], {
        content: "Production direct change",
      });
    });
    expect(handleTransaction).toHaveBeenCalledTimes(
      productionTransactionCount + 1,
    );
    expect(editorPerformanceMocks.measure).not.toHaveBeenCalled();

    const initialRuntime = session.runtime.current;
    const initialEditor = runtime.editor;
    session.view.rerender(
      createElement(BlockNoteEditor, {
        content: "# Reloaded",
        controller: session.controller,
        reloadKey: 1,
        surface: session.surface,
      }),
    );
    await waitFor(() =>
      expect(JSON.stringify(initialEditor.document)).toContain("Reloaded"),
    );
    expect(session.runtime.current).toBe(initialRuntime);
    expect(session.runtime.current?.editor).toBe(initialEditor);

    session.view.unmount();
  });

  it("cancels a previous pane outline scroll when restoring view state", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    const path = "C:/notes/outline-pane-switch.md";
    setupSessionTab(path);
    const session = renderRealSession(path);

    await waitFor(() => expect(session.runtime.current).not.toBeNull());
    const runtime = session.runtime.current!;
    const scrollContainer = session.view.container.querySelector<HTMLElement>(
      ".editor-rich-scroll",
    )!;
    const blockId = runtime.editor.document[0].id;
    const target = runtime.editor.domElement.querySelector<HTMLElement>(
      `[data-id="${blockId}"]`,
    )!;
    const scheduledFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        scheduledFrames.push(callback);
        return scheduledFrames.length;
      }),
    );
    vi.spyOn(scrollContainer, "getBoundingClientRect").mockReturnValue({
      ...createRect(),
      top: 0,
    });
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      ...createRect(),
      top: 120,
    });

    expect(runtime.scrollToBlock(blockId)).toBe(true);
    expect(scrollContainer.scrollTop).toBeGreaterThan(0);
    runtime.restoreViewState({ scrollTop: 21, selection: null });
    act(() => {
      for (const callback of scheduledFrames.splice(0)) callback(0);
    });

    expect(scrollContainer.scrollTop).toBe(21);
    session.view.unmount();
  });

  it("does not persist a programmatic pane scroll restoration as user scroll", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    const path = "C:/notes/programmatic-pane-scroll.md";
    setupSessionTab(path);
    const session = renderRealSession(path);

    await waitFor(() => expect(session.runtime.current).not.toBeNull());
    const runtime = session.runtime.current!;
    const scrollContainer = session.view.container.querySelector<HTMLElement>(
      ".editor-rich-scroll",
    )!;
    const patch = vi.spyOn(richPaneViewStateRegistry, "patch");

    runtime.restoreViewState({ scrollTop: 240, selection: null });
    fireEvent.scroll(scrollContainer);

    expect(patch).not.toHaveBeenCalled();
    session.view.unmount();
  });

  it("does not capture an intermediate scroll position during rapid pane restoration", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    const path = "C:/notes/rapid-pane-scroll.md";
    setupSessionTab(path);
    const session = renderRealSession(path);

    await waitFor(() => expect(session.runtime.current).not.toBeNull());
    const runtime = session.runtime.current!;
    const scrollContainer = session.view.container.querySelector<HTMLElement>(
      ".editor-rich-scroll",
    )!;
    const captureVisualSnapshot = vi.spyOn(
      runtime.previewCache,
      "captureVisualSnapshot",
    );

    runtime.restoreViewState({ scrollTop: 720, selection: null });
    scrollContainer.scrollTop = 940;

    expect(runtime.readViewState().scrollTop).toBe(720);
    runtime.captureVisualSnapshot?.();
    expect(captureVisualSnapshot).not.toHaveBeenCalled();
    fireEvent.wheel(scrollContainer);
    expect(runtime.readViewState().scrollTop).toBe(940);
    runtime.captureVisualSnapshot?.();
    expect(captureVisualSnapshot).toHaveBeenCalledOnce();
    session.view.unmount();
  });

  it("cancels stale pane scroll correction before focusing from a preview", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    const path = "C:/notes/preview-pane-focus.md";
    setupSessionTab(path);
    const session = renderRealSession(path);

    await waitFor(() => expect(session.runtime.current).not.toBeNull());
    const runtime = session.runtime.current!;
    const scrollContainer = session.view.container.querySelector<HTMLElement>(
      ".editor-rich-scroll",
    )!;
    const blockId = runtime.editor.document[0].id;
    const target = runtime.editor.domElement.querySelector<HTMLElement>(
      `[data-id="${blockId}"]`,
    )!;
    const scheduledFrames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        scheduledFrames.push(callback);
        return scheduledFrames.length;
      }),
    );
    vi.spyOn(scrollContainer, "getBoundingClientRect").mockReturnValue({
      ...createRect(),
      top: 0,
    });
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      ...createRect(),
      top: 120,
    });

    runtime.restoreViewState({
      scrollTop: 240,
      selection: null,
      topBlockId: blockId,
      topBlockOffset: 20,
    });
    runtime.focusAt(null);
    scrollContainer.scrollTop = 360;
    act(() => {
      for (const callback of scheduledFrames.splice(0)) callback(0);
    });

    expect(scrollContainer.scrollTop).toBe(360);
    session.view.unmount();
  });

  it("reads viewport anchors from BlockNote block wrappers, not nested data ids", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    const path = "C:/notes/block-wrapper-anchor.md";
    setupSessionTab(path);
    const session = renderRealSession(path);

    await waitFor(() => expect(session.runtime.current).not.toBeNull());
    const runtime = session.runtime.current!;
    const blockId = runtime.editor.document[0].id;
    const block = runtime.editor.domElement.querySelector<HTMLElement>(
      `[data-node-type="blockOuter"][data-id="${blockId}"]`,
    )!;
    const nestedDataId = document.createElement("span");
    nestedDataId.dataset.id = "suggestion-mark-id";
    block.append(nestedDataId);
    const scrollContainer = session.view.container.querySelector<HTMLElement>(
      ".editor-rich-scroll",
    )!;
    vi.spyOn(scrollContainer, "getBoundingClientRect").mockReturnValue({
      ...createRect(),
      bottom: 500,
      left: 0,
      right: 400,
      top: 100,
      width: 400,
    });
    vi.spyOn(
      runtime.editor.domElement,
      "getBoundingClientRect",
    ).mockReturnValue({
      ...createRect(),
      bottom: 500,
      left: 20,
      right: 400,
      top: 40,
    });
    vi.spyOn(block, "getBoundingClientRect").mockReturnValue({
      ...createRect(),
      bottom: 160,
      top: 80,
    });
    const originalElementFromPoint = Object.getOwnPropertyDescriptor(
      document,
      "elementFromPoint",
    );
    const elementFromPoint = vi.fn(() => nestedDataId);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: elementFromPoint,
    });

    let viewState: ReturnType<RichBlockNoteRuntime["readViewState"]>;
    try {
      viewState = runtime.readViewState();
    } finally {
      if (originalElementFromPoint) {
        Object.defineProperty(
          document,
          "elementFromPoint",
          originalElementFromPoint,
        );
      } else {
        Reflect.deleteProperty(document, "elementFromPoint");
      }
    }
    expect(elementFromPoint).toHaveBeenCalledWith(210, 124);
    expect(viewState).toMatchObject({
      topBlockId: blockId,
      topBlockOffset: 20,
    });
    session.view.unmount();
  });

  it("does not inherit another pane selection when target selection is empty", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    const path = "C:/notes/empty-pane-selection.md";
    setupSessionTab(path);
    const session = renderRealSession(path);

    await waitFor(() => expect(session.runtime.current).not.toBeNull());
    const runtime = session.runtime.current!;
    const firstBlock = runtime.editor.document[0];
    const secondBlock = runtime.editor.insertBlocks(
      [{ type: "paragraph", content: "Second pane selection" }],
      firstBlock,
      "after",
    )[0];
    runtime.editor.setTextCursorPosition(secondBlock, "start");

    runtime.restoreViewState({ scrollTop: 0, selection: null });

    expect(runtime.editor.getTextCursorPosition().block.id).toBe(firstBlock.id);
    session.view.unmount();
  });

  it("coalesces live scroll bursts and flushes on blur and runtime destruction", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    const path = "C:/notes/scroll-idle.md";
    setupSessionTab(path);
    const session = renderRealSession(path);

    await waitFor(() => expect(session.runtime.current).not.toBeNull());
    const runtime = session.runtime.current!;
    const scrollContainer = session.view.container.querySelector<HTMLElement>(
      ".editor-rich-scroll",
    )!;
    const setTabScrollTop = vi.spyOn(
      useEditorStore.getState(),
      "setTabScrollTop",
    );
    vi.useFakeTimers();

    fireEvent.wheel(scrollContainer);
    for (const scrollTop of [20, 60, 140]) {
      scrollContainer.scrollTop = scrollTop;
      fireEvent.scroll(scrollContainer);
    }

    expect(
      richPaneViewStateRegistry.read("group-session:tab-session").scrollTop,
    ).toBe(140);
    expect(setTabScrollTop).not.toHaveBeenCalled();

    surfaceAsAnotherPane(session.surface);
    scrollContainer.scrollTop = 180;
    fireEvent.scroll(scrollContainer);
    expect(
      richPaneViewStateRegistry.read("group-session:tab-session").scrollTop,
    ).toBe(140);
    session.surface.dataset.activePaneKey = "group-session:tab-session";

    act(() => vi.advanceTimersByTime(149));
    expect(setTabScrollTop).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(setTabScrollTop).toHaveBeenCalledTimes(1);
    expect(setTabScrollTop).toHaveBeenLastCalledWith(
      "group-session",
      "tab-session",
      140,
    );

    fireEvent.wheel(scrollContainer);
    scrollContainer.scrollTop = 220;
    fireEvent.scroll(scrollContainer);
    fireEvent.blur(scrollContainer);
    expect(setTabScrollTop).toHaveBeenCalledTimes(2);
    expect(setTabScrollTop).toHaveBeenLastCalledWith(
      "group-session",
      "tab-session",
      220,
    );

    fireEvent.wheel(scrollContainer);
    scrollContainer.scrollTop = 360;
    fireEvent.scroll(scrollContainer);
    runtime.destroy();
    expect(setTabScrollTop).toHaveBeenCalledTimes(3);
    expect(setTabScrollTop).toHaveBeenLastCalledWith(
      "group-session",
      "tab-session",
      360,
    );
    act(() => vi.runOnlyPendingTimers());
    expect(setTabScrollTop).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
    session.view.unmount();
  });

  it("activates the outline at the quarter-viewport line and rejects a stale pane owner", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    const path = "C:/notes/outline-scroll-spy.md";
    const content = "# First\nIntro\n## Second\nDetails";
    setupSessionTab(path, { content });
    const session = renderRealSession(path, false, content);

    await waitFor(() => expect(session.runtime.current).not.toBeNull());
    await waitFor(() =>
      expect(
        useEditorStore.getState().outlineHeadingsByPath[path],
      ).toHaveLength(2),
    );
    const runtime = session.runtime.current!;
    const scrollContainer = session.view.container.querySelector<HTMLElement>(
      ".editor-rich-scroll",
    )!;
    const [firstHeading, intro, secondHeading, details] =
      runtime.editor.document;
    const introElement = runtime.editor.domElement.querySelector<HTMLElement>(
      `[data-id="${intro.id}"]`,
    )!;
    const detailsElement = runtime.editor.domElement.querySelector<HTMLElement>(
      `[data-id="${details.id}"]`,
    )!;
    const editorBounds = {
      ...createRect(),
      bottom: 500,
      height: 400,
      right: 400,
      top: 100,
      width: 400,
    };
    vi.spyOn(scrollContainer, "getBoundingClientRect").mockReturnValue(
      editorBounds,
    );
    vi.spyOn(
      runtime.editor.domElement,
      "getBoundingClientRect",
    ).mockReturnValue(editorBounds);
    const scheduledFrames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        scheduledFrames.push(callback);
        return scheduledFrames.length;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const originalElementFromPoint = Object.getOwnPropertyDescriptor(
      document,
      "elementFromPoint",
    );
    const elementFromPoint = vi.fn((_x: number, y: number) =>
      y >= 200 ? detailsElement : introElement,
    );
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: elementFromPoint,
    });
    useEditorStore.setState({
      activeHeadingIdByPane: {
        "group-other:tab-other": firstHeading.id,
        "group-session:tab-session": firstHeading.id,
      },
    });

    try {
      scrollContainer.scrollTop = 120;
      fireEvent.scroll(scrollContainer);
      scrollContainer.scrollTop = 240;
      fireEvent.scroll(scrollContainer);
      expect(scheduledFrames).toHaveLength(1);

      surfaceAsAnotherPane(session.surface);
      act(() => scheduledFrames.shift()?.(16));
      expect(
        useEditorStore.getState().activeHeadingIdByPane[
          "group-session:tab-session"
        ],
      ).toBe(firstHeading.id);

      session.surface.dataset.activePaneKey = "group-session:tab-session";
      fireEvent.scroll(scrollContainer);
      act(() => scheduledFrames.shift()?.(32));
      expect(elementFromPoint).toHaveBeenCalledWith(200, 200);
      expect(useEditorStore.getState().activeHeadingIdByPane).toMatchObject({
        "group-other:tab-other": firstHeading.id,
        "group-session:tab-session": secondHeading.id,
      });
    } finally {
      if (originalElementFromPoint) {
        Object.defineProperty(
          document,
          "elementFromPoint",
          originalElementFromPoint,
        );
      } else {
        Reflect.deleteProperty(document, "elementFromPoint");
      }
    }

    session.view.unmount();
  });

  it("flushes the owning pane on tab switch and unmount boundaries", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    const path = "C:/notes/scroll-boundary.md";
    setupSessionTab(path);
    useEditorStore.setState((state) => ({
      panelGroups: state.panelGroups.map((group) => ({
        ...group,
        tabs: [
          ...group.tabs,
          { ...group.tabs[0], id: "tab-next", scrollTop: 0 },
        ],
      })),
    }));
    const session = renderRealSession(path);

    await waitFor(() => expect(session.runtime.current).not.toBeNull());
    const scrollContainer = session.view.container.querySelector<HTMLElement>(
      ".editor-rich-scroll",
    )!;
    const setTabScrollTop = vi.spyOn(
      useEditorStore.getState(),
      "setTabScrollTop",
    );
    vi.useFakeTimers();

    fireEvent.wheel(scrollContainer);
    scrollContainer.scrollTop = 180;
    fireEvent.scroll(scrollContainer);
    act(() => {
      useEditorStore.getState().setActiveTab("group-session", "tab-next");
    });
    expect(setTabScrollTop).toHaveBeenCalledTimes(1);
    expect(setTabScrollTop).toHaveBeenLastCalledWith(
      "group-session",
      "tab-session",
      180,
    );

    act(() => {
      useEditorStore.getState().setActiveTab("group-session", "tab-session");
    });
    fireEvent.wheel(scrollContainer);
    scrollContainer.scrollTop = 280;
    fireEvent.scroll(scrollContainer);
    session.view.unmount();
    expect(setTabScrollTop).toHaveBeenCalledTimes(2);
    expect(setTabScrollTop).toHaveBeenLastCalledWith(
      "group-session",
      "tab-session",
      280,
    );
    act(() => vi.runOnlyPendingTimers());
    expect(setTabScrollTop).toHaveBeenCalledTimes(2);
  });

  it("flushes a closed pane without writing into its replacement tab", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    const path = "C:/notes/scroll-close.md";
    setupSessionTab(path);
    useEditorStore.setState((state) => ({
      panelGroups: state.panelGroups.map((group) => ({
        ...group,
        tabs: [
          ...group.tabs,
          { ...group.tabs[0], id: "tab-next", scrollTop: 0 },
        ],
      })),
    }));
    const session = renderRealSession(path);

    await waitFor(() => expect(session.runtime.current).not.toBeNull());
    const scrollContainer = session.view.container.querySelector<HTMLElement>(
      ".editor-rich-scroll",
    )!;
    const setTabScrollTop = vi.spyOn(
      useEditorStore.getState(),
      "setTabScrollTop",
    );
    vi.useFakeTimers();

    fireEvent.wheel(scrollContainer);
    scrollContainer.scrollTop = 410;
    fireEvent.scroll(scrollContainer);
    act(() => {
      useEditorStore.getState().removeTab("group-session", "tab-session");
    });
    act(() => vi.advanceTimersByTime(150));

    expect(setTabScrollTop).toHaveBeenCalledTimes(1);
    expect(setTabScrollTop).toHaveBeenCalledWith(
      "group-session",
      "tab-session",
      410,
    );
    expect(
      useEditorStore
        .getState()
        .panelGroups[0].tabs.find((tab) => tab.id === "tab-next")?.scrollTop,
    ).toBe(0);
    session.view.unmount();
  });

  it("does not destroy the owned editor during StrictMode rehearsal", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    setupSessionTab("C:/notes/strict.md");
    const createEditor = vi.spyOn(CoreBlockNoteEditor, "create");
    const handleTransaction = vi.spyOn(
      RichPreviewCache.prototype,
      "handleTransaction",
    );
    const session = renderRealSession("C:/notes/strict.md", true);

    await waitFor(() => expect(session.runtime.current).not.toBeNull());
    expect(createEditor).toHaveBeenCalledTimes(1);
    const runtime = session.runtime.current!;
    // oxlint-disable-next-line eslint/no-underscore-dangle
    const destroy = vi.spyOn(runtime.editor._tiptapEditor, "destroy");

    expect(runtime.editor.document[0]).toBeDefined();
    expect(destroy).not.toHaveBeenCalled();
    session.view.unmount();

    await waitFor(() => expect(destroy).toHaveBeenCalledTimes(1));
    // oxlint-disable-next-line eslint/no-underscore-dangle
    expect(runtime.editor._tiptapEditor.isDestroyed).toBe(true);
    expect(session.runtime.current).toBeNull();

    const transactionCalls = handleTransaction.mock.calls.length;
    // oxlint-disable-next-line eslint/no-underscore-dangle
    const tiptapEditor = runtime.editor._tiptapEditor;
    tiptapEditor.emit("transaction", {
      editor: tiptapEditor,
      transaction: tiptapEditor.state.tr,
    });
    expect(handleTransaction).toHaveBeenCalledTimes(transactionCalls);

    setupSessionTab("C:/notes/strict.md");
    const remounted = renderRealSession("C:/notes/strict.md", true);
    await waitFor(() => expect(remounted.runtime.current).not.toBeNull());
    expect(createEditor).toHaveBeenCalledTimes(2);
    expect(remounted.runtime.current?.editor).not.toBe(runtime.editor);
    // oxlint-disable eslint/no-underscore-dangle
    const remountedTiptapEditor =
      remounted.runtime.current!.editor._tiptapEditor;
    // oxlint-enable eslint/no-underscore-dangle
    const remountedDestroy = vi.spyOn(remountedTiptapEditor, "destroy");
    remounted.view.unmount();
    await waitFor(() => expect(remountedDestroy).toHaveBeenCalledTimes(1));
  });

  it("drops an in-flight serialization after the runtime is destroyed", async () => {
    setupMatchMedia();
    setupDomMeasurements();
    setupSessionTab("C:/notes/deferred.md");
    useDiffStore.setState({
      isOpen: true,
      filePath: "C:/notes/deferred.md",
      oldContent: "# Initial",
    });
    const session = renderRealSession("C:/notes/deferred.md");

    await waitFor(() => expect(session.runtime.current).not.toBeNull());
    await waitFor(() =>
      expect(markdownMocks.serializeMarkdown).toHaveBeenCalled(),
    );
    await act(async () => {
      await markdownMocks.serializeMarkdown.mock.results[0]?.value;
    });

    const deferred = createDeferred<string>();
    markdownMocks.serializeMarkdown.mockClear();
    markdownMocks.serializeMarkdown.mockImplementationOnce(
      () => deferred.promise,
    );
    session.callbacks.onMarkdownChange.mockClear();
    session.callbacks.onWordCountChange.mockClear();
    const cacheContent = vi.spyOn(editorCache, "setContent");
    const cacheBlocks = vi.spyOn(editorCache, "setBlocks");
    const scheduleSave = vi.spyOn(editorSaveCoordinator, "schedule");
    const updateDiff = vi.spyOn(useDiffStore.getState(), "updateContent");
    const runtime = session.runtime.current!;
    const scrollContainer = session.view.container.querySelector<HTMLElement>(
      ".editor-rich-scroll",
    )!;

    fireEvent.keyDown(scrollContainer, {
      altKey: false,
      ctrlKey: false,
      key: "x",
      metaKey: false,
    });
    act(() => {
      runtime.editor.updateBlock(runtime.editor.document[0], {
        content: "Deferred change",
      });
    });
    const flushPromise = runtime.serializePendingChange();
    await waitFor(() =>
      expect(markdownMocks.serializeMarkdown).toHaveBeenCalledTimes(1),
    );

    runtime.destroy();
    cacheContent.mockClear();
    cacheBlocks.mockClear();
    deferred.resolve("# Deferred change");
    await act(async () => {
      await flushPromise;
    });

    expect(session.callbacks.onMarkdownChange).not.toHaveBeenCalled();
    expect(session.callbacks.onWordCountChange).not.toHaveBeenCalled();
    expect(updateDiff).not.toHaveBeenCalled();
    expect(scheduleSave).not.toHaveBeenCalled();
    expect(cacheContent).not.toHaveBeenCalled();
    expect(cacheBlocks).not.toHaveBeenCalled();

    session.view.unmount();
  });
});

function setupSessionTab(
  path: string,
  patch: Partial<EditorPanelGroup["tabs"][number]> = {},
): void {
  useEditorStore.setState({
    activeGroupId: "group-session",
    panelGroups: [
      {
        id: "group-session",
        activeTabId: "tab-session",
        direction: "horizontal",
        tabs: [
          {
            id: "tab-session",
            filePath: path,
            pendingFilePath: null,
            content: "# Initial",
            wordCount: 9,
            isDirty: false,
            reloadKey: 0,
            mode: "rich",
            loadStatus: "ready",
            saveStatus: "clean",
            errorMessage: null,
            parseErrorMessage: null,
            scrollTop: 0,
            ...patch,
          },
        ],
      },
    ],
  });
}

function renderRealSession(
  path: string,
  strict = false,
  sourceContent = "# Initial",
) {
  const session = createRealSession(path, sourceContent);
  const view = render(
    strict ? createElement(StrictMode, null, session.editor) : session.editor,
  );
  return { ...session, view };
}

function createRealSession(path: string, sourceContent = "# Initial") {
  const runtime = { current: null as RichBlockNoteRuntime | null };
  const callbacks = {
    onMarkdownChange: vi.fn((content: string) => {
      const diffState = useDiffStore.getState();
      if (diffState.isOpen && diffState.filePath === path) {
        diffState.updateContent(diffState.oldContent, content);
      }
      editorSaveCoordinator.schedule(path, content);
    }),
    onWordCountChange: vi.fn(),
    onParseStateChange: vi.fn(),
  };
  const controller: RichEditorSessionController = {
    path,
    getActiveBinding: () => ({
      groupId: "group-session",
      tabId: "tab-session",
      paneKey: "group-session:tab-session",
      path,
    }),
    getBoundTabIds: () => ["tab-session"],
    onMarkdownChange: callbacks.onMarkdownChange,
    onWordCountChange: callbacks.onWordCountChange,
    onParseStateChange: callbacks.onParseStateChange,
    onRuntimeReady: (nextRuntime) => {
      runtime.current = nextRuntime;
      return () => {
        if (runtime.current === nextRuntime) runtime.current = null;
      };
    },
  };
  const surface = document.createElement("div");
  surface.dataset.activePaneKey = "group-session:tab-session";
  const editor = createElement(BlockNoteEditor, {
    content: sourceContent,
    controller,
    reloadKey: 0,
    surface,
  });
  return { callbacks, controller, editor, runtime, surface };
}

function surfaceAsAnotherPane(surface: HTMLElement): void {
  surface.dataset.activePaneKey = "group-other:tab-other";
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
