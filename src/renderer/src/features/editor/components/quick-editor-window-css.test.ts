import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(
    process.cwd(),
    "src/renderer/src/features/editor/components/quick-editor-window.css",
  ),
  "utf8",
);

describe("quick editor window stylesheet", () => {
  it("keeps the BlockNote side controls away from the floating window edge", () => {
    const editorRule = stylesheet.match(
      /\.quick-editor-window__editor \.bn-editor\s*\{([\s\S]*?)\n\}/,
    )?.[1];

    expect(editorRule).toBeDefined();
    expect(editorRule).toMatch(/padding:\s*22px 42px 96px 64px;/);
  });
});
