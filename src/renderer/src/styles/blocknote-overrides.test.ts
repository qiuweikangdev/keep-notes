import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(process.cwd(), "src/renderer/src/styles/blocknote-overrides.css"),
  "utf8",
);

function getRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = Array.from(
    stylesheet.matchAll(
      new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, "g"),
    ),
  );
  return matches.at(-1)?.[1];
}

describe("blocknote overrides stylesheet", () => {
  it("keeps rich editor content anchored to the panel left edge", () => {
    const editorRule = getRule(".bn-editor");

    expect(editorRule).toBeDefined();
    expect(editorRule).toMatch(/width:\s*100%;/);
    expect(editorRule).toMatch(/margin:\s*0;/);
    expect(editorRule).toMatch(/padding-top:\s*20px;/);
    expect(editorRule).toMatch(
      /padding-inline:\s*max\(72px,\s*var\(--editor-padding,\s*72px\)\);/,
    );
    expect(editorRule).not.toMatch(/margin:\s*0 auto/);
    expect(editorRule).not.toMatch(/max-width:/);
  });

  it("normalizes checklist layout and checkbox size", () => {
    expect(stylesheet).toMatch(
      /\.bn-block-content\[data-content-type="checkListItem"\] > div:has\(> input\)\s*\{[\s\S]*align-items:\s*center;/,
    );
    expect(stylesheet).toMatch(
      /\.bn-block-content\[data-content-type="checkListItem"\] > div > input\s*\{[\s\S]*width:\s*18px;/,
    );
    expect(stylesheet).toMatch(
      /\.bn-block-content\[data-content-type="checkListItem"\] > div > input\s*\{[\s\S]*height:\s*18px;/,
    );
    expect(stylesheet).toMatch(
      /\.bn-block-content\[data-content-type="checkListItem"\] > div > input\s*\{[\s\S]*border-radius:\s*4px;/,
    );
    expect(stylesheet).toMatch(
      /\.bn-block-content\[data-content-type="checkListItem"\]\[data-checked="true"\]\s+\.bn-inline-content\s*\{[\s\S]*color:\s*var\(--text-muted\);[\s\S]*text-decoration:\s*line-through;/,
    );
  });

  it("renders quotes as a left rule instead of a bordered card", () => {
    const quoteRule = getRule(
      '.bn-editor [data-content-type="quote"] blockquote',
    );

    expect(quoteRule).toBeDefined();
    expect(quoteRule).toMatch(
      /border-left:\s*3px solid var\(--accent-color\);/,
    );
    expect(quoteRule).toMatch(/border-radius:\s*0;/);
    expect(quoteRule).not.toMatch(/border:\s*1px solid/);
  });

  it("keeps bullet lists compact and readable across nested levels", () => {
    expect(stylesheet).toMatch(
      /\.bn-editor ul\s*\{[\s\S]*padding-left:\s*1\.25em;/,
    );
    expect(stylesheet).toMatch(
      /\.bn-editor li::marker\s*\{[\s\S]*font-size:\s*0\.72em;[\s\S]*color:\s*var\(--text-muted\);/,
    );
    expect(stylesheet).toMatch(
      /\.bn-editor ul ul\s*\{[\s\S]*margin-block:\s*0\.12em;/,
    );
  });

  it("defines custom code block surface and floating controls", () => {
    expect(getRule(".editor-code-block-shell")).toMatch(
      /background:\s*#111827;/,
    );
    expect(getRule(".editor-code-block-shell")).toMatch(
      /border:\s*1px solid color-mix\(in srgb,\s*var\(--border-color\) 72%,\s*#ffffff 10%\);/,
    );
    expect(getRule(".editor-code-block-language-trigger")).toMatch(
      /position:\s*absolute;/,
    );
    expect(getRule(".editor-code-block-copy")).toMatch(/position:\s*absolute;/);
    expect(getRule(".editor-code-block-gutter")).toMatch(
      /user-select:\s*none;/,
    );
  });

  it("polishes the custom language search popover", () => {
    const popoverRule = getRule(".editor-code-block-language-popover");

    expect(popoverRule).toBeDefined();
    expect(popoverRule).toMatch(/background:\s*#0f172a;/);
    expect(popoverRule).toMatch(/border-radius:\s*10px;/);
    expect(popoverRule).toMatch(/pointer-events:\s*auto;/);
    expect(popoverRule).toMatch(/box-shadow:\s*0 18px 44px/);
    expect(stylesheet).toMatch(
      /\.editor-code-block-language-popover input\[type="search"\]\s*\{[\s\S]*background:\s*#111827;/,
    );
    expect(stylesheet).toMatch(
      /\.editor-code-block__language-option\[aria-selected="true"\]\s*\{[\s\S]*background:\s*color-mix\(in srgb,\s*var\(--accent-color\) 22%,\s*transparent\);/,
    );
    expect(stylesheet).toMatch(
      /\.editor-code-block-language-empty\s*\{[\s\S]*text-align:\s*center;/,
    );
  });

  it("keeps paragraph text aligned with the block side menu", () => {
    expect(getRule('.bn-block-content[data-content-type="paragraph"]')).toMatch(
      /margin-top:\s*0;/,
    );
  });

  it("keeps heading text aligned with the block side menu", () => {
    expect(getRule(".bn-editor h1")).toMatch(/margin-top:\s*0;/);
    expect(getRule(".bn-editor h2")).toMatch(/margin-top:\s*0;/);
    expect(getRule(".bn-editor h3")).toMatch(/margin-top:\s*0;/);
  });

  it("keeps the table wrapper and extend row button within the editor width", () => {
    expect(stylesheet).toMatch(
      /\.bn-editor \[data-content-type="table"\] table\s*\{[\s\S]*width:\s*max-content;/,
    );
    expect(stylesheet).toMatch(
      /\.bn-mantine \.bn-extend-button-add-remove-rows\s*\{[\s\S]*width:\s*calc\(100% - 22px\);/,
    );
  });
});
