import { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { EditorView } from "@codemirror/view";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  editorBlockSpecs,
  editorCodeBlockSupportedLanguages,
  editorSchema,
} from "./blocknote-schema";
import { shouldStopEditorCodeBlockNodeViewEvent } from "./editor-code-block-node-view";
import * as blocknoteSchemaModule from "./blocknote-schema";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  setupCodeMirrorDomMeasurements();
});

function setupCodeMirrorDomMeasurements() {
  const createRect = () =>
    ({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  const createRectList = () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: function* iterator() {
        yield* [];
      },
    }) as DOMRectList;

  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: createRect,
  });
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: createRectList,
  });
  Object.defineProperty(document, "elementsFromPoint", {
    configurable: true,
    value: () => [],
  });
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

function setupClipboardEvent() {
  Object.defineProperty(window, "ClipboardEvent", {
    configurable: true,
    value: Event,
  });
  Object.defineProperty(globalThis, "ClipboardEvent", {
    configurable: true,
    value: Event,
  });
}

function simulateTextInput(editor: BlockNoteEditor, text: string) {
  const view = editor.prosemirrorView;
  const { from, to } = view.state.selection;
  const fallback = () => view.state.tr.insertText(text, from, to);
  const handled = view.someProp("handleTextInput", (handler) =>
    handler(view, from, to, text, fallback),
  );

  if (!handled) {
    view.dispatch(fallback());
  }
}

function typeString(editor: BlockNoteEditor, value: string) {
  for (const character of value) {
    simulateTextInput(editor, character);
  }
}

function getInlineText(block: { content: unknown }) {
  return (block.content as Array<{ type: string; text: string }>)
    .map((content) => content.text)
    .join("");
}

function getDocumentSummary(editor: BlockNoteEditor) {
  return editor.document.map((block) => ({
    text: getInlineText(block),
    type: block.type,
  }));
}

function pressKey(editor: BlockNoteEditor, key: string) {
  const view = editor.prosemirrorView;
  const event = new KeyboardEvent("keydown", { key });
  view.someProp("handleKeyDown", (handler) => handler(view, event));
}

function getCodeMirrorView(container: HTMLElement) {
  const editorElement = container.querySelector<HTMLElement>(
    ".editor-code-block__codemirror .cm-editor",
  );
  expect(editorElement).not.toBe(null);

  const view = EditorView.findFromDOM(editorElement as HTMLElement);
  expect(view).not.toBe(null);

  return view as EditorView;
}

function readCodeBlockNodeViewStopDecision(target: Element, eventType: string) {
  let decision: boolean | undefined;
  target.addEventListener(
    eventType,
    (event) => {
      decision = shouldStopEditorCodeBlockNodeViewEvent(event);
    },
    { once: true },
  );
  target.dispatchEvent(
    new MouseEvent(eventType, {
      bubbles: true,
      cancelable: true,
    }),
  );

  return decision;
}

describe("editor BlockNote schema", () => {
  it("replaces the default code block while preserving common blocks", () => {
    expect(Object.keys(editorBlockSpecs)).toContain("paragraph");
    expect(Object.keys(editorBlockSpecs)).toContain("quote");
    expect(Object.keys(editorBlockSpecs)).toContain("checkListItem");
    expect(Object.keys(editorBlockSpecs)).toContain("bulletListItem");
    expect(editorBlockSpecs.codeBlock.config.type).toBe("codeBlock");
  });

  it("configures code block supported language metadata", () => {
    expect(editorCodeBlockSupportedLanguages.javascript).toEqual({
      name: "JavaScript",
      aliases: ["js", "mjs", "cjs"],
    });
    expect(editorCodeBlockSupportedLanguages.typescript.aliases).toContain(
      "ts",
    );
    expect(editorCodeBlockSupportedLanguages.cpp.aliases).toContain("c++");
  });

  it("preserves code block extensions for input rules", () => {
    expect(editorBlockSpecs.codeBlock.extensions?.length).toBeGreaterThan(0);
    expect(editorBlockSpecs.codeBlock.implementation.toExternalHTML).toBeTypeOf(
      "function",
    );
  });

  it("lets parent editor continue selection drags over CodeMirror node views", () => {
    const codeMirror = document.createElement("div");
    codeMirror.className = "editor-code-block__codemirror";
    const content = document.createElement("div");
    content.className = "cm-content";
    const gutter = document.createElement("div");
    gutter.className = "cm-gutters";
    codeMirror.append(content, gutter);

    expect(readCodeBlockNodeViewStopDecision(content, "mousemove")).toBe(false);
    expect(readCodeBlockNodeViewStopDecision(content, "mouseup")).toBe(false);
    expect(readCodeBlockNodeViewStopDecision(content, "mousedown")).toBe(true);
    expect(readCodeBlockNodeViewStopDecision(gutter, "mousemove")).toBe(true);
  });

  it("isolates code block DOM events from the outer ProseMirror editor like Milkdown", () => {
    const output = editorBlockSpecs.codeBlock.implementation.render.call(
      {
        blockContentDOMAttributes: {},
        props: undefined,
        renderType: "nodeView",
      },
      {
        id: "block-1",
        type: "codeBlock",
        props: { language: "ts" },
        content: "const a = 1",
        children: [],
      } as never,
      {
        isEditable: true,
        updateBlock: vi.fn(),
      } as never,
    ) as {
      destroy?: () => void;
      stopEvent?: (event: Event) => boolean;
    };

    expect(output.stopEvent?.(new KeyboardEvent("keydown"))).toBe(true);
    output.destroy?.();
  });

  it("renders code blocks as self-contained Milkdown-style CodeMirror node views", () => {
    const output = editorBlockSpecs.codeBlock.implementation.render.call(
      {
        blockContentDOMAttributes: {},
        props: undefined,
        renderType: "nodeView",
      },
      {
        id: "block-1",
        type: "codeBlock",
        props: { language: "json" },
        content: '{\n  "ok": true\n}',
        children: [],
      } as never,
      {
        isEditable: true,
        updateBlock: vi.fn(),
      } as never,
    ) as {
      contentDOM?: HTMLElement;
      destroy?: () => void;
      dom: HTMLElement;
      stopEvent?: (event: Event) => boolean;
    };

    expect(output.contentDOM).toBeUndefined();
    expect(output.stopEvent?.(new KeyboardEvent("keydown"))).toBe(true);
    expect(
      output.dom.querySelector(".editor-code-block__codemirror .cm-editor"),
    ).not.toBe(null);

    output.destroy?.();
  });

  it("does not expose a BlockNote Shiki highlighter for editor code blocks", () => {
    expect("createEditorCodeBlockHighlighter" in blocknoteSchemaModule).toBe(
      false,
    );
  });

  it("parses markdown bullet lines as sibling bullet list items", async () => {
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "" }],
    });
    const blocks = await editor.tryParseMarkdownToBlocks("* 1\n* 2\n* List");

    expect(
      blocks.map((block) => ({
        text: getInlineText(block),
        type: block.type,
      })),
    ).toEqual([
      { type: "bulletListItem", text: "1" },
      { type: "bulletListItem", text: "2" },
      { type: "bulletListItem", text: "List" },
    ]);
    expect(blocks.map(getInlineText).join("")).not.toContain("*");
  });

  it("continues typed bullet lists without leaving markdown markers in text", () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "" }],
    });
    render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "start");
    typeString(editor, "* ");
    typeString(editor, "1");
    pressKey(editor, "Enter");
    typeString(editor, "2");
    pressKey(editor, "Enter");
    typeString(editor, "List");

    expect(getDocumentSummary(editor)).toEqual([
      { type: "bulletListItem", text: "1" },
      { type: "bulletListItem", text: "2" },
      { type: "bulletListItem", text: "List" },
    ]);
    expect(editor.document.map(getInlineText).join("")).not.toContain("*");
  });

  it("pastes markdown bullet text as sibling bullet items instead of inline marker residue", () => {
    setupMatchMedia();
    setupClipboardEvent();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "" }],
    });
    render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "start");
    editor.pasteMarkdown("* 1\n* 2\n* List");

    expect(getDocumentSummary(editor)).toEqual([
      { type: "bulletListItem", text: "1" },
      { type: "bulletListItem", text: "2" },
      { type: "bulletListItem", text: "List" },
    ]);
    expect(editor.document.map(getInlineText).join("")).not.toContain("*");
  });

  it("pastes plain text bullet lines as sibling bullet items instead of inline marker residue", () => {
    setupMatchMedia();
    setupClipboardEvent();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "" }],
    });
    render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "start");
    editor.pasteText("* 1\n* 2\n* List");

    expect(getDocumentSummary(editor)).toEqual([
      { type: "bulletListItem", text: "1" },
      { type: "bulletListItem", text: "2" },
      { type: "bulletListItem", text: "List" },
    ]);
    expect(editor.document.map(getInlineText).join("")).not.toContain("*");
  });

  it("keeps Enter-created line breaks inside quote blocks", () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "quote",
          content: "这是引用",
        },
      ],
    });
    render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "end");
    pressKey(editor, "Enter");
    typeString(editor, "这是引用换行");

    expect(editor.document).toHaveLength(1);
    expect(editor.document[0].type).toBe("quote");
    expect(getInlineText(editor.document[0])).toBe("这是引用\n这是引用换行");
  });

  it("exits quote blocks after pressing Enter twice on an empty quote line", () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "quote",
          content: "这是引用",
        },
      ],
    });
    render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "end");
    pressKey(editor, "Enter");
    typeString(editor, "这是引用换行");
    pressKey(editor, "Enter");
    pressKey(editor, "Enter");
    typeString(editor, "跳出引用");

    expect(editor.document).toHaveLength(2);
    expect(editor.document[0].type).toBe("quote");
    expect(getInlineText(editor.document[0])).toBe("这是引用\n这是引用换行");
    expect(editor.document[1].type).toBe("paragraph");
    expect(getInlineText(editor.document[1])).toBe("跳出引用");
  });

  it("turns an input-rule-created empty quote block into a paragraph after Backspace", () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "paragraph",
          content: "",
        },
      ],
    });
    render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "start");
    typeString(editor, "> ");
    expect(editor.document[0].type).toBe("quote");

    pressKey(editor, "Backspace");

    expect(editor.document).toHaveLength(1);
    expect(editor.document[0].type).toBe("paragraph");
    expect(getInlineText(editor.document[0])).toBe("");
  });

  it("renders JavaScript code blocks with CodeMirror", async () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "codeBlock",
          props: { language: "js" },
          content: "const a = 1",
        },
      ],
    });

    const { container } = render(createElement(BlockNoteView, { editor }));

    await waitFor(
      () => {
        const token = container.querySelector<HTMLElement>(
          ".editor-code-block__codemirror .cm-editor",
        );

        expect(token).not.toBe(null);
        expect(
          container.querySelector(".editor-code-block__codemirror .cm-line"),
        ).not.toBe(null);
      },
      { timeout: 1000 },
    );
  });

  it("renders CodeMirror after creating a TypeScript code block from input", async () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "" }],
    });

    const { container } = render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "start");
    typeString(editor, "```ts ");
    typeString(editor, "const a = 1\nvar b = 2");

    await waitFor(
      () => {
        const token = container.querySelector<HTMLElement>(
          ".editor-code-block__codemirror .cm-editor",
        );

        expect(editor.document[0].type).toBe("codeBlock");
        expect(token).not.toBe(null);
        expect(
          container.querySelector(".editor-code-block__codemirror .cm-line"),
        ).not.toBe(null);
      },
      { timeout: 1000 },
    );
  });

  it("folds a real BlockNote code block with the CodeMirror gutter", async () => {
    setupMatchMedia();
    const user = userEvent.setup();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "codeBlock",
          props: { language: "ts" },
          content: "function demo() {\n  return 1;\n}\nnext();",
        },
      ],
    });

    const { container, findAllByTitle } = render(
      createElement(BlockNoteView, { editor }),
    );

    await user.click((await findAllByTitle("Fold line"))[0]);

    await waitFor(() => {
      expect(
        container.querySelectorAll(
          ".editor-code-block__codemirror [aria-label='folded code']",
        ).length,
      ).toBeGreaterThan(0);
      expect(getCodeMirrorView(container).state.doc.toString()).toBe(
        "function demo() {\n  return 1;\n}\nnext();",
      );
    });
  });

  it("folds a real JSON code block with the CodeMirror gutter", async () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "codeBlock",
          props: { language: "json" },
          content:
            '{\n  "accounts": [\n    {\n      "name": "FlexTV"\n    }\n  ]\n}',
        },
      ],
    });

    const { container, findAllByTitle } = render(
      createElement(BlockNoteView, { editor }),
    );
    const foldButtons = await findAllByTitle("Fold line");

    foldButtons[0].dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }),
    );

    await waitFor(() => {
      expect(
        container.querySelectorAll(
          ".editor-code-block__codemirror [aria-label='folded code']",
        ).length,
      ).toBeGreaterThan(0);
      expect(getCodeMirrorView(container).state.doc.toString()).toBe(
        '{\n  "accounts": [\n    {\n      "name": "FlexTV"\n    }\n  ]\n}',
      );
    });
  });

  it("selects only the real BlockNote code block content with command/control+a", async () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "codeBlock",
          props: { language: "ts" },
          content: "const value = 1;\nconsole.log(value);",
        },
      ],
    });

    const { container } = render(createElement(BlockNoteView, { editor }));

    await waitFor(() => {
      expect(getCodeMirrorView(container).state.doc.toString()).toBe(
        "const value = 1;\nconsole.log(value);",
      );
    });

    const view = getCodeMirrorView(container);
    view.focus();
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "a",
        metaKey: true,
      }),
    );

    await waitFor(() => {
      expect(getCodeMirrorView(container).state.selection.main.from).toBe(0);
      expect(getCodeMirrorView(container).state.selection.main.to).toBe(
        "const value = 1;\nconsole.log(value);".length,
      );
    });
  });

  it("focuses CodeMirror when clicking the code block blank shell", async () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "codeBlock",
          props: { language: "js" },
          content: "const a = 1",
        },
      ],
    });

    const { container } = render(createElement(BlockNoteView, { editor }));

    await waitFor(() => {
      expect(getCodeMirrorView(container).state.doc.toString()).toBe(
        "const a = 1",
      );
    });

    const shell = container.querySelector<HTMLElement>(
      ".editor-code-block-shell",
    );
    expect(shell).not.toBe(null);

    getCodeMirrorView(container).contentDOM.blur();
    fireEvent.mouseDown(shell as HTMLElement);

    expect(getCodeMirrorView(container).hasFocus).toBe(true);
  });

  it("shows a check icon after copying code from the CodeMirror node view", async () => {
    setupMatchMedia();
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "codeBlock",
          props: { language: "js" },
          content: "console.log('copied');",
        },
      ],
    });

    const { container } = render(createElement(BlockNoteView, { editor }));

    await waitFor(() => {
      expect(getCodeMirrorView(container).state.doc.toString()).toBe(
        "console.log('copied');",
      );
    });

    await user.click(container.querySelector(".editor-code-block-copy")!);

    expect(writeText).toHaveBeenCalledWith("console.log('copied');");
    expect(
      container.querySelector(
        '.editor-code-block-copy path[d="M20 6 9 17l-5-5"]',
      ),
    ).not.toBe(null);
  });

  it("closes the code language picker when clicking the code area", async () => {
    setupMatchMedia();
    const user = userEvent.setup();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "codeBlock",
          props: { language: "js" },
          content: "const a = 1",
        },
      ],
    });

    const { container, queryByRole } = render(
      createElement(BlockNoteView, { editor }),
    );

    await user.click(
      container.querySelector(".editor-code-block-language-trigger")!,
    );
    expect(queryByRole("dialog", { name: /code language/i })).not.toBe(null);

    container
      .querySelector(".editor-code-block__codemirror .cm-content")
      ?.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
        }),
      );

    expect(queryByRole("dialog", { name: /code language/i })).toBe(null);
  });

  it("removes a real empty BlockNote code block after Backspace in CodeMirror", async () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "codeBlock",
          props: { language: "ts" },
          content: "",
        },
      ],
    });

    const { container } = render(createElement(BlockNoteView, { editor }));

    await waitFor(() => {
      expect(getCodeMirrorView(container).state.doc.toString()).toBe("");
    });

    const view = getCodeMirrorView(container);
    view.focus();
    view.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Backspace",
      }),
    );

    await waitFor(() => {
      expect(editor.document[0].type).not.toBe("codeBlock");
    });
  });

  it("removes a real empty BlockNote code block after Backspace reaches the outer editor", () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "codeBlock",
          props: { language: "json" },
          content: "",
        },
      ],
    });
    render(createElement(BlockNoteView, { editor }));
    editor.setTextCursorPosition(editor.document[0].id, "start");

    editor.prosemirrorView.dom.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Backspace",
      }),
    );

    expect(editor.document[0].type).not.toBe("codeBlock");
  });
});
