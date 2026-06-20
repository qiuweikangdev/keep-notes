import { BlockNoteEditor } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createEditorCodeBlockHighlighter,
  editorBlockSpecs,
  editorCodeBlockPreloadedLanguages,
  editorCodeBlockSupportedLanguages,
  editorCodeBlockThemes,
  editorSchema,
} from "./blocknote-schema";

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

function simulateTextInput(editor: BlockNoteEditor, text: string) {
  const view = editor.prosemirrorView;
  const { from, to } = view.state.selection;
  const fallback = () => view.state.tr.insertText(text, from, to);
  const handled = view.someProp("handleTextInput", (handler) =>
    handler(view, from, to, text, fallback),
  );

  if (!handled) {
    view.dispatch(fallback());
  }
}

function typeString(editor: BlockNoteEditor, value: string) {
  for (const character of value) {
    simulateTextInput(editor, character);
  }
}

describe("editor BlockNote schema", () => {
  it("replaces the default code block while preserving common blocks", () => {
    expect(Object.keys(editorBlockSpecs)).toContain("paragraph");
    expect(Object.keys(editorBlockSpecs)).toContain("quote");
    expect(Object.keys(editorBlockSpecs)).toContain("checkListItem");
    expect(Object.keys(editorBlockSpecs)).toContain("bulletListItem");
    expect(editorBlockSpecs.codeBlock.config.type).toBe("codeBlock");
  });

  it("configures Shiki supported language metadata", () => {
    expect(editorCodeBlockSupportedLanguages.javascript).toEqual({
      name: "JavaScript",
      aliases: ["js", "mjs", "cjs"],
    });
    expect(editorCodeBlockSupportedLanguages.typescript.aliases).toContain(
      "ts",
    );
    expect(editorCodeBlockSupportedLanguages.cpp.aliases).toContain("c++");
  });

  it("preserves code block extensions for input rules and highlighting", () => {
    expect(editorBlockSpecs.codeBlock.extensions?.length).toBeGreaterThan(0);
    expect(editorBlockSpecs.codeBlock.implementation.toExternalHTML).toBeTypeOf(
      "function",
    );
  });

  it("creates a lazy Shiki highlighter with editor themes", async () => {
    const highlighter = await createEditorCodeBlockHighlighter();
    const tokens = highlighter.codeToTokens("const a = 1", {
      lang: "javascript",
      theme: editorCodeBlockThemes[0],
    }).tokens;

    expect(highlighter.getLoadedThemes()).toEqual([...editorCodeBlockThemes]);
    expect(editorCodeBlockPreloadedLanguages).toContain("javascript");
    expect(highlighter.getLoadedLanguages()).toContain("typescript");
    expect(highlighter.getLoadedLanguages()).toContain("javascript");
    expect(tokens.flat().some((token) => token.color)).toBe(true);
  });

  it("uses the active editor color scheme when tokenizing code", async () => {
    document.body.innerHTML =
      '<div class="bn-root" data-color-scheme="dark" />';
    const highlighter = await createEditorCodeBlockHighlighter();
    const darkTokens = highlighter.codeToTokens("const a = 1", {
      lang: "javascript",
      theme: "one-light",
    }).tokens;

    document.body.innerHTML =
      '<div class="bn-root" data-color-scheme="light" />';
    const lightTokens = highlighter.codeToTokens("const a = 1", {
      lang: "javascript",
      theme: "one-dark-pro",
    }).tokens;

    const getTokenColors = (tokens: typeof darkTokens) =>
      tokens
        .flat()
        .map((token) => token.color?.toLowerCase())
        .filter(Boolean);

    expect(getTokenColors(darkTokens)).toContain("#c678dd");
    expect(getTokenColors(lightTokens)).toContain("#a626a4");
  });

  it("creates Shiki token colors when WebAssembly compilation is blocked", async () => {
    const blockedWebAssembly = {
      compile: vi.fn(() => {
        throw new Error("WebAssembly compilation is blocked by CSP");
      }),
      compileStreaming: vi.fn(() => {
        throw new Error("WebAssembly compilation is blocked by CSP");
      }),
      instantiate: vi.fn(() => {
        throw new Error("WebAssembly compilation is blocked by CSP");
      }),
      instantiateStreaming: vi.fn(() => {
        throw new Error("WebAssembly compilation is blocked by CSP");
      }),
    };
    vi.stubGlobal("WebAssembly", blockedWebAssembly);

    const highlighter = await createEditorCodeBlockHighlighter();
    const tokens = highlighter.codeToTokens("const a = 1", {
      lang: "typescript",
      theme: editorCodeBlockThemes[0],
    }).tokens;

    expect(tokens.flat().some((token) => token.color)).toBe(true);
  });

  it("applies Shiki token colors to rendered JavaScript code blocks", async () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [
        {
          type: "codeBlock",
          props: { language: "js" },
          content: "const a = 1",
        },
      ],
    });

    const { container } = render(createElement(BlockNoteView, { editor }));

    await waitFor(
      () => {
        const token = container.querySelector<HTMLElement>(
          ".editor-code-block__content .shiki",
        );

        expect(token).not.toBe(null);
        expect(token?.getAttribute("style")).toContain("color:");
      },
      { timeout: 1000 },
    );
  });

  it("applies Shiki token colors after creating a TypeScript code block from input", async () => {
    setupMatchMedia();
    const editor = BlockNoteEditor.create({
      schema: editorSchema,
      initialContent: [{ type: "paragraph", content: "" }],
    });

    const { container } = render(createElement(BlockNoteView, { editor }));

    editor.setTextCursorPosition(editor.document[0].id, "start");
    typeString(editor, "```ts ");
    typeString(editor, "const a = 1\nvar b = 2");

    await waitFor(
      () => {
        const token = container.querySelector<HTMLElement>(
          ".editor-code-block__content .shiki",
        );

        expect(editor.document[0].type).toBe("codeBlock");
        expect(token).not.toBe(null);
        expect(token?.getAttribute("style")).toContain("color:");
      },
      { timeout: 1000 },
    );
  });
});
