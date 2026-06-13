import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(process.cwd(), "src/renderer/src/styles/blocknote-overrides.css"),
  "utf8",
);

describe("blocknote overrides stylesheet", () => {
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
