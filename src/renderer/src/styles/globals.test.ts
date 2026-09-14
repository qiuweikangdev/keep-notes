import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(process.cwd(), "src/renderer/src/styles/globals.css"),
  "utf8",
);

describe("light-theme typography", () => {
  it("uses explicit platform fallbacks for shared UI text", () => {
    expect(stylesheet).toMatch(
      /--font-ui-light:\s*[\s\S]*"Microsoft YaHei UI"[\s\S]*"PingFang SC"[\s\S]*;/,
    );
    expect(stylesheet).toMatch(
      /body\.light\s*\{[\s\S]*font-family:\s*var\(--font-ui-light\);/,
    );
  });

  it("restores platform font smoothing in light mode", () => {
    expect(stylesheet).toMatch(
      /body\.light\s*\{[\s\S]*font-kerning:\s*normal;[\s\S]*-webkit-font-smoothing:\s*auto;[\s\S]*-moz-osx-font-smoothing:\s*auto;/,
    );
  });
});

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

describe("workspace layout surface styles", () => {
  it("keeps the padded panel group and editor surface inside the viewport", () => {
    expect(stylesheet).toMatch(
      /\.workspace-shell\s*>\s*\.workspace-panel-group\s*\{[\s\S]*min-width:\s*0;[\s\S]*min-height:\s*0;[\s\S]*padding:\s*var\(--workspace-panel-group-padding\);/,
    );
    expect(stylesheet).toMatch(
      /\.workspace-panel-group__inner\s*\{[\s\S]*min-width:\s*0;[\s\S]*min-height:\s*0;/,
    );
    expect(stylesheet).toMatch(
      /\.workspace-content-surface\s*\{[\s\S]*min-width:\s*0;[\s\S]*min-height:\s*0;[\s\S]*border-radius:\s*var\(--workspace-content-radius\);[\s\S]*overflow:\s*hidden;/,
    );
  });

  it("removes panel group padding in the minimal workspace", () => {
    expect(stylesheet).toMatch(
      /\[data-layout="minimal"\]\s+\.workspace-shell\s*>\s*\.workspace-panel-group\s*\{[^}]*padding:\s*0;/,
    );
  });

  it("lets the minimal panel group fit inside the workspace", () => {
    expect(stylesheet).toMatch(
      /\[data-layout="minimal"\]\s+\.workspace-shell\s*>\s*\.workspace-panel-group\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\);[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
    );
    expect(stylesheet).toMatch(
      /\[data-layout="minimal"\]\s+\.workspace-panel-group__inner\s*\{[\s\S]*width:\s*auto\s*!important;[\s\S]*height:\s*auto\s*!important;/,
    );
  });

  it("removes the minimal layout tab bar surfaces", () => {
    expect(stylesheet).toMatch(
      /\[data-layout="minimal"\]\s+\.editor-tab-bar\s*\{[\s\S]*background-color:\s*transparent !important;/,
    );
    expect(stylesheet).toMatch(
      /\[data-layout="minimal"\]\s+\.editor-tab-bar\s+\[role="tab"\]\s*\{[\s\S]*background-color:\s*transparent !important;/,
    );
  });

  it("uses a restrained minimal tab divider and compacts the single-tab state", () => {
    expect(stylesheet).toMatch(
      /\[data-layout="minimal"\]\s+\.editor-tab-bar\s+\[role="tablist"\]\s*\{[\s\S]*position:\s*relative;/,
    );
    expect(stylesheet).toMatch(
      /\[data-layout="minimal"\]\s+\.editor-tab-bar\s+\[role="tablist"\]::before\s*\{[\s\S]*top:\s*8px;[\s\S]*bottom:\s*8px;[\s\S]*width:\s*1px;[\s\S]*color-mix\(/,
    );
    expect(stylesheet).toMatch(
      /\[data-layout="minimal"\]\s+\.editor-tab-bar\s+\[role="tablist"\]:empty::before,[\s\S]*\.workspace-shell\[data-sidebar-collapsed="false"\][\s\S]*\.editor-tab-bar[\s\S]*\[role="tablist"\]::before\s*\{[\s\S]*display:\s*none;/,
    );
    expect(stylesheet).toMatch(
      /\[data-layout="minimal"\]\s+\.editor-tab-bar\s+\[role="tab"\]:only-child\s*\{[\s\S]*min-width:\s*0;[\s\S]*width:\s*max-content;[\s\S]*border-right:\s*0;/,
    );
  });

  it("exposes the native material behind the minimal sidebar", () => {
    expect(stylesheet).toMatch(
      /\[data-layout="minimal"\]\s+\.workspace-shell\s*\{[\s\S]*background-color:\s*transparent;/,
    );
    expect(stylesheet).toMatch(
      /\[data-layout="minimal"\]\s+\.app-window-surface\s*\{[^}]*background-color:\s*transparent !important;/,
    );
    expect(stylesheet).toMatch(
      /\.workspace-shell::before\s*\{[^}]*width:\s*var\(--workspace-sidebar-width,\s*0px\);/,
    );
  });

  it("matches the file tree material by layout", () => {
    expect(stylesheet).toMatch(
      /html\[data-layout="minimal"\]\s+body:has\(\.settings-sidebar\),\s*html\[data-layout="minimal"\]\s+\.app-window-surface:has\(\.settings-sidebar\)\s*\{[^}]*background-color:\s*transparent !important;/,
    );
    expect(stylesheet).toMatch(
      /\.settings-sidebar\s*\{[\s\S]*border-right:\s*var\(--sidebar-border,\s*1px solid var\(--border-color\)\) !important;[\s\S]*background-color:\s*var\(--sidebar-background,\s*var\(--bg-secondary\)\) !important;/,
    );
    expect(stylesheet).toMatch(
      /html\[data-layout="minimal"\]\s+\.settings-sidebar\s*\{[^}]*background-color:\s*transparent !important;/,
    );
    expect(stylesheet).toMatch(
      /\[data-layout="minimal"\]\s+\.workspace-shell::before,\s*html\[data-layout="minimal"\]\s+\.settings-sidebar::before\s*\{[\s\S]*var\(--sidebar-material-tint,\s*var\(--bg-secondary\)\)[\s\S]*var\(--sidebar-material-tint-opacity,\s*98%\)[\s\S]*-webkit-backdrop-filter:\s*blur\(36px\);[\s\S]*box-shadow:\s*inset -1px 0/,
    );
    expect(stylesheet).toMatch(
      /html\[data-layout="minimal"\]\s+\.settings-sidebar::before\s*\{[^}]*content:\s*"";[^}]*inset:\s*0;[^}]*z-index:\s*-1;/,
    );
    expect(stylesheet).toMatch(
      /\.workspace-shell\[data-native-material="true"\]::before,\s*html\[data-layout="minimal"\]:has\([\s\S]*\.workspace-shell\[data-native-material="true"\][\s\S]*\)\s+\.settings-sidebar::before\s*\{[\s\S]*backdrop-filter:\s*none;/,
    );
  });

  it("keeps the minimal layout bottom actions aligned with the sidebar material", () => {
    expect(stylesheet).toMatch(
      /\[data-layout="minimal"\]\s+\.file-tree-bottom-actions\s*\{[\s\S]*background-color:\s*var\(--sidebar-material-tint,\s*var\(--bg-secondary\)\);/,
    );
  });

  it("renders the minimal layout preview as two connected panels", () => {
    expect(stylesheet).toMatch(
      /\.layout-preview--minimal\s*\{[^}]*flex-direction:\s*row;[^}]*gap:\s*0;[^}]*border:\s*0;/,
    );
    expect(stylesheet).toMatch(
      /\.layout-preview__minimal-sidebar-panel,\s*\.layout-preview__minimal-editor-panel\s*\{[^}]*overflow:\s*hidden;[^}]*border:\s*1px solid color-mix\([^}]*border-radius:\s*5px;/,
    );
    expect(stylesheet).toMatch(
      /\.layout-preview--minimal\s+\.layout-preview__sidebar-row--active\s*\{[^}]*background-color:\s*var\(--text-muted\);/,
    );
  });
});
