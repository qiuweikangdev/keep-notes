import { describe, expect, it } from "vitest";

import {
  createEditorCodeBlockHighlighter,
  editorBlockSpecs,
  editorCodeBlockPreloadedLanguages,
  editorCodeBlockSupportedLanguages,
  editorCodeBlockThemes,
} from "./blocknote-schema";

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

    expect(highlighter.getLoadedThemes()).toEqual([...editorCodeBlockThemes]);
    expect(editorCodeBlockPreloadedLanguages).toContain("javascript");
    expect(highlighter.getLoadedLanguages()).toContain("typescript");
    expect(highlighter.getLoadedLanguages()).toContain("javascript");
  });
});
