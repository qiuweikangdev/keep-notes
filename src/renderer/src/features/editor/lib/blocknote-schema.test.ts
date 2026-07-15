import { BlockNoteEditor } from "@blocknote/core";
import { SideMenuExtension } from "@blocknote/core/extensions";
import { BlockNoteView } from "@blocknote/mantine";
import { foldEffect, foldable, foldedRanges } from "@codemirror/language";
import { EditorView, getDrawSelectionConfig } from "@codemirror/view";
import { AllSelection, NodeSelection, TextSelection } from "@tiptap/pm/state";
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
import { repairMarkdownSourceBeforeParse } from "./markdown";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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

function mockCursorCoordinatesAfterDetachedMeasure() {
  let measurementCount = 0;

  return vi
    .spyOn(EditorView.prototype, "coordsAtPos")
    .mockImplementation(() => {
      measurementCount += 1;
      if (measurementCount === 1) return null;

      return { bottom: 24, left: 100, right: 100, top: 4 };
    });
}

function mockCursorCoordinatesUntilLayoutIsReady() {
  let isLayoutReady = false;
  vi.spyOn(EditorView.prototype, "coordsAtPos").mockImplementation(() =>
    isLayoutReady ? { bottom: 24, left: 100, right: 100, top: 4 } : null,
  );

  return () => {
    isLayoutReady = true;
  };
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

  it("keeps the focused code block cursor continuously visible and emphasized", () => {
    const output = editorBlockSpecs.codeBlock.implementation.render.call(
      {
        blockContentDOMAttributes: {},
        props: undefined,
        renderType: "nodeView",
      },
      {
        id: "block-1",
        type: "codeBlock",
        props: { language: "text" },
        content: "",
        children: [],
      } as never,
      {
        isEditable: true,
        updateBlock: vi.fn(),
      } as never,
    ) as {
      destroy?: () => void;
      dom: HTMLElement;
    };
    const editorElement = output.dom.querySelector<HTMLElement>(
      ".editor-code-block__codemirror .cm-editor",
    );
    const view = EditorView.findFromDOM(editorElement as HTMLElement);

    expect(view).not.toBe(null);
    expect(
      getDrawSelectionConfig((view as EditorView).state).cursorBlinkRate,
    ).toBe(0);
    const cursorRules = Array.from(document.styleSheets)
      .flatMap((styleSheet) => Array.from(styleSheet.cssRules))
      .filter(
        (rule) =>
          rule instanceof CSSStyleRule &&
          rule.selectorText.includes(".cm-cursor"),
      );
    const cursorRule = cursorRules.find(
      (rule) =>
        (rule as CSSStyleRule).selectorText.endsWith(".cm-cursor") &&
        (rule as CSSStyleRule).style.getPropertyValue("border-left-color") ===
          "color-mix(in srgb, var(--accent-color) 60%, var(--text-primary))",
    );

    expect(cursorRule).not.toBeUndefined();
    expect(
      (cursorRule as CSSStyleRule).style.getPropertyValue("border-left-width"),
    ).toBe("2px");

    output.destroy?.();
  });

  it("continues undoing in BlockNote after CodeMirror history is exhausted", async () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "" }],
    });
    const { container } = render(createElement(BlockNoteView, { editor }));

    editor.insertBlocks(
      [{ type: "codeBlock", content: "" }],
      editor.document[0],
      "after",
    );

    await waitFor(() => {
      expect(editor.document.some((block) => block.type === "codeBlock")).toBe(
        true,
      );
    });
    const codeMirror = getCodeMirrorView(container);
    codeMirror.focus();
    codeMirror.dispatch({
      changes: { from: 0, insert: "const value = 1;" },
      userEvent: "input.type",
    });

    const undoModifier = /Mac|iPhone|iPad/.test(navigator.platform)
      ? { metaKey: true }
      : { ctrlKey: true };
    const undoInCodeMirror = () =>
      codeMirror.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "z",
          ...undoModifier,
        }),
      );

    undoInCodeMirror();
    await waitFor(() => {
      expect(codeMirror.state.doc.toString()).toBe("");
      expect(editor.document.some((block) => block.type === "codeBlock")).toBe(
        true,
      );
    });

    undoInCodeMirror();
    await waitFor(() => {
      expect(editor.document.some((block) => block.type === "codeBlock")).toBe(
        false,
      );
    });
  });

  it("undoes CodeMirror input one completed line at a time", async () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "codeBlock", content: "" }],
    });
    const { container } = render(createElement(BlockNoteView, { editor }));
    const codeMirror = getCodeMirrorView(container);
    codeMirror.focus();

    const typeCode = (text: string) => {
      const from = codeMirror.state.selection.main.from;
      codeMirror.dispatch({
        changes: { from, insert: text },
        selection: { anchor: from + text.length },
        userEvent: "input.type",
      });
    };
    const pressEnterInCodeMirror = () =>
      codeMirror.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      );

    typeCode("a");
    pressEnterInCodeMirror();
    typeCode("b");
    pressEnterInCodeMirror();
    typeCode("c");
    expect(codeMirror.state.doc.toString()).toBe("a\nb\nc");

    const undoModifier = /Mac|iPhone|iPad/.test(navigator.platform)
      ? { metaKey: true }
      : { ctrlKey: true };
    const undoInCodeMirror = () =>
      codeMirror.contentDOM.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "z",
          ...undoModifier,
        }),
      );

    undoInCodeMirror();
    expect(codeMirror.state.doc.toString()).toBe("a\nb");

    undoInCodeMirror();
    expect(codeMirror.state.doc.toString()).toBe("a");
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

  it("preserves the recovered first line in a malformed bash code block", async () => {
    const editor = BlockNoteEditor.create({ schema: editorSchema });
    const repaired = repairMarkdownSourceBeforeParse(
      "```bash写一个 while True 无限循环\n不断从数据库查任务\n```",
    );
    const blocks = await editor.tryParseMarkdownToBlocks(repaired);

    expect(blocks[0]).toMatchObject({
      type: "codeBlock",
      props: { language: "bash" },
    });
    expect(getInlineText(blocks[0])).toBe(
      "写一个 while True 无限循环\n不断从数据库查任务",
    );
  });

  it("parses markdown inline code as styled text instead of source markers", async () => {
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "" }],
    });
    const blocks = await editor.tryParseMarkdownToBlocks("这是 `测试` 文本");

    expect(getInlineText(blocks[0])).toBe("这是 测试 文本");
    expect(blocks[0].content).toEqual([
      {
        type: "text",
        text: "这是 ",
        styles: {},
      },
      {
        type: "text",
        text: "测试",
        styles: {
          code: true,
        },
      },
      {
        type: "text",
        text: " 文本",
        styles: {},
      },
    ]);
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

  it("undoes one completed bullet list item at a time", () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "" }],
    });
    render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "start");
    typeString(editor, "* ");
    typeString(editor, "a");
    pressKey(editor, "Enter");
    typeString(editor, "b");
    pressKey(editor, "Enter");
    typeString(editor, "c");

    expect(editor.undo()).toBe(true);
    expect(getDocumentSummary(editor)).toEqual([
      { type: "bulletListItem", text: "a" },
      { type: "bulletListItem", text: "b" },
    ]);

    expect(editor.undo()).toBe(true);
    expect(getDocumentSummary(editor)).toEqual([
      { type: "bulletListItem", text: "a" },
    ]);
  });

  it("converts typed markdown inline code after Chinese text into styled text", () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "" }],
    });
    const { container } = render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "start");
    typeString(editor, "直接输入`测试`");

    expect(getInlineText(editor.document[0])).toBe("直接输入测试");
    expect(editor.document[0].content).toEqual([
      {
        type: "text",
        text: "直接输入",
        styles: {},
      },
      {
        type: "text",
        text: "测试",
        styles: {
          code: true,
        },
      },
    ]);
    expect(
      container.querySelector(
        ".bn-editor code:not(.editor-code-block__content)",
      )?.textContent,
    ).toBe("测试");
  });

  it("converts keyboard-entered markdown inline code into styled text", async () => {
    setupMatchMedia();
    const user = userEvent.setup();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "" }],
    });
    const { container } = render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "start");
    editor.focus();
    await user.keyboard("`test`");

    await waitFor(() => {
      expect(editor.document[0].content).toEqual([
        {
          type: "text",
          text: "test",
          styles: {
            code: true,
          },
        },
      ]);
      expect(
        container.querySelector(
          ".bn-editor code:not(.editor-code-block__content)",
        )?.textContent,
      ).toBe("test");
    });
  });

  it("normalizes inline code markers inserted outside input rules", () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "" }],
    });
    render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "start");
    const view = editor.prosemirrorView;
    view.dispatch(view.state.tr.insertText("`test`"));

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

  it("turns inline code back into editable markdown before deleting characters", async () => {
    setupMatchMedia();
    const user = userEvent.setup();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "test",
              styles: {
                code: true,
              },
            },
          ],
        },
      ],
    });
    render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "end");
    editor.focus();
    await user.keyboard("{Backspace}");

    expect(editor.document[0].content).toEqual([
      {
        type: "text",
        text: "`test",
        styles: {},
      },
    ]);

    await user.keyboard("{Backspace}");

    expect(editor.document[0].content).toEqual([
      {
        type: "text",
        text: "`tes",
        styles: {},
      },
    ]);
  });

  it("does not restore the closing marker when deleting input-rule inline code", () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "" }],
    });
    render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "start");
    typeString(editor, "`test`");
    pressKey(editor, "Backspace");

    expect(editor.document[0].content).toEqual([
      {
        type: "text",
        text: "`test",
        styles: {},
      },
    ]);

    pressKey(editor, "Backspace");

    expect(editor.document[0].content).toEqual([
      {
        type: "text",
        text: "`tes",
        styles: {},
      },
    ]);
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

  it("pastes markdown list items as children of a non-empty quote", () => {
    setupMatchMedia();
    setupClipboardEvent();
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
    editor.pasteText("* 列表1\n* 列表2");

    expect(editor.document).toHaveLength(1);
    expect(editor.document[0].type).toBe("quote");
    expect(getInlineText(editor.document[0])).toBe("这是引用");
    expect(
      editor.document[0].children.map((block) => ({
        type: block.type,
        text: getInlineText(block),
      })),
    ).toEqual([
      { type: "bulletListItem", text: "列表1" },
      { type: "bulletListItem", text: "列表2" },
    ]);
  });

  it("splits a pasted quote lead line from its following bullet list", () => {
    setupMatchMedia();
    setupClipboardEvent();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "quote",
          content: "",
        },
      ],
    });
    const { container } = render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "start");
    editor.pasteText("列表\n- 列表1\n- 列表2");
    expect(editor.document).toHaveLength(1);
    expect(editor.document[0].type).toBe("quote");
    expect(getInlineText(editor.document[0])).toBe("列表");
    expect(
      editor.document[0].children.map((block) => ({
        type: block.type,
        text: getInlineText(block),
      })),
    ).toEqual([
      { type: "bulletListItem", text: "列表1" },
      { type: "bulletListItem", text: "列表2" },
    ]);
    expect(
      container.querySelectorAll('[data-content-type="quote"]'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-content-type="bulletListItem"]'),
    ).toHaveLength(2);
  });

  it("keeps a keyboard-entered bullet list inside its quote parent", async () => {
    setupMatchMedia();
    const user = userEvent.setup();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "paragraph",
          content: "",
        },
      ],
    });
    const { container } = render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "start");
    editor.focus();
    await user.keyboard("> - 这是引用");

    const quoteOuter = container
      .querySelector('[data-content-type="quote"]')
      ?.closest(".bn-block-outer");
    expect(
      quoteOuter?.querySelector(
        ':scope > .bn-block > .bn-block-group [data-content-type="bulletListItem"]',
      ),
    ).not.toBeNull();

    expect(editor.document).toHaveLength(1);
    expect(editor.document[0].type).toBe("quote");
    expect(getInlineText(editor.document[0])).toBe("");
    expect(editor.document[0].children).toHaveLength(1);
    expect(editor.document[0].children[0].type).toBe("bulletListItem");
    expect(getInlineText(editor.document[0].children[0])).toBe("这是引用");
  });

  it("binds the side menu of a quote child list item to its parent quote", () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "quote",
          content: "",
          children: [{ type: "bulletListItem", content: "列表" }],
        },
      ],
    });
    render(createElement(BlockNoteView, { editor }));
    const quote = editor.document[0];
    const child = quote.children[0];
    const sideMenu = editor.getExtension(SideMenuExtension);

    sideMenu?.store?.setState(() => ({
      block: child,
      referencePos: new DOMRect(0, 0, 0, 0),
      show: true,
    }));

    expect(sideMenu?.store?.state.block.id).toBe(quote.id);
  });

  it("runs quote list input before the default bullet list rule", () => {
    const editor = BlockNoteEditor.create({ schema: editorSchema });
    const extension = editor.getExtension("editor-quote-list-input");

    expect(extension?.runsBefore).toContain("bullet-list-item-shortcuts");
    expect(extension?.inputRules).toHaveLength(1);
  });

  it("prevents the default bullet rule from replacing a quote block", () => {
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "quote", content: "-" }],
    });
    editor.setTextCursorPosition(editor.document[0].id, "end");
    const extension = editor.getExtension("bullet-list-item-shortcuts");
    const replacement = extension?.inputRules?.[0]?.replace({
      editor,
      match: ["- "],
      range: { from: 1, to: 3 },
    });

    expect(replacement).toBeUndefined();
  });

  it("turns bullet markers after a quote line break into child list items", () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "quote",
          content: "列表",
        },
      ],
    });
    render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "end");
    pressKey(editor, "Enter");
    typeString(editor, "- 列表1");
    pressKey(editor, "Enter");
    typeString(editor, "列表2");

    expect(editor.document).toHaveLength(1);
    expect(editor.document[0].type).toBe("quote");
    expect(getInlineText(editor.document[0])).toBe("列表");
    expect(
      editor.document[0].children.map((block) => ({
        type: block.type,
        text: getInlineText(block),
      })),
    ).toEqual([
      { type: "bulletListItem", text: "列表1" },
      { type: "bulletListItem", text: "列表2" },
    ]);
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

  it.each(["Backspace", "Delete"])(
    "clears every block and collapses the selection after select-all then %s",
    (key) => {
      setupMatchMedia();
      const editor = BlockNoteEditor.create({
        schema: editorSchema,
        initialContent: [
          { type: "codeBlock", content: "const value = 1" },
          { type: "bulletListItem", content: "A list item" },
        ],
      });
      render(createElement(BlockNoteView, { editor }));

      editor.prosemirrorView.dispatch(
        editor.prosemirrorView.state.tr.setSelection(
          new AllSelection(editor.prosemirrorView.state.doc),
        ),
      );
      pressKey(editor, key);

      expect(getDocumentSummary(editor)).toEqual([
        { type: "paragraph", text: "" },
      ]);
      expect(editor.prosemirrorView.state.selection.empty).toBe(true);
    },
  );

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
    mockCursorCoordinatesAfterDetachedMeasure();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "" }],
    });

    const { container } = render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "start");
    editor.focus();
    typeString(editor, "```ts ");

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
        expect(getCodeMirrorView(container).hasFocus).toBe(true);
        expect(
          container.querySelector(
            ".editor-code-block__codemirror .cm-cursor-primary",
          ),
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

    const { container } = render(createElement(BlockNoteView, { editor }));

    await waitFor(() => {
      expect(getCodeMirrorView(container).state.doc.toString()).toBe(
        "const a = 1",
      );
    });

    const codePane = container.querySelector<HTMLElement>(
      ".editor-code-block__code-pane",
    );
    expect(codePane).not.toBe(null);

    getCodeMirrorView(container).contentDOM.blur();
    await user.click(codePane as HTMLElement);

    expect(getCodeMirrorView(container).hasFocus).toBe(true);
  });

  it("shows the cursor when clicking an empty code block", async () => {
    setupMatchMedia();
    const revealCursorCoordinates = mockCursorCoordinatesUntilLayoutIsReady();
    const user = userEvent.setup();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "" }],
    });
    const { container } = render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "start");
    editor.focus();
    typeString(editor, "```js ");

    await waitFor(() => {
      expect(editor.document[0].type).toBe("codeBlock");
      expect(getCodeMirrorView(container).hasFocus).toBe(true);
      expect(container.querySelector(".cm-cursor-primary")).toBe(null);
    });

    const codePane = container.querySelector<HTMLElement>(
      ".editor-code-block__code-pane",
    );
    expect(codePane).not.toBe(null);
    codePane?.addEventListener("click", revealCursorCoordinates, {
      once: true,
    });

    await user.click(codePane as HTMLElement);

    await waitFor(() => {
      expect(getCodeMirrorView(container).hasFocus).toBe(true);
      expect(container.querySelector(".cm-cursor-primary")).not.toBe(null);
    });
  });

  it("keeps CodeMirror focused when its node selection becomes a text selection", async () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "codeBlock",
          props: { language: "js" },
          content: "",
        },
      ],
    });
    const { container } = render(createElement(BlockNoteView, { editor }));

    await waitFor(() => {
      expect(getCodeMirrorView(container).state.doc.length).toBe(0);
    });

    const codeMirror = getCodeMirrorView(container);
    const prosemirror = editor.prosemirrorView;
    let codeBlockPosition: number | undefined;
    prosemirror.state.doc.descendants((node, position) => {
      if (node.type.name !== "codeBlock") return true;
      codeBlockPosition = position;
      return false;
    });

    expect(codeBlockPosition).not.toBeUndefined();
    prosemirror.dispatch(
      prosemirror.state.tr.setSelection(
        NodeSelection.create(
          prosemirror.state.doc,
          codeBlockPosition as number,
        ),
      ),
    );
    expect(codeMirror.hasFocus).toBe(true);

    codeMirror.dispatch({ selection: codeMirror.state.selection });

    expect(prosemirror.state.selection).toBeInstanceOf(TextSelection);
    expect(codeMirror.hasFocus).toBe(true);
  });

  it("focuses CodeMirror when clicking the code content", async () => {
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

    const view = getCodeMirrorView(container);
    const content = container.querySelector<HTMLElement>(
      ".editor-code-block__codemirror .cm-content",
    );
    expect(content).not.toBe(null);

    view.contentDOM.blur();
    content?.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 2,
        cancelable: true,
      }),
    );

    expect(view.hasFocus).toBe(true);
  });

  it("focuses CodeMirror when clicking the line-number gutter", async () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "codeBlock",
          props: { language: "bash" },
          content: "echo ready\necho next",
        },
      ],
    });
    const { container } = render(createElement(BlockNoteView, { editor }));

    await waitFor(() => {
      expect(getCodeMirrorView(container).state.doc.lines).toBe(2);
    });

    const view = getCodeMirrorView(container);
    const lineNumber = container.querySelector<HTMLElement>(
      ".editor-code-block__codemirror .cm-lineNumbers .cm-gutterElement",
    );
    expect(lineNumber).not.toBe(null);

    view.contentDOM.blur();
    fireEvent.mouseDown(lineNumber as HTMLElement);

    expect(view.hasFocus).toBe(true);
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
