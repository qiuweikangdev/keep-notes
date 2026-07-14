import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(process.cwd(), "src/renderer/src/styles/globals.css"),
  "utf8",
);

describe("global scrollbar styles", () => {
  it("fades out the file tree scrollbar after hover ends", () => {
    expect(stylesheet).toMatch(
      /\.file-tree-scrollbar-thumb\s*\{[\s\S]*transition:\s*opacity\s+240ms\s+ease;/,
    );
  });
});
