import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createQuickEditorImageUploader,
  hasMeaningfulQuickEditorContent,
  QuickEditorWindow,
  uploadQuickEditorImage,
} from "./quick-editor-window";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("quick editor content detection", () => {
  it("treats the initial empty paragraph as clean", () => {
    expect(
      hasMeaningfulQuickEditorContent([
        { type: "paragraph", content: [], children: [] },
      ]),
    ).toBe(false);
  });

  it("detects text, nested blocks, and non-paragraph content", () => {
    expect(
      hasMeaningfulQuickEditorContent([
        { type: "paragraph", content: [{ type: "text", text: "笔记" }] },
      ]),
    ).toBe(true);
    expect(
      hasMeaningfulQuickEditorContent([
        {
          type: "paragraph",
          content: [],
          children: [{ type: "heading", content: [] }],
        },
      ]),
    ).toBe(true);
    expect(
      hasMeaningfulQuickEditorContent([{ type: "image", content: [] }]),
    ).toBe(true);
  });

  it("embeds pasted images in the quick-editor draft", async () => {
    const file = new File([Uint8Array.from([1, 2, 3])], "clip.png", {
      type: "image/png",
    });

    await expect(uploadQuickEditorImage(file)).resolves.toBe(
      "data:image/png;base64,AQID",
    );
  });

  it("moves the cursor after a pasted image instead of selecting the image", async () => {
    const setTextCursorPosition = vi.fn();
    const editor = {
      document: [
        { id: "image-1", type: "image" },
        { id: "paragraph-1", type: "paragraph" },
      ],
      getBlock: vi.fn(() => ({ id: "image-1", type: "image" })),
      insertBlocks: vi.fn(),
      setTextCursorPosition,
    };
    const uploader = createQuickEditorImageUploader(
      () => editor,
      (callback) => callback(),
    );
    const file = new File([Uint8Array.from([1, 2, 3])], "clip.png", {
      type: "image/png",
    });

    await uploader(file, "image-1");

    expect(setTextCursorPosition).toHaveBeenCalledWith("paragraph-1", "start");
  });

  it("creates a standalone BlockNote editor without an outer provider", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: false,
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    );
    const createQuickEditorWindow = vi.fn();
    vi.stubGlobal("electronAPI", {
      createQuickEditorWindow,
      closeQuickEditorWindow: vi.fn(),
      returnToMainWindowFromQuickEditor: vi.fn(),
      updateDirtyState: vi.fn(),
    });

    render(createElement(QuickEditorWindow));

    expect(
      screen.getByRole("main", { name: "快速编辑器" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "新建浮窗编辑器" }));
    expect(createQuickEditorWindow).toHaveBeenCalledOnce();
  });
});
