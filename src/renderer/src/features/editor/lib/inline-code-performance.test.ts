import { BlockNoteEditor } from "@blocknote/core";
import { EditorState } from "@tiptap/pm/state";
import { afterEach, expect, it, vi } from "vitest";
import { editorSchema } from "./blocknote-schema";

afterEach(() => vi.restoreAllMocks());

it.each([200, 2_000])(
  "bounds inline-code and quote normalization visits in a %i block document",
  (blocks) => {
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: Array.from({ length: blocks }, (_, index) => ({
        type: index % 10 === 0 ? ("quote" as const) : ("paragraph" as const),
        content: "正文内容".repeat(10),
      })),
    });
    const element = document.createElement("div");
    document.body.append(element);
    editor.mount(element);
    try {
      const oldState = editor.prosemirrorState;
      const transaction = oldState.tr.insertText("`test`", 3);
      const newState = EditorState.create({
        schema: oldState.schema,
        doc: transaction.doc,
        selection: transaction.selection,
        plugins: oldState.plugins,
      });
      const descendants = vi.spyOn(newState.doc, "descendants");
      const oldDescendants = vi.spyOn(oldState.doc, "descendants");
      const textContent = vi.spyOn(newState.doc, "textContent", "get");
      const visitRange = newState.doc.nodesBetween.bind(newState.doc);
      let visitedTextNodes = 0;
      vi.spyOn(newState.doc, "nodesBetween").mockImplementation(
        (from, to, visit) =>
          visitRange(from, to, (node, position, parent, index) => {
            if (node.isText) visitedTextNodes++;
            return visit(node, position, parent, index);
          }),
      );

      const normalizer = newState.plugins.find(
        (plugin) => plugin.key === "editor-inline-code-normalizer$",
      );
      const normalized = normalizer?.spec.appendTransaction?.call(
        normalizer,
        [transaction],
        oldState,
        newState,
      );
      expect(
        normalized?.doc
          .nodeAt(3)
          ?.marks.some((mark) => mark.type.name === "code"),
      ).toBe(true);
      const quotePlugin = newState.plugins.find(
        (plugin) => plugin.key === "editor-quote-list-input$",
      );
      expect(quotePlugin).toBeDefined();
      expect(
        quotePlugin?.spec.appendTransaction?.call(
          quotePlugin,
          [transaction],
          oldState,
          newState,
        ),
      ).toBeNull();
      expect(descendants).not.toHaveBeenCalled();
      expect(oldDescendants).not.toHaveBeenCalled();
      expect(textContent).not.toHaveBeenCalled();
      expect(visitedTextNodes).toBeLessThanOrEqual(2);
    } finally {
      // oxlint-disable-next-line eslint/no-underscore-dangle
      editor._tiptapEditor.destroy();
      element.remove();
    }
  },
);

it("normalizes separate insertions after later steps shift their positions", () => {
  const editor = BlockNoteEditor.create({
    schema: editorSchema,
    initialContent: [
      { type: "paragraph", content: "first" },
      { type: "paragraph", content: "second" },
    ],
  });
  const element = document.createElement("div");
  document.body.append(element);
  editor.mount(element);
  try {
    const view = editor.prosemirrorView;
    const secondPosition = view.state.doc.firstChild!.firstChild!.nodeSize + 3;
    view.dispatch(
      view.state.tr.insertText("`two`", secondPosition).insertText("`one`", 3),
    );
    expect(
      editor.document.map((block) =>
        Array.isArray(block.content) ? block.content[0] : null,
      ),
    ).toEqual([
      { type: "text", text: "one", styles: { code: true } },
      { type: "text", text: "two", styles: { code: true } },
    ]);
  } finally {
    // oxlint-disable-next-line eslint/no-underscore-dangle
    editor._tiptapEditor.destroy();
    element.remove();
  }
});
