import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EditorCodeBlock,
  getCodeBlockLineNumbers,
  readCodeBlockText,
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

  it("reads only code text from the code content element", () => {
    const element = document.createElement("code");
    element.textContent = "const value = 1;\nconsole.log(value);";

    expect(readCodeBlockText(element)).toBe(
      "const value = 1;\nconsole.log(value);",
    );
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
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
