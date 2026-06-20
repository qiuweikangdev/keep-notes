import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EditorCodeBlock,
  getCodeBlockFoldRanges,
  getCodeBlockLineNumbers,
  getCodeBlockVisibleLines,
  readCodeBlockText,
  refreshCodeBlockHighlighting,
} from "./editor-code-block";

afterEach(() => {
  cleanup();
});

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
    ).toHaveTextContent("function demo() { ... 2 lines folded const next = 2;");
    expect(code).toHaveClass("editor-code-block__content--source-hidden");
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
