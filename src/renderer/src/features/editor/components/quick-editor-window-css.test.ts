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
  it("keeps an opaque window backdrop behind the translucent editor surface", () => {
    const windowRule = stylesheet.match(
      /\.quick-editor-window\s*\{([\s\S]*?)\n\}/,
    )?.[1];
    const titlebarRule = stylesheet.match(
      /\.quick-editor-window__titlebar\s*\{([\s\S]*?)\n\}/,
    )?.[1];

    expect(windowRule).toMatch(/background:\s*var\(--bg-primary\);/);
    expect(titlebarRule).toMatch(/background:\s*color-mix/);
  });

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

  it("keeps the find widget fixed above a separately scrollable editor", () => {
    const editorRule = stylesheet.match(
      /\.quick-editor-window__editor\s*\{([\s\S]*?)\n\}/,
    )?.[1];
    const scrollRule = stylesheet.match(
      /\.quick-editor-window__scroll\s*\{([\s\S]*?)\n\}/,
    )?.[1];

    expect(editorRule).toMatch(/position:\s*relative;/);
    expect(editorRule).toMatch(/overflow:\s*hidden;/);
    expect(scrollRule).toMatch(/overflow:\s*auto;/);
  });

  it("shows menu trigger focus without a border ring", () => {
    const menuFocusRule = stylesheet.match(
      /\.quick-editor-window__action--menu:focus-visible\s*\{([\s\S]*?)\n\}/,
    )?.[1];

    expect(menuFocusRule).toBeDefined();
    expect(menuFocusRule).toMatch(/box-shadow:\s*none;/);
    expect(menuFocusRule).toMatch(/background:\s*var\(--hover-bg\)/);
    expect(menuFocusRule).toMatch(/color:\s*var\(--text-primary\)/);
  });
});
