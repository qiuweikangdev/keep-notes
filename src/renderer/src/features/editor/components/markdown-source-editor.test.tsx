import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  indentMarkdownSelection,
  MarkdownSourceEditor,
} from "./markdown-source-editor";

describe("MarkdownSourceEditor", () => {
  it.each([
    ["- one\n- two", 0, 11, false, "  - one\n  - two", 2, 15],
    ["  - one\n  - two", 2, 15, true, "- one\n- two", 0, 11],
    ["- one\n- two", 0, 11, true, "- one\n- two", 0, 11],
    ["one\ntwo", 0, 4, false, "  one\ntwo", 2, 6],
    ["\tone\n two", 0, 9, true, "one\ntwo", 0, 7],
    ["  one", 1, 1, true, "one", 0, 0],
  ] as const)(
    "preserves text and maps selection when indenting %j",
    (value, start, end, outdent, nextValue, nextStart, nextEnd) => {
      expect(indentMarkdownSelection(value, start, end, outdent)).toEqual({
        value: nextValue,
        start: nextStart,
        end: nextEnd,
      });
    },
  );

  it("outdents a multiline selection without replacing the selected text", () => {
    const onChange = vi.fn();
    render(
      <MarkdownSourceEditor
        value={"  - one\n  - two"}
        onChange={onChange}
        onScrollTopChange={vi.fn()}
      />,
    );
    const editor = screen.getByRole("textbox") as HTMLTextAreaElement;
    editor.setSelectionRange(0, editor.value.length);
    fireEvent.keyDown(editor, { key: "Tab", shiftKey: true });
    expect(onChange).toHaveBeenCalledWith("- one\n- two");
  });
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

  it("recreates the textarea when the reset key changes", () => {
    const { rerender } = render(
      <MarkdownSourceEditor
        value={"# A\n\nBody"}
        resetKey="a.md"
        scrollTop={320}
        onChange={vi.fn()}
        onScrollTopChange={vi.fn()}
      />,
    );
    const editor = screen.getByRole("textbox", { name: /Markdown/ });
    editor.scrollTop = 320;

    rerender(
      <MarkdownSourceEditor
        value={"# B\n\nBody"}
        resetKey="b.md"
        scrollTop={320}
        onChange={vi.fn()}
        onScrollTopChange={vi.fn()}
      />,
    );

    const nextEditor = screen.getByRole("textbox", { name: /Markdown/ });
    expect(nextEditor).not.toBe(editor);
    expect(nextEditor).toHaveValue("# B\n\nBody");
    expect(nextEditor.scrollTop).toBe(0);
  });
});
