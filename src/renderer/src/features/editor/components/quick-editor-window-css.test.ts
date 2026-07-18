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
    expect(editorRule).toMatch(/padding:\s*22px 42px 96px 72px;/);
  });

  it("keeps collapse and close available at the minimum width", () => {
    expect(stylesheet).toMatch(/@media\s*\(max-width:\s*164px\)/);
    expect(stylesheet).toMatch(
      /\.quick-editor-window__action--secondary\s*\{[\s\S]*?display:\s*none;/,
    );
    expect(stylesheet).not.toMatch(
      /\.quick-editor-window__action--collapse[^}]*display:\s*none;/,
    );
    expect(stylesheet).not.toMatch(
      /\.quick-editor-window__action--close[^}]*display:\s*none;/,
    );
  });

  it("hides interaction with the mounted editor while collapsed", () => {
    const collapsedRule = stylesheet.match(
      /\.quick-editor-window\[data-collapsed="true"\] \.quick-editor-window__editor\s*\{([\s\S]*?)\n\}/,
    )?.[1];

    expect(collapsedRule).toMatch(/visibility:\s*hidden;/);
    expect(collapsedRule).toMatch(/pointer-events:\s*none;/);
  });
});
