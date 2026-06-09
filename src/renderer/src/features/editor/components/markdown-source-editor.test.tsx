import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MarkdownSourceEditor } from "./markdown-source-editor";

describe("MarkdownSourceEditor", () => {
  it("inserts two spaces when Tab is pressed", async () => {
    const onChange = vi.fn();
    render(
      <MarkdownSourceEditor
        value="ab"
        onChange={onChange}
        onScrollTopChange={vi.fn()}
      />,
    );
    const editor = screen.getByRole("textbox", { name: "Markdown 源码" });
    await userEvent.click(editor);
    editor.setSelectionRange(1, 1);
    await userEvent.keyboard("{Tab}");

    expect(onChange).toHaveBeenCalledWith("a  b");
  });
});
