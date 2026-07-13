import { BlockNoteEditor } from "@blocknote/core";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEditorCodeLineTarget,
  readEditorCodeViewportAnchor,
} from "./editor-code-viewport";
import { editorSchema } from "./blocknote-schema";

beforeEach(() => {
  Object.defineProperties(Range.prototype, {
    getBoundingClientRect: {
      configurable: true,
      value: vi.fn(() => new DOMRect()),
    },
    getClientRects: {
      configurable: true,
      value: vi.fn(() => []),
    },
  });
});

afterEach(() => {
  document.body.replaceChildren();
  Reflect.deleteProperty(document, "elementFromPoint");
  vi.restoreAllMocks();
});

describe("editor code viewport", () => {
  it("captures and restores a semantic CodeMirror line", () => {
    const block = document.createElement("div");
    const parent = document.createElement("div");
    block.append(parent);
    document.body.append(block);
    const view = new EditorView({
      parent,
      state: EditorState.create({ doc: "first\nsecond\nthird" }),
    });
    const secondLineStart = view.state.doc.line(2).from;
    vi.spyOn(view, "posAtCoords").mockReturnValue(secondLineStart);
    vi.spyOn(view, "coordsAtPos").mockReturnValue({
      bottom: 104,
      left: 40,
      right: 40,
      top: 80,
    });
    const container = {
      getBoundingClientRect: () => ({ top: 100 }),
    };

    expect(
      readEditorCodeViewportAnchor(block, container, { x: 120, y: 124 }),
    ).toEqual({ topCodeLine: 2, topCodeLineOffset: 20 });
    expect(
      createEditorCodeLineTarget(block, 2)?.getBoundingClientRect().top,
    ).toBe(80);

    view.destroy();
  });

  it("finds semantic lines in the serialized code preview", () => {
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          id: "code-block",
          type: "codeBlock",
          props: { language: "json" },
          content: "first\nsecond\nthird",
        },
      ],
    });
    const template = document.createElement("template");
    template.innerHTML = editor.blocksToFullHTML(editor.document);
    const block = template.content.firstElementChild as HTMLElement;
    document.body.append(block);
    const secondLine = block.querySelectorAll<HTMLElement>(".cm-line")[1];
    vi.spyOn(secondLine, "getBoundingClientRect").mockReturnValue({
      bottom: 104,
      height: 24,
      left: 40,
      right: 180,
      top: 80,
      width: 140,
      x: 40,
      y: 80,
      toJSON: vi.fn(),
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => secondLine),
    });

    expect(createEditorCodeLineTarget(block, 2)).toBe(secondLine);
    expect(
      readEditorCodeViewportAnchor(
        block,
        { getBoundingClientRect: () => ({ top: 100 }) },
        { x: 120, y: 124 },
      ),
    ).toEqual({ topCodeLine: 2, topCodeLineOffset: 20 });
  });
});
