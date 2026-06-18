import { describe, expect, it } from "vitest";

import {
  CODE_BLOCK_LANGUAGE_OPTIONS,
  findCodeBlockLanguage,
  getCodeBlockLanguageLabel,
  getCodeBlockLanguageShortLabel,
  getSupportedCodeBlockLanguageId,
  searchCodeBlockLanguages,
} from "./editor-code-block-languages";

describe("editor code block languages", () => {
  it("defines a focused common language set", () => {
    expect(CODE_BLOCK_LANGUAGE_OPTIONS.map((item) => item.id)).toEqual([
      "text",
      "javascript",
      "typescript",
      "jsx",
      "tsx",
      "vue",
      "html",
      "css",
      "scss",
      "json",
      "markdown",
      "bash",
      "python",
      "java",
      "go",
      "rust",
      "c",
      "cpp",
      "csharp",
      "sql",
      "yaml",
      "toml",
      "xml",
      "dockerfile",
      "diff",
    ]);
  });

  it("resolves ids and aliases without changing unsupported languages", () => {
    expect(getSupportedCodeBlockLanguageId("js")).toBe("javascript");
    expect(getSupportedCodeBlockLanguageId("ts")).toBe("typescript");
    expect(getSupportedCodeBlockLanguageId("c++")).toBe("cpp");
    expect(getSupportedCodeBlockLanguageId("unknownlang")).toBe("unknownlang");
    expect(getSupportedCodeBlockLanguageId("")).toBe("text");
  });

  it("returns labels for known languages and readable fallback labels", () => {
    expect(getCodeBlockLanguageLabel("typescript")).toBe("TypeScript");
    expect(getCodeBlockLanguageShortLabel("typescript")).toBe("ts");
    expect(getCodeBlockLanguageLabel("unknownlang")).toBe("unknownlang");
    expect(getCodeBlockLanguageShortLabel("unknownlang")).toBe("unknownlang");
  });

  it("finds languages by id, label, and aliases", () => {
    expect(findCodeBlockLanguage("py")?.id).toBe("python");
    expect(searchCodeBlockLanguages("script").map((item) => item.id)).toEqual([
      "javascript",
      "typescript",
    ]);
    expect(searchCodeBlockLanguages("yml").map((item) => item.id)).toEqual([
      "yaml",
    ]);
    expect(searchCodeBlockLanguages("zzzz")).toEqual([]);
  });
});
