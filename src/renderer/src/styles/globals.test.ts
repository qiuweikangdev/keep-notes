import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(process.cwd(), "src/renderer/src/styles/globals.css"),
  "utf8",
);

describe("global scrollbar styles", () => {
  it("shows the shared sidebar scrollbar only while its shell is hovered", () => {
    expect(stylesheet).toMatch(
      /\.file-tree-scrollbar-thumb\s*\{[\s\S]*opacity:\s*0;/,
    );
    expect(stylesheet).toMatch(
      /\.file-tree-scroll-shell:hover\s+\.file-tree-scrollbar-thumb\s*\{[\s\S]*opacity:\s*1;/,
    );
  });

  it("fades out the file tree scrollbar after hover ends", () => {
    expect(stylesheet).toMatch(
      /\.file-tree-scrollbar-thumb\s*\{[\s\S]*transition:\s*opacity\s+240ms\s+cubic-bezier\(0\.25,\s*1,\s*0\.5,\s*1\);/,
    );
  });

  it("disables the scrollbar fade for reduced motion", () => {
    expect(stylesheet).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.file-tree-scrollbar-thumb\s*\{[\s\S]*transition-duration:\s*0\.01ms;/,
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

describe("shared selection interaction styles", () => {
  it("balances perceived contrast across the sidebar and command palette", () => {
    expect(stylesheet).toMatch(
      /\.light\s*\{[\s\S]*--selection-row-hover:\s*#f7f7f7;[\s\S]*--selection-row-selected:\s*#eff0f0;[\s\S]*--file-tree-row-hover:\s*#ececec;[\s\S]*--file-tree-row-selected:\s*#e4e4e4;/,
    );
  });

  it("aligns light-theme button states with shared selection colors", () => {
    expect(stylesheet).toMatch(
      /\.light\s*\{[\s\S]*--button-hover-bg:\s*var\(--selection-row-hover\);[\s\S]*--button-active-bg:\s*var\(--selection-row-selected\);/,
    );
    expect(stylesheet).toMatch(
      /button\[data-reminder-setting-control="true"\]:not\(:disabled\):hover\s*\{[\s\S]*background-color:\s*var\(--selection-row-hover\)\s*!important;/,
    );
  });

  it("keeps shared surfaces out of the generic button state colors", () => {
    expect(
      stylesheet.match(/:not\(\[data-selection-surface="true"\]\)/g),
    ).toHaveLength(2);
  });

  it("uses the semantic row colors for shared surface hover and selection", () => {
    expect(stylesheet).toMatch(
      /button\[data-selection-surface="true"\]:not\(\[data-selected="true"\]\):hover\s*\{[\s\S]*background-color:\s*var\(--selection-row-hover\)\s*!important;/,
    );
    expect(stylesheet).toMatch(
      /button\[data-selection-surface="true"\]\[data-selected="true"\]\s*\{[\s\S]*background-color:\s*var\(--selection-row-selected\)\s*!important;/,
    );
  });

  it("uses stronger contextual colors on secondary surfaces", () => {
    expect(stylesheet).toMatch(
      /button\[data-selection-surface="true"\]\[data-selection-context="secondary"\]:not\(\s*\[data-selected="true"\]\s*\):hover\s*\{[\s\S]*background-color:\s*var\(--file-tree-row-hover\)\s*!important;/,
    );
    expect(stylesheet).toMatch(
      /button\[data-selection-surface="true"\]\[data-selection-context="secondary"\]\[\s*data-selected="true"\s*\]\s*\{[\s\S]*background-color:\s*var\(--file-tree-row-selected\)\s*!important;/,
    );
  });
});

describe("markdown source editor surface styles", () => {
  it("keeps the editor borderless instead of using form-control focus styles", () => {
    expect(stylesheet).toMatch(
      /textarea\[aria-label="Markdown 源码"\]\s*\{[\s\S]*border:\s*0 !important;[\s\S]*border-radius:\s*0;[\s\S]*box-shadow:\s*none !important;[\s\S]*outline:\s*none !important;/,
    );
  });
});
