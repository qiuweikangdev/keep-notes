import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasMeaningfulQuickEditorContent,
  QuickEditorWindow,
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
    vi.stubGlobal("electronAPI", {
      closeQuickEditorWindow: vi.fn(),
      returnToMainWindowFromQuickEditor: vi.fn(),
      updateDirtyState: vi.fn(),
    });

    render(createElement(QuickEditorWindow));

    expect(
      screen.getByRole("main", { name: "快速编辑器" }),
    ).toBeInTheDocument();
  });
});
