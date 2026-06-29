import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarkdownSourceEditor } from "./markdown-source-editor";

describe("MarkdownSourceEditor", () => {
  afterEach(() => {
    cleanup();
  });

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

  it("updates the current line heading level with command/control+number", () => {
    const onChange = vi.fn();
    const { container } = render(
      <MarkdownSourceEditor
        value={"Intro\n### Existing heading\nBody"}
        onChange={onChange}
        onScrollTopChange={vi.fn()}
      />,
    );
    const editor = within(container).getByRole("textbox", {
      name: "Markdown 源码",
    });
    editor.setSelectionRange(12, 12);

    fireEvent.keyDown(editor, { key: "2", ctrlKey: true });

    expect(onChange).toHaveBeenCalledWith("Intro\n## Existing heading\nBody");
  });

  it("applies editor typography settings", () => {
    render(
      <MarkdownSourceEditor
        value="# Notes"
        fontFamily='"SF Mono", monospace'
        fontSize={18}
        lineHeight={1.9}
        onChange={vi.fn()}
        onScrollTopChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Markdown 源码" })).toHaveStyle({
      fontFamily: '"SF Mono", monospace',
      fontSize: "18px",
      lineHeight: "1.9",
    });
  });
});
