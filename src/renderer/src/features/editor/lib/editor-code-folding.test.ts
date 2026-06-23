import { describe, expect, it } from "vitest";

import {
  getCodeBlockFoldRanges,
  getCodeBlockVisibleLines,
} from "./editor-code-folding";

describe("editor code folding", () => {
  it("detects fold ranges for brace-based code scopes", () => {
    expect(
      getCodeBlockFoldRanges(
        ["class Notes {", "  save() {", "    return true;", "  }", "}"].join(
          "\n",
        ),
      ),
    ).toEqual([
      { startLine: 1, endLine: 5 },
      { startLine: 2, endLine: 4 },
    ]);
  });

  it("detects fold ranges for indentation-based code scopes", () => {
    expect(
      getCodeBlockFoldRanges(
        [
          "class Notes:",
          "  def save(self):",
          "    return True",
          "  def load(self):",
          "    return None",
        ].join("\n"),
      ),
    ).toEqual([
      { startLine: 1, endLine: 5 },
      { startLine: 2, endLine: 3 },
      { startLine: 4, endLine: 5 },
    ]);
  });

  it("builds visible code lines from collapsed fold ranges", () => {
    expect(
      getCodeBlockVisibleLines(
        "function demo() {\n  return 1;\n}\nnext();",
        [1],
      ),
    ).toEqual([
      {
        lineNumber: 1,
        text: "function demo() {",
        foldedRange: { startLine: 1, endLine: 3 },
      },
      { lineNumber: 4, text: "next();" },
    ]);
  });

  it("keeps Vue folded preview line numbers matched with visible source lines", () => {
    const code = [
      "<template>",
      "  <article>",
      '    <div class="cover">',
      "      <img />",
      "    </div>",
      '    <div class="content">',
      "      <NuxtLink>",
      "        title",
      "      </NuxtLink>",
      "    </div>",
      "</template>",
    ].join("\n");

    expect(getCodeBlockVisibleLines(code, [3])).toEqual([
      { lineNumber: 1, text: "<template>" },
      { lineNumber: 2, text: "  <article>" },
      {
        lineNumber: 3,
        text: '    <div class="cover">',
        foldedRange: { startLine: 3, endLine: 5 },
      },
      { lineNumber: 6, text: '    <div class="content">' },
      { lineNumber: 7, text: "      <NuxtLink>" },
      { lineNumber: 8, text: "        title" },
      { lineNumber: 9, text: "      </NuxtLink>" },
      { lineNumber: 10, text: "    </div>" },
      { lineNumber: 11, text: "</template>" },
    ]);
  });

  it("folds consecutive static imports as one editor region", () => {
    const code = [
      'import React from "react";',
      'import type { User } from "./types";',
      'import "./editor.css";',
      "",
      "export function Editor() {",
      "  return null;",
      "}",
    ].join("\n");

    expect(getCodeBlockVisibleLines(code, [1])).toEqual([
      {
        lineNumber: 1,
        text: 'import React from "react";',
        foldedRange: { startLine: 1, endLine: 3 },
      },
      { lineNumber: 4, text: "" },
      { lineNumber: 5, text: "export function Editor() {" },
      { lineNumber: 6, text: "  return null;" },
      { lineNumber: 7, text: "}" },
    ]);
  });

  it("folds multiline import declarations together with adjacent imports", () => {
    const code = [
      "import {",
      "  EditorView,",
      "  keymap,",
      '} from "@codemirror/view";',
      'import { history } from "@codemirror/commands";',
      "",
      "const extensions = [];",
    ].join("\n");

    expect(getCodeBlockFoldRanges(code)).toContainEqual({
      startLine: 1,
      endLine: 5,
    });
    expect(getCodeBlockVisibleLines(code, [1])).toEqual([
      {
        lineNumber: 1,
        text: "import {",
        foldedRange: { startLine: 1, endLine: 5 },
      },
      { lineNumber: 6, text: "" },
      { lineNumber: 7, text: "const extensions = [];" },
    ]);
  });

  it("does not treat dynamic import calls as foldable import regions", () => {
    expect(
      getCodeBlockFoldRanges(
        [
          "async function loadEditor() {",
          '  return import("./editor");',
          "}",
        ].join("\n"),
      ),
    ).toEqual([{ startLine: 1, endLine: 3 }]);
  });
});
