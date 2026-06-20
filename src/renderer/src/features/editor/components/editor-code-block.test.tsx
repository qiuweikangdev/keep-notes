import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BlockNoteEditor as CoreBlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  const block = {
    id: "block-1",
    type: "codeBlock",
    props: { language },
  };

  render(
    <EditorCodeBlock
      block={block}
      editor={{ updateBlock } as never}
      contentRef={() => undefined}
    />,
  );

  return { updateBlock };
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

  it("syncs code block select-all to the ProseMirror selection", async () => {
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
    const code = await waitFor(() => {
      const element = container.querySelector<HTMLElement>(
        ".editor-code-block__content",
      );
      expect(element).not.toBe(null);
      expect(element?.textContent).toBe("const value = 1;");
      return element;
    });

    expect(selectCodeBlockContent(code, editor.prosemirrorView)).toBe(true);

    const { selection } = editor.prosemirrorView.state;
    expect(
      editor.prosemirrorView.state.doc.textBetween(
        selection.from,
        selection.to,
      ),
    ).toBe("const value = 1;");
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
    renderCodeBlock("javascript");

    const code = screen.getByTestId("editor-code-block-content");
    const shell = code.closest(".editor-code-block-shell");

    expect(shell).toBeInTheDocument();
    expect(
      shell?.querySelector(".editor-code-block-language-trigger"),
    ).toBeInTheDocument();
    expect(
      shell?.querySelector(".editor-code-block-gutter"),
    ).toBeInTheDocument();
    expect(shell?.querySelector(".editor-code-block-gutter")).not.toHaveClass(
      "border-r",
    );
    expect(shell?.querySelector(".editor-code-block-copy")).toBeInTheDocument();
    expect(code).not.toHaveAttribute("contenteditable");

    await user.click(
      screen.getByRole("button", { name: /change code language/i }),
    );

    expect(
      shell?.querySelector(".editor-code-block-language-popover"),
    ).toBeInTheDocument();
  });

  it("renders fold controls and switches to a folded preview", async () => {
    const user = userEvent.setup();
    renderCodeBlock("typescript");

    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = "function demo() {\n  return 1;\n}\nconst next = 2;";

    const foldButton = await screen.findByRole("button", {
      name: /fold code block from line 1 to 3/i,
    });
    await user.click(foldButton);

    expect(
      screen.getByRole("button", {
        name: /expand code block from line 1 to 3/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/typescript folded code preview/i),
    ).toHaveTextContent("function demo() {... const next = 2;");
    expect(screen.getByLabelText(/2 folded lines/i)).toHaveTextContent("...");
    expect(code).toHaveClass("editor-code-block__content--source-hidden");
  });

  it("handles command/control+a inside the code block as code-only selection", () => {
    renderCodeBlock("typescript");

    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = "const value = 1;\nconsole.log(value);";
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "a",
      metaKey: true,
    });

    code.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(window.getSelection()?.toString()).toBe(
      "const value = 1;\nconsole.log(value);",
    );
  });

  it("keeps code outside the folded scope on a separate preview line", async () => {
    const user = userEvent.setup();
    renderCodeBlock("typescript");

    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = "root\n  child\n  child\nnext";

    await user.click(
      await screen.findByRole("button", {
        name: /fold code block from line 1 to 3/i,
      }),
    );

    const preview = screen.getByLabelText(/typescript folded code preview/i);
    const previewLines = preview.querySelectorAll(
      ".editor-code-block__fold-preview-line",
    );

    expect(previewLines).toHaveLength(2);
    expect(previewLines[0]).toHaveTextContent("root...");
    expect(previewLines[0]).not.toHaveTextContent("next");
    expect(previewLines[1]).toHaveTextContent("next");
  });

  it("keeps highlighted token markup in the folded preview", async () => {
    const user = userEvent.setup();
    renderCodeBlock("typescript");

    const code = screen.getByTestId("editor-code-block-content");
    code.innerHTML = [
      '<span style="color: rgb(160, 17, 31);">function</span> ',
      '<span style="color: rgb(3, 43, 127);">demo</span>() {',
      "\n  ",
      '<span style="color: rgb(160, 17, 31);">return</span> 1;',
      "\n}",
      "\n",
      '<span style="color: rgb(3, 43, 127);">next</span>();',
    ].join("");

    await user.click(
      await screen.findByRole("button", {
        name: /fold code block from line 1 to 3/i,
      }),
    );

    const preview = screen.getByLabelText(/typescript folded code preview/i);

    expect(
      preview.querySelector('span[style*="rgb(160, 17, 31)"]'),
    ).toHaveTextContent("function");
    expect(
      preview.querySelector('span[style*="rgb(3, 43, 127)"]'),
    ).toHaveTextContent("demo");
    expect(screen.getByLabelText(/2 folded lines/i)).toHaveTextContent("...");
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
