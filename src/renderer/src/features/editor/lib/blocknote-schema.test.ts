import { describe, expect, it } from "vitest";

import {
  editorBlockSpecs,
  editorCodeBlockSupportedLanguages,
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
});
