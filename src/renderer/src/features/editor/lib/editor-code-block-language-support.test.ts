import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import {
  getImmediateCodeBlockLanguageExtension,
  loadCodeBlockLanguageExtension,
} from "./editor-code-block-language-support";

const deferredLanguageIds = [
  "vue",
  "scss",
  "bash",
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
] as const;

describe("editor code block language support", () => {
  it.each(deferredLanguageIds)("loads the %s parser on demand", async (id) => {
    expect(getImmediateCodeBlockLanguageExtension(id)).toBeNull();
    await expect(loadCodeBlockLanguageExtension(id)).resolves.not.toBeNull();
  });

  it.each([
    ["sql", "SELECT id FROM users WHERE active = true;", "Statement"],
    ["go", 'package main\nfunc main() { println("ok") }', "FunctionDecl"],
  ])("builds a syntax tree for %s", async (language, code, nodeName) => {
    const extension = await loadCodeBlockLanguageExtension(language);
    expect(extension).not.toBeNull();
    const state = EditorState.create({ doc: code, extensions: [extension!] });

    expect(syntaxTree(state).toString()).toContain(nodeName);
  });

  it("keeps plain text and unknown languages unparsed", async () => {
    await expect(loadCodeBlockLanguageExtension("text")).resolves.toBeNull();
    await expect(
      loadCodeBlockLanguageExtension("unknown-language"),
    ).resolves.toBeNull();
  });
});
