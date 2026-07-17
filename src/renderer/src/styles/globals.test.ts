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

  it("keeps the file tree scrollbar track at the standard width", () => {
    expect(stylesheet).toMatch(
      /\.file-tree-scrollbar-track\s*\{[\s\S]*width:\s*8px;/,
    );
  });

  it("keeps the floating reminder result list interactive while the window is draggable", () => {
    expect(stylesheet).toMatch(
      /\[data-reminder-list-dialog="true"\]\[data-floating-window="true"\][\s\S]*\[data-reminder-scroll-region="true"\][\s\S]*-webkit-app-region:\s*no-drag;/,
    );
  });
});
