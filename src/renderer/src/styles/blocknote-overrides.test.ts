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
      /\.bn-editor \[data-content-type="table"\] \.tableWrapper\s*\{[\s\S]*max-width:\s*100%;/,
    );
    expect(stylesheet).toMatch(
      /\.bn-editor \[data-content-type="table"\] table\s*\{[\s\S]*width:\s*max-content;/,
    );
    expect(stylesheet).toMatch(
      /\.bn-mantine \.bn-extend-button-add-remove-rows\s*\{[\s\S]*width:\s*calc\(100% - 22px\);/,
    );
  });
});
