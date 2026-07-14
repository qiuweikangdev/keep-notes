import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(process.cwd(), "src/renderer/src/styles/globals.css"),
  "utf8",
);

describe("global scrollbar styles", () => {
  it("animates the file tree scrollbar width when hover state changes", () => {
    expect(stylesheet).toMatch(
      /\.file-tree-scroll-container::-webkit-scrollbar\s*\{[\s\S]*transition:\s*width\s+160ms\s+ease,\s*height\s+160ms\s+ease;/,
    );
  });
});
