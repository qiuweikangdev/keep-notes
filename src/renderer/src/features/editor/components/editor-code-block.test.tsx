import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BlockNoteEditor as CoreBlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { EditorView } from "@codemirror/view";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { editorSchema } from "../lib/blocknote-schema";
import {
  EditorCodeBlock,
  getCodeBlockFoldRanges,
  getCodeBlockLineNumbers,
  getCodeBlockVisibleLines,
  getHighlightedCodeBlockLineHtml,
  readCodeBlockText,
  refreshCodeBlockHighlighting,
  selectCodeBlockContent,
} from "./editor-code-block";

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

function renderCodeBlock(language = "javascript") {
  const updateBlock = vi.fn();
  const removeBlocks = vi.fn();
  const block = {
    id: "block-1",
    type: "codeBlock",
    props: { language },
  };

  render(
    <EditorCodeBlock
      block={block}
      editor={{ removeBlocks, updateBlock } as never}
      contentRef={() => undefined}
    />,
  );

  return { removeBlocks, updateBlock };
}

async function expectCodeMirrorFolded() {
  expect((await screen.findAllByTitle("Unfold line")).length).toBeGreaterThan(
    0,
  );
  expect(screen.getAllByLabelText("folded code").length).toBeGreaterThan(0);
}

function getCodeMirrorContent() {
  return screen
    .getByTestId("editor-code-block-codemirror")
    .querySelector(".cm-content");
}

function getCodeMirrorView() {
  const host = screen.getByTestId("editor-code-block-codemirror");
  const editorElement = host.querySelector<HTMLElement>(".cm-editor");
  expect(editorElement).not.toBeNull();

  const view = EditorView.findFromDOM(editorElement as HTMLElement);
  expect(view).not.toBeNull();

  return view as EditorView;
}

describe("EditorCodeBlock", () => {
  it("counts line numbers from code text", () => {
    expect(getCodeBlockLineNumbers("one\ntwo\nthree")).toEqual([1, 2, 3]);
    expect(getCodeBlockLineNumbers("")).toEqual([1]);
  });

  it("detects fold ranges for brace-based code scopes", () => {
    expect(
      getCodeBlockFoldRanges(
        ["class Notes {", "  save() {", "    return true;", "  }", "}"].join(
          "\n",
        ),
      ),
    ).toEqual([
      { startLine: 1, endLine: 5 },
      { startLine: 2, endLine: 4 },
    ]);
  });

  it("detects fold ranges for indentation-based code scopes", () => {
    expect(
      getCodeBlockFoldRanges(
        [
          "class Notes:",
          "  def save(self):",
          "    return True",
          "  def load(self):",
          "    return None",
        ].join("\n"),
      ),
    ).toEqual([
      { startLine: 1, endLine: 5 },
      { startLine: 2, endLine: 3 },
      { startLine: 4, endLine: 5 },
    ]);
  });

  it("builds visible code lines from collapsed fold ranges", () => {
    expect(
      getCodeBlockVisibleLines(
        "function demo() {\n  return 1;\n}\nnext();",
        [1],
      ),
    ).toEqual([
      {
        lineNumber: 1,
        text: "function demo() {",
        foldedRange: { startLine: 1, endLine: 3 },
      },
      { lineNumber: 4, text: "next();" },
    ]);
  });

  it("keeps Vue folded preview line numbers matched with visible source lines", () => {
    const code = [
      "<template>",
      "  <article>",
      '    <div class="cover">',
      "      <img />",
      "    </div>",
      '    <div class="content">',
      "      <NuxtLink>",
      "        title",
      "      </NuxtLink>",
      "    </div>",
      "</template>",
    ].join("\n");

    expect(getCodeBlockVisibleLines(code, [3])).toEqual([
      { lineNumber: 1, text: "<template>" },
      { lineNumber: 2, text: "  <article>" },
      {
        lineNumber: 3,
        text: '    <div class="cover">',
        foldedRange: { startLine: 3, endLine: 5 },
      },
      { lineNumber: 6, text: '    <div class="content">' },
      { lineNumber: 7, text: "      <NuxtLink>" },
      { lineNumber: 8, text: "        title" },
      { lineNumber: 9, text: "      </NuxtLink>" },
      { lineNumber: 10, text: "    </div>" },
      { lineNumber: 11, text: "</template>" },
    ]);
  });

  it("reads only code text from the code content element", () => {
    const element = document.createElement("code");
    element.textContent = "const value = 1;\nconsole.log(value);";

    expect(readCodeBlockText(element)).toBe(
      "const value = 1;\nconsole.log(value);",
    );
  });

  it("selects all code block text without selecting nearby editor content", () => {
    const wrapper = document.createElement("div");
    const before = document.createElement("p");
    const code = document.createElement("code");
    const after = document.createElement("p");
    before.textContent = "Before";
    code.textContent = "const value = 1;\nconsole.log(value);";
    after.textContent = "After";
    wrapper.append(before, code, after);
    document.body.append(wrapper);

    expect(selectCodeBlockContent(code)).toBe(true);

    expect(window.getSelection()?.toString()).toBe(
      "const value = 1;\nconsole.log(value);",
    );
    wrapper.remove();
  });

  it("selects the CodeMirror code block content inside the BlockNote schema", async () => {
    setupMatchMedia();
    const editor = CoreBlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "codeBlock",
          props: { language: "typescript" },
          content: "const value = 1;",
        },
      ],
    });
    const { container } = render(createElement(BlockNoteView, { editor }));

    await waitFor(() => {
      expect(getCodeMirrorView().state.doc.toString()).toBe("const value = 1;");
    });

    const editorElement = container.querySelector<HTMLElement>(
      ".editor-code-block__codemirror .cm-editor",
    );
    expect(editorElement).not.toBe(null);
    const view = EditorView.findFromDOM(editorElement as HTMLElement);
    expect(view).not.toBe(null);

    (view as EditorView).focus();
    (view as EditorView).contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "a",
        metaKey: true,
      }),
    );

    expect((view as EditorView).state.selection.main.from).toBe(0);
    expect((view as EditorView).state.selection.main.to).toBe(
      "const value = 1;".length,
    );
  });

  it("serializes highlighted code lines without block-level wrappers", () => {
    const element = document.createElement("code");
    element.innerHTML = [
      '<div><span style="color: rgb(160, 17, 31);">function</span> ',
      '<span style="color: rgb(3, 43, 127);">demo</span></div>',
    ].join("");

    const [lineHtml] = getHighlightedCodeBlockLineHtml(
      element,
      "function demo",
    );

    expect(lineHtml).toContain('style="color: rgb(160, 17, 31);"');
    expect(lineHtml).toContain('style="color: rgb(3, 43, 127);"');
    expect(lineHtml).not.toContain("<div");
  });

  it("preserves source indentation when highlighted markup omits leading spaces", () => {
    const element = document.createElement("code");
    element.innerHTML = [
      '<span style="color: rgb(160, 17, 31);">&lt;template&gt;</span>',
      "\n",
      '<span style="color: rgb(160, 17, 31);">&lt;article&gt;</span>',
    ].join("");

    const [, indentedLineHtml] = getHighlightedCodeBlockLineHtml(
      element,
      "<template>\n  <article>",
    );

    expect(indentedLineHtml.startsWith("  ")).toBe(true);
    expect(indentedLineHtml).toContain("&lt;article&gt;");
  });

  it("does not duplicate indentation already present in highlighted markup", () => {
    const element = document.createElement("code");
    element.innerHTML = [
      '<span style="color: rgb(160, 17, 31);">{</span>',
      "\n",
      '<span style="color: rgb(160, 17, 31);">  &quot;name&quot;</span>',
    ].join("");

    const [, indentedLineHtml] = getHighlightedCodeBlockLineHtml(
      element,
      '{\n  "name"',
    );
    const renderedLine = document.createElement("span");
    renderedLine.innerHTML = indentedLineHtml;

    expect(renderedLine.textContent).toBe('  "name"');
  });

  it("falls back to source lines when highlighted markup is not ready", () => {
    const element = document.createElement("code");

    expect(
      getHighlightedCodeBlockLineHtml(element, "<template>\n  <article>"),
    ).toEqual(["&lt;template&gt;", "  &lt;article&gt;"]);
  });

  it("refreshes ProseMirror decorations without changing code text", () => {
    const transaction = { setMeta: vi.fn(() => "refresh-transaction") };
    const dispatch = vi.fn();

    refreshCodeBlockHighlighting({
      updateBlock: vi.fn(),
      prosemirrorView: {
        state: { tr: transaction },
        dispatch,
      },
    });

    expect(transaction.setMeta).toHaveBeenCalledWith(
      "prosemirror-highlight-refresh",
      true,
    );
    expect(dispatch).toHaveBeenCalledWith("refresh-transaction");
  });

  it("renders a polished language picker and updates the block language", async () => {
    const user = userEvent.setup();
    const { updateBlock } = renderCodeBlock("javascript");

    await user.click(
      screen.getByRole("button", { name: /change code language/i }),
    );
    const popover = screen.getByRole("dialog", { name: /code language/i });
    await user.type(within(popover).getByRole("searchbox"), "type");
    await user.click(
      within(popover).getByRole("option", { name: /typescript/i }),
    );

    expect(updateBlock).toHaveBeenCalledWith("block-1", {
      props: { language: "typescript" },
    });
  });

  it("shows an empty state when language search has no matches", async () => {
    const user = userEvent.setup();
    renderCodeBlock("javascript");

    await user.click(
      screen.getByRole("button", { name: /change code language/i }),
    );
    const popover = screen.getByRole("dialog", { name: /code language/i });
    await user.type(within(popover).getByRole("searchbox"), "zzzz");

    expect(within(popover).getByText("No languages found")).toHaveClass(
      "editor-code-block-language-empty",
    );
  });

  it("exposes stable selectors for code block styling", async () => {
    const user = userEvent.setup();
    renderCodeBlock("text");

    const code = screen.getByTestId("editor-code-block-content");
    const shell = code.closest(".editor-code-block-shell");

    expect(shell).toBeInTheDocument();
    expect(shell).toHaveAttribute("data-language", "text");
    expect(shell).toHaveAttribute("data-highlight-mode", "plain");
    expect(
      shell?.querySelector(".editor-code-block-language-trigger"),
    ).toBeInTheDocument();
    expect(shell?.querySelector(".cm-editor")).toBeInTheDocument();
    expect(shell?.querySelector(".cm-lineNumbers")).toBeInTheDocument();
    expect(shell?.querySelector(".cm-foldGutter")).toBeInTheDocument();
    expect(shell?.querySelector(".editor-code-block-copy")).toBeInTheDocument();
    expect(
      shell?.querySelector(".editor-code-block__blocknote-content-pre"),
    ).toBeInTheDocument();
    expect(code).not.toHaveAttribute("contenteditable");

    await user.click(
      screen.getByRole("button", { name: /change code language/i }),
    );

    expect(
      shell?.querySelector(".editor-code-block-language-popover"),
    ).toBeInTheDocument();
  });

  it.each([
    ["text", "400"],
    ["bash", "400"],
    ["env", "400"],
    ["dotenv", "400"],
    ["yaml", "400"],
    ["javascript", "600"],
    ["python", "600"],
  ])("renders %s code content with font weight %s", (language, fontWeight) => {
    renderCodeBlock(language);

    const content = getCodeMirrorContent();

    expect(content).not.toBeNull();
    expect(getComputedStyle(content as Element).fontWeight).toBe(fontWeight);
  });

  it("keeps the default CodeMirror text color for plain code", () => {
    renderCodeBlock("text");
    const plainColor = getComputedStyle(
      getCodeMirrorContent() as Element,
    ).color;

    cleanup();
    renderCodeBlock("javascript");

    expect(plainColor).toBe(
      getComputedStyle(getCodeMirrorContent() as Element).color,
    );
  });

  it.each(["text", "bash", "env", "dotenv", "yaml"])(
    "uses one mixed-script font family for %s content",
    (language) => {
      renderCodeBlock(language);

      const fontFamily = getComputedStyle(
        screen
          .getByTestId("editor-code-block-codemirror")
          .querySelector(".cm-scroller") as Element,
      ).fontFamily;

      expect(fontFamily).toContain('"PingFang SC"');
      expect(fontFamily).toContain('"Microsoft YaHei UI"');
      expect(fontFamily).not.toContain('"SF Mono"');
    },
  );

  it("renders CodeMirror while keeping the BlockNote content host", async () => {
    renderCodeBlock("json");

    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = '{\n  "name": "demo"\n}';

    const shell = code.closest(".editor-code-block-shell");
    await waitFor(() => {
      expect(shell?.querySelector(".cm-editor")).toBeInTheDocument();
      expect(shell?.querySelector(".cm-foldGutter")).toBeInTheDocument();
    });
    expect(code).toHaveClass("editor-code-block__blocknote-content");
  });

  it("renders CodeMirror fold controls and toggles the current scope", async () => {
    const user = userEvent.setup();
    renderCodeBlock("typescript");

    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = "function demo() {\n  return 1;\n}\nconst next = 2;";

    await user.click((await screen.findAllByTitle("Fold line"))[0]);

    await expectCodeMirrorFolded();
    const codeMirrorContent = getCodeMirrorContent();
    expect(codeMirrorContent?.textContent).toContain("const next = 2;");
    expect(code.textContent).toBe(
      "function demo() {\n  return 1;\n}\nconst next = 2;",
    );
  });

  it("folds indentation-based code even without a dedicated CodeMirror parser", async () => {
    const user = userEvent.setup();
    renderCodeBlock("python");

    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = [
      "class Notes:",
      "  def save(self):",
      "    return True",
      "  def load(self):",
      "    return None",
      "print('done')",
    ].join("\n");

    await user.click((await screen.findAllByTitle("Fold line"))[0]);

    await expectCodeMirrorFolded();
    expect(getCodeMirrorView().state.doc.toString()).toBe(code.textContent);
  });

  it("keeps CodeMirror outside the BlockNote content host", async () => {
    const user = userEvent.setup();
    renderCodeBlock("typescript");

    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = "function demo() {\n  return 1;\n}";

    const codeMirror = screen.getByTestId("editor-code-block-codemirror");
    await user.click((await screen.findAllByTitle("Fold line"))[0]);

    expect(codeMirror).not.toContainElement(code);
    expect(
      code.closest(".editor-code-block__blocknote-content-pre"),
    ).toBeInTheDocument();
    await expectCodeMirrorFolded();
  });

  it("does not mutate the BlockNote content host when folding", async () => {
    const user = userEvent.setup();
    renderCodeBlock("typescript");

    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = "function demo() {\n  return 1;\n}";
    const codeClassName = code.className;
    const originalText = code.textContent;

    await user.click((await screen.findAllByTitle("Fold line"))[0]);

    expect(code.className).toBe(codeClassName);
    expect(code.textContent).toBe(originalText);
    await expectCodeMirrorFolded();
  });

  it("keeps source indentation exactly when folding", async () => {
    const user = userEvent.setup();
    renderCodeBlock("json");

    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = [
      "{",
      '  "account": {',
      '    "credentials": {',
      '      "token": "value"',
      "    },",
      '    "priority": 0',
      "  }",
      "}",
    ].join("\n");
    const originalText = code.textContent;

    const foldButtons = await screen.findAllByTitle("Fold line");
    await user.click(foldButtons.at(-1) as HTMLElement);

    await expectCodeMirrorFolded();
    expect(code.textContent).toBe(originalText);
  });

  it("keeps code outside the folded scope visible on a separate line", async () => {
    const user = userEvent.setup();
    renderCodeBlock("typescript");

    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = "function demo() {\n  return 1;\n}\nnext();";

    await user.click((await screen.findAllByTitle("Fold line"))[0]);

    await expectCodeMirrorFolded();
    const codeMirrorContent = getCodeMirrorContent();
    expect(codeMirrorContent?.textContent).toContain("next();");
  });

  it("keeps fold toggle pointer events inside the code block control", async () => {
    const parentPointerDown = vi.fn();
    const parentMouseDown = vi.fn();
    const parentClick = vi.fn();
    const nativeParentMouseDown = vi.fn();
    const nativeParentClick = vi.fn();
    const updateBlock = vi.fn();
    const block = {
      id: "block-1",
      type: "codeBlock",
      props: { language: "typescript" },
    };

    const { container } = render(
      <div
        onClick={parentClick}
        onMouseDown={parentMouseDown}
        onPointerDown={parentPointerDown}
      >
        <EditorCodeBlock
          block={block}
          editor={{ updateBlock } as never}
          contentRef={() => undefined}
        />
      </div>,
    );
    const nativeParent = container.firstElementChild;
    nativeParent?.addEventListener("mousedown", nativeParentMouseDown);
    nativeParent?.addEventListener("click", nativeParentClick);

    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = "function demo() {\n  return 1;\n}";

    const foldButton = (await screen.findAllByTitle("Fold line"))[0];

    const pointerAllowed = fireEvent.pointerDown(foldButton);
    expect(pointerAllowed).toBe(true);
    expect(parentPointerDown).not.toHaveBeenCalled();

    const mouseDownAllowed = fireEvent.mouseDown(foldButton);
    expect(mouseDownAllowed).toBe(true);
    expect(nativeParentMouseDown).not.toHaveBeenCalled();
    expect(parentMouseDown).not.toHaveBeenCalled();

    const clickAllowed = fireEvent.click(foldButton);
    expect(clickAllowed).toBe(false);
    expect(nativeParentClick).not.toHaveBeenCalled();
    expect(parentClick).not.toHaveBeenCalled();
    await expectCodeMirrorFolded();
  });

  it("keeps code block display surface pointer events away from the parent editor", async () => {
    const user = userEvent.setup();
    const parentPointerDown = vi.fn();
    const parentMouseDown = vi.fn();
    const parentClick = vi.fn();
    const nativeParentMouseDown = vi.fn();
    const nativeParentClick = vi.fn();
    const updateBlock = vi.fn();
    const block = {
      id: "block-1",
      type: "codeBlock",
      props: { language: "typescript" },
    };

    const { container } = render(
      <div
        onClick={parentClick}
        onMouseDown={parentMouseDown}
        onPointerDown={parentPointerDown}
      >
        <EditorCodeBlock
          block={block}
          editor={{ updateBlock } as never}
          contentRef={() => undefined}
        />
      </div>,
    );
    const nativeParent = container.firstElementChild;
    nativeParent?.addEventListener("mousedown", nativeParentMouseDown);
    nativeParent?.addEventListener("click", nativeParentClick);

    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = "function demo() {\n  return 1;\n}\nnext();";

    const codeMirrorContent = getCodeMirrorContent();
    expect(codeMirrorContent).not.toBeNull();
    expect(fireEvent.pointerDown(codeMirrorContent as Element)).toBe(true);
    expect(fireEvent.mouseDown(codeMirrorContent as Element)).toBe(false);
    expect(fireEvent.click(codeMirrorContent as Element)).toBe(true);

    await user.click((await screen.findAllByTitle("Fold line"))[0]);
    await expectCodeMirrorFolded();

    expect(nativeParentMouseDown).not.toHaveBeenCalled();
    expect(nativeParentClick).not.toHaveBeenCalled();
    expect(parentPointerDown).not.toHaveBeenCalled();
    expect(parentMouseDown).not.toHaveBeenCalled();
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("handles command/control+a inside the hidden code host as CodeMirror selection", async () => {
    renderCodeBlock("typescript");

    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = "const value = 1;\nconsole.log(value);";

    await waitFor(() => {
      expect(getCodeMirrorView().state.doc.toString()).toBe(
        "const value = 1;\nconsole.log(value);",
      );
    });
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "a",
      metaKey: true,
    });

    code.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(getCodeMirrorView().state.selection.main.from).toBe(0);
      expect(getCodeMirrorView().state.selection.main.to).toBe(
        "const value = 1;\nconsole.log(value);".length,
      );
    });
  });

  it("handles command/control+a inside CodeMirror as code-only selection", async () => {
    renderCodeBlock("typescript");

    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = "const value = 1;\nconsole.log(value);";

    await waitFor(() => {
      expect(getCodeMirrorView().state.doc.toString()).toBe(
        "const value = 1;\nconsole.log(value);",
      );
    });

    const view = getCodeMirrorView();
    view.focus();
    fireEvent.keyDown(view.contentDOM, {
      bubbles: true,
      cancelable: true,
      key: "a",
      metaKey: true,
    });

    await waitFor(() => {
      expect(getCodeMirrorView().state.selection.main.from).toBe(0);
      expect(getCodeMirrorView().state.selection.main.to).toBe(
        "const value = 1;\nconsole.log(value);".length,
      );
    });
  });

  it("handles command/control+a from the code block shell as CodeMirror selection", async () => {
    renderCodeBlock("json");

    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = '{\n  "name": "FlexTV"\n}';

    await waitFor(() => {
      expect(getCodeMirrorView().state.doc.toString()).toBe(
        '{\n  "name": "FlexTV"\n}',
      );
    });

    const shell = screen
      .getByTestId("editor-code-block-codemirror")
      .closest(".editor-code-block-shell");
    expect(shell).not.toBeNull();

    fireEvent.keyDown(shell as Element, {
      bubbles: true,
      cancelable: true,
      key: "a",
      metaKey: true,
    });

    await waitFor(() => {
      expect(getCodeMirrorView().state.selection.main.from).toBe(0);
      expect(getCodeMirrorView().state.selection.main.to).toBe(
        '{\n  "name": "FlexTV"\n}'.length,
      );
    });
  });

  it("removes the current code block when Backspace is pressed on an empty CodeMirror block", () => {
    const { removeBlocks } = renderCodeBlock("typescript");

    const view = getCodeMirrorView();
    expect(view.state.doc.toString()).toBe("");

    fireEvent.keyDown(view.contentDOM, {
      bubbles: true,
      cancelable: true,
      key: "Backspace",
    });

    expect(removeBlocks).toHaveBeenCalledWith(["block-1"]);
  });

  it("removes the current code block after Backspace deletes the final CodeMirror character", async () => {
    const { removeBlocks } = renderCodeBlock("json");
    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = "1";

    await waitFor(() => {
      expect(getCodeMirrorView().state.doc.toString()).toBe("1");
    });

    const view = getCodeMirrorView();
    view.focus();
    view.dispatch({
      selection: { anchor: 1 },
    });

    fireEvent.keyDown(view.contentDOM, {
      bubbles: true,
      cancelable: true,
      key: "Backspace",
    });

    await waitFor(() => {
      expect(getCodeMirrorView().state.doc.toString()).toBe("");
    });

    fireEvent.keyDown(view.contentDOM, {
      bubbles: true,
      cancelable: true,
      key: "Backspace",
    });

    expect(removeBlocks).toHaveBeenCalledWith(["block-1"]);
  });

  it("removes the current empty code block when Backspace reaches the code block shell", () => {
    const { removeBlocks } = renderCodeBlock("json");
    const shell = screen
      .getByTestId("editor-code-block-codemirror")
      .closest(".editor-code-block-shell");

    expect(shell).not.toBeNull();
    fireEvent.keyDown(shell as Element, {
      bubbles: true,
      cancelable: true,
      key: "Backspace",
    });

    expect(removeBlocks).toHaveBeenCalledWith(["block-1"]);
  });

  it("copies only the code content", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderCodeBlock("javascript");

    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = "console.log('copy me');";
    await user.click(screen.getByRole("button", { name: /copy code/i }));

    expect(writeText).toHaveBeenCalledWith("console.log('copy me');");
    expect(screen.queryByText("Copy")).not.toBeInTheDocument();
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();
  });

  it("contains clipboard write failures without showing copied state", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("Denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderCodeBlock("javascript");

    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = "console.log('do not copy');";
    await user.click(screen.getByRole("button", { name: /copy code/i }));

    expect(writeText).toHaveBeenCalledWith("console.log('do not copy');");
    expect(screen.queryByText("Copied")).not.toBeInTheDocument();
  });
});
