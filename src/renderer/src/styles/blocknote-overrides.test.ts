import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  resolve(process.cwd(), "src/renderer/src/styles/blocknote-overrides.css"),
  "utf8",
);

function getRule(selector: string) {
  const escapedSelector = selector
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const matches = Array.from(
    stylesheet.matchAll(
      new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`, "g"),
    ),
  );
  return matches.at(-1)?.[1];
}

describe("blocknote overrides stylesheet", () => {
  it("defines theme-aware code block colors", () => {
    expect(getRule('.bn-root[data-color-scheme="light"]')).toMatch(
      /--editor-code-block-bg:\s*#f5f8ff;/,
    );
    expect(getRule('.bn-root[data-color-scheme="dark"]')).toMatch(
      /--editor-code-block-bg:\s*#0d1117;/,
    );
    expect(getRule('.bn-root[data-color-scheme="light"]')).toMatch(
      /--editor-code-token-keyword:\s*#a626a4;/,
    );
    expect(getRule('.bn-root[data-color-scheme="light"]')).toMatch(
      /--editor-code-token-string:\s*#50a14f;/,
    );
    expect(getRule('.bn-root[data-color-scheme="dark"]')).toMatch(
      /--editor-code-token-keyword:\s*#c678dd;/,
    );
    expect(getRule('.bn-root[data-color-scheme="dark"]')).toMatch(
      /--editor-code-token-string:\s*#98c379;/,
    );
    expect(getRule('.bn-root[data-color-scheme="light"]')).toMatch(
      /--editor-code-block-cursor:\s*#0969da;/,
    );
    expect(getRule('.bn-root[data-color-scheme="dark"]')).toMatch(
      /--editor-code-block-cursor:\s*#79c0ff;/,
    );
  });

  it("keeps rich editor content anchored to the panel left edge", () => {
    const editorRule = getRule(":is(.bn-editor, .bn-editor-preview)");

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

  it("disables native selection while a guarded rich-text drag is active", () => {
    const dragLockRule = getRule("html.rich-editor-selection-drag-locked *");

    expect(dragLockRule).toMatch(/-webkit-user-select:\s*none !important;/);
    expect(dragLockRule).toMatch(/user-select:\s*none !important;/);
  });

  it("keeps punctuation glyphs identical between live and preview renderers", () => {
    const editorRule = getRule(":is(.bn-editor, .bn-editor-preview)");

    expect(editorRule).toMatch(/font-variant-ligatures:\s*none;/);
    expect(editorRule).toMatch(/"liga"\s+0/);
    expect(editorRule).toMatch(/"clig"\s+0/);
    expect(editorRule).toMatch(/"calt"\s+0/);
  });

  it("keeps long inline content within the pane width", () => {
    const inlineContentRule = getRule(
      ":is(.bn-editor, .bn-editor-preview) .bn-inline-content",
    );

    expect(inlineContentRule).toBeDefined();
    expect(inlineContentRule).toMatch(/min-width:\s*0;/);
    expect(inlineContentRule).toMatch(/overflow-wrap:\s*anywhere;/);
  });

  it("skips offscreen live rich blocks during split and resize layout", () => {
    const liveBlockRule = getRule(
      "[data-rich-document-surface] .bn-editor > .bn-block-group > .bn-block-outer",
    );

    expect(liveBlockRule).toBeDefined();
    expect(liveBlockRule).toMatch(/content-visibility:\s*auto;/);
    expect(liveBlockRule).toMatch(/contain-intrinsic-block-size:\s*auto 80px;/);
  });

  it("skips offscreen overscan blocks in virtual rich previews", () => {
    const previewBlockRule = getRule(".rich-virtual-preview__block");

    expect(previewBlockRule).toBeDefined();
    expect(previewBlockRule).toMatch(/content-visibility:\s*auto;/);
    expect(previewBlockRule).toMatch(
      /contain-intrinsic-block-size:\s*auto 64px;/,
    );
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
    expect(stylesheet).toMatch(
      /\.bn-block-content\[data-content-type="checkListItem"\] > div > input\s*\{[\s\S]*border-radius:\s*4px;/,
    );
    expect(stylesheet).toMatch(
      /\.bn-block-content\[data-content-type="checkListItem"\]\[data-checked="true"\]\s+\.bn-inline-content\s*\{[\s\S]*color:\s*var\(--text-muted\);[\s\S]*text-decoration:\s*line-through;/,
    );
  });

  it("renders quotes as a left rule instead of a bordered card", () => {
    const quoteRule = getRule(
      ':is(.bn-editor, .bn-editor-preview) [data-content-type="quote"] blockquote',
    );

    expect(quoteRule).toBeDefined();
    expect(quoteRule).toMatch(
      /border-left:\s*3px solid var\(--accent-color\);/,
    );
    expect(quoteRule).toMatch(/border-radius:\s*0;/);
    expect(quoteRule).not.toMatch(/border:\s*1px solid/);
    expect(stylesheet).toMatch(
      /:is\(\.bn-editor, \.bn-editor-preview\)\s+\.bn-block-content\[data-content-type="quote"\]:has\(\s*\.ProseMirror-trailingBreak:only-child\s*\)\s*\{[\s\S]*align-items:\s*center;/,
    );
    expect(stylesheet).toMatch(
      /:is\(\.bn-editor, \.bn-editor-preview\)\s+\.bn-block-content\[data-content-type="quote"\]:has\(\s*\.ProseMirror-trailingBreak:only-child\s*\)::after\s*\{[\s\S]*align-self:\s*center;/,
    );
  });

  it("keeps quote child blocks on one continuous quote surface", () => {
    expect(stylesheet).toMatch(
      /\.bn-block-outer:has\(\s*> \.bn-block > \.bn-block-content\[data-content-type="quote"\]\s*\):has\(\s*> \.bn-block > \.bn-block-group\s*\)\s*\{[\s\S]*padding-left:\s*0\.9em;[\s\S]*border-left:\s*3px solid var\(--accent-color\);/,
    );
    expect(stylesheet).toMatch(
      /\.bn-block-outer:has\(\s*> \.bn-block > \.bn-block-content\[data-content-type="quote"\]\s*\):has\(\s*> \.bn-block > \.bn-block-group\s*\)[\s\S]*\.bn-block-content\[data-content-type="quote"\]:has\(\s*\.ProseMirror-trailingBreak:only-child\s*\)\s*\{[\s\S]*block-size:\s*0;/,
    );
  });

  it("keeps bullet lists compact and readable across nested levels", () => {
    expect(stylesheet).toMatch(
      /:is\(\.bn-editor, \.bn-editor-preview\) ul\s*\{[\s\S]*padding-left:\s*1\.25em;/,
    );
    expect(stylesheet).toMatch(
      /:is\(\.bn-editor, \.bn-editor-preview\)\s+\.bn-block-content\[data-content-type="bulletListItem"\]\s*\{[\s\S]*align-items:\s*flex-start;/,
    );
    expect(stylesheet).toMatch(
      /:is\(\.bn-editor, \.bn-editor-preview\)\s+\.bn-block-content\[data-content-type="bulletListItem"\]::before,\s*:is\(\.bn-editor, \.bn-editor-preview\) li::marker\s*\{[\s\S]*font-size:\s*1\.15em;[\s\S]*line-height:\s*1;[\s\S]*color:\s*var\(--text-muted\);/,
    );
    expect(
      getRule(
        ':is(.bn-editor, .bn-editor-preview) .bn-block-content[data-content-type="bulletListItem"]::before',
      ),
    ).toMatch(
      /content:\s*"▪\\FE0E" !important;[\s\S]*transform:\s*translateY\(0\.25em\);[\s\S]*transition:\s*none;/,
    );
    expect(
      getRule(".rich-virtual-preview .bn-editor-preview ul li::marker"),
    ).toMatch(/content:\s*"▪\\FE0E";/);
    expect(stylesheet).toMatch(
      /:is\(\.bn-editor, \.bn-editor-preview\) ul ul\s*\{[\s\S]*margin-block:\s*0\.12em;/,
    );
  });

  it("removes BlockNote indent guide lines from nested blocks", () => {
    const indentGuideRule = getRule(
      ":is(.bn-editor, .bn-editor-preview) .bn-block-group .bn-block-group > .bn-block-outer::before",
    );

    expect(indentGuideRule).toBeDefined();
    expect(indentGuideRule).toMatch(/content:\s*none !important;/);
    expect(indentGuideRule).toMatch(/border-left:\s*0 !important;/);
    expect(indentGuideRule).toMatch(/display:\s*none !important;/);
  });

  it("defines custom code block surface and floating controls", () => {
    expect(getRule('.bn-block-content[data-content-type="codeBlock"]')).toMatch(
      /width:\s*100%;/,
    );
    expect(getRule('.bn-block-content[data-content-type="codeBlock"]')).toMatch(
      /max-width:\s*100%;/,
    );
    expect(getRule('.bn-block-content[data-content-type="codeBlock"]')).toMatch(
      /overflow:\s*visible;/,
    );
    expect(getRule(".editor-code-block-shell")).toMatch(/width:\s*100%;/);
    expect(getRule(".editor-code-block-shell")).toMatch(
      /background:\s*var\(--editor-code-block-bg\);/,
    );
    expect(getRule(".editor-code-block-shell")).toMatch(/overflow:\s*visible;/);
    expect(getRule(".editor-code-block-shell")).toMatch(
      /border:\s*1px solid var\(--editor-code-block-border\);/,
    );
    expect(getRule(".editor-code-block-language-trigger")).toMatch(
      /position:\s*absolute;/,
    );
    expect(getRule(".editor-code-block-copy")).toMatch(/position:\s*absolute;/);
    expect(getRule(".editor-code-block-copy")).toMatch(/width:\s*28px;/);
    expect(getRule(".editor-code-block-copy")).toMatch(/opacity:\s*0;/);
    expect(getRule(".editor-code-block-copy")).toMatch(
      /pointer-events:\s*none;/,
    );
    expect(
      getRule(".editor-code-block-shell:hover .editor-code-block-copy"),
    ).toMatch(/opacity:\s*1;/);
    expect(
      getRule(".editor-code-block-shell:hover .editor-code-block-copy"),
    ).toMatch(/pointer-events:\s*auto;/);
    expect(getRule(".editor-code-block__body")).toMatch(
      /background:\s*var\(--editor-code-block-bg\) !important;/,
    );
    expect(getRule(".editor-code-block__code-pane")).toMatch(
      /background:\s*var\(--editor-code-block-bg\) !important;/,
    );
    expect(getRule(".editor-code-block__pre")).toMatch(
      /background:\s*var\(--editor-code-block-bg\) !important;/,
    );
    expect(getRule(".editor-code-block__content")).toMatch(
      /background:\s*var\(--editor-code-block-bg\) !important;/,
    );
    expect(getRule(".editor-code-block__blocknote-content-pre")).toMatch(
      /position:\s*absolute;/,
    );
    expect(getRule(".editor-code-block__blocknote-content-pre")).toMatch(
      /clip:\s*rect\(0 0 0 0\);/,
    );
    expect(getRule(".editor-code-block__codemirror")).toMatch(
      /min-width:\s*max-content;/,
    );
    expect(getRule(".editor-code-block__codemirror .cm-gutters")).toMatch(
      /user-select:\s*none;/,
    );
    expect(getRule(".editor-code-block__codemirror .cm-gutters")).toMatch(
      /padding-top:\s*0 !important;/,
    );
    expect(getRule(".editor-code-block__codemirror .cm-gutters")).toMatch(
      /padding-bottom:\s*0 !important;/,
    );
    expect(getRule(".editor-code-block__codemirror .cm-gutterElement")).toMatch(
      /line-height:\s*1\.6rem !important;/,
    );
    expect(
      getRule(".editor-code-block__codemirror .cm-gutterElement"),
    ).not.toMatch(/display:\s*flex;/);
    expect(
      getRule(".editor-code-block__codemirror .cm-gutterElement"),
    ).not.toMatch(/align-items:/);
    expect(
      getRule(".editor-code-block__codemirror .cm-gutterElement"),
    ).not.toMatch(/min-height:/);
    expect(
      getRule(
        ".editor-code-block__codemirror .cm-lineNumbers .cm-gutterElement",
      ),
    ).toMatch(/text-align:\s*right;/);
    expect(getRule(".editor-code-block__codemirror .cm-line")).toMatch(
      /line-height:\s*1\.6rem !important;/,
    );
    expect(
      getRule(".editor-code-block__codemirror .cm-foldPlaceholder"),
    ).toMatch(
      /background:\s*color-mix\(\s*in srgb,\s*var\(--editor-code-block-fold-bg\) 68%,\s*transparent\s*\);/,
    );
    expect(stylesheet).not.toMatch(
      /\.editor-code-block__content \.shiki\s*\{[\s\S]*color:/,
    );
    expect(stylesheet).not.toMatch(/--editor-code-token-filter/);
    expect(stylesheet).not.toMatch(/editor-code-block__fold-preview/);
    expect(stylesheet).not.toMatch(/editor-code-block__code-pane--folded/);
  });

  it("keeps the code language trigger on one line inside the code block", () => {
    expect(getRule(".editor-code-block__language-wrap")).toMatch(/flex:\s*1;/);
    expect(getRule(".editor-code-block__language-wrap")).toMatch(
      /min-width:\s*0;/,
    );
    expect(getRule(".editor-code-block__language-wrap")).toMatch(
      /margin-right:\s*36px;/,
    );
    expect(getRule(".editor-code-block-language-trigger")).toMatch(
      /max-width:\s*100%;/,
    );
    expect(getRule(".editor-code-block-language-trigger > span")).toMatch(
      /min-width:\s*0;/,
    );
    expect(getRule(".editor-code-block-language-trigger > span")).toMatch(
      /overflow:\s*hidden;/,
    );
    expect(getRule(".editor-code-block-language-trigger > span")).toMatch(
      /text-overflow:\s*ellipsis;/,
    );
    expect(getRule(".editor-code-block-language-trigger > span")).toMatch(
      /white-space:\s*nowrap;/,
    );
    expect(getRule(".editor-code-block-language-trigger > svg")).toMatch(
      /flex-shrink:\s*0;/,
    );
  });

  it("pins Bash and Text to the default code color at regular weight", () => {
    const plainCodeRule = getRule(
      `:is(
        .editor-code-block-shell[data-language="bash"],
        .editor-code-block-shell[data-language="text"]
      )
        .editor-code-block__codemirror
        .cm-content`,
    );

    expect(plainCodeRule).toBeDefined();
    expect(plainCodeRule).toMatch(/color:\s*var\(--editor-code-block-text\);/);
    expect(plainCodeRule).toMatch(
      /font-family:\s*"PingFang SC",\s*"Microsoft YaHei UI",\s*"Noto Sans CJK SC",\s*system-ui,\s*sans-serif;/,
    );
    expect(plainCodeRule).toMatch(/font-weight:\s*400;/);
    expect(stylesheet).not.toMatch(/--editor-code-plain-text/);
  });

  it("styles inline code marks inside rich editor text blocks", () => {
    const inlineCodeRule = getRule(
      ":is(.bn-editor, .bn-editor-preview) code:not(.editor-code-block__content)",
    );

    expect(inlineCodeRule).toBeDefined();
    expect(inlineCodeRule).toMatch(
      /background-color:\s*var\(--bg-tertiary\) !important;/,
    );
    expect(inlineCodeRule).toMatch(
      /color:\s*var\(--accent-color\) !important;/,
    );
    expect(inlineCodeRule).toMatch(/font-family:[\s\S]*monospace !important;/);
  });

  it("polishes the custom language search popover", () => {
    const popoverRule = getRule(".editor-code-block-language-popover");

    expect(popoverRule).toBeDefined();
    expect(popoverRule).toMatch(
      /background:\s*var\(--editor-code-block-popover-bg\);/,
    );
    expect(popoverRule).toMatch(/border-radius:\s*10px;/);
    expect(popoverRule).toMatch(/pointer-events:\s*auto;/);
    expect(popoverRule).toMatch(
      /box-shadow:\s*var\(--editor-code-block-popover-shadow\);/,
    );
    expect(stylesheet).toMatch(
      /\.editor-code-block-language-popover input\[type="search"\]\s*\{[\s\S]*background:\s*transparent !important;/,
    );
    expect(stylesheet).toMatch(
      /\.editor-code-block-language-popover input\[type="search"\]\s*\{[\s\S]*outline:\s*none !important;/,
    );
    expect(stylesheet).toMatch(
      /\.editor-code-block__language-option\[aria-selected="true"\]\s*\{[\s\S]*background:\s*color-mix\(in srgb,\s*var\(--accent-color\) 22%,\s*transparent\);/,
    );
    expect(stylesheet).toMatch(
      /\.editor-code-block-language-empty\s*\{[\s\S]*text-align:\s*center;/,
    );
  });

  it("raises an open code language popover above adjacent code blocks", () => {
    expect(stylesheet).toMatch(
      /\.bn-block-content\[data-content-type="codeBlock"\]:has\(\s*\.editor-code-block-language-popover\s*\)\s*\{[\s\S]*position:\s*relative;/,
    );
    expect(stylesheet).toMatch(
      /\.bn-block-content\[data-content-type="codeBlock"\]:has\(\s*\.editor-code-block-language-popover\s*\)\s*\{[\s\S]*z-index:\s*20;/,
    );
    expect(
      getRule(
        ".editor-code-block__toolbar:has(.editor-code-block-language-popover)",
      ),
    ).toMatch(/z-index:\s*60;/);
  });

  it("disables block paint containment while a code language popover is open", () => {
    expect(
      getRule(
        "[data-rich-document-surface] .bn-editor > .bn-block-group > .bn-block-outer:has(.editor-code-block-language-popover)",
      ),
    ).toMatch(/content-visibility:\s*visible;/);
  });

  it("keeps the code block copy action hidden until hover", () => {
    expect(getRule(".editor-code-block-copy")).toMatch(/opacity:\s*0;/);
    expect(
      getRule(".editor-code-block-shell:hover .editor-code-block-copy"),
    ).toMatch(/opacity:\s*1;/);
    expect(stylesheet).not.toMatch(
      /\.editor-code-block-shell:focus-within \.editor-code-block-copy/,
    );
  });

  it("keeps CodeMirror selection color consistent with rich text selection", () => {
    expect(
      getRule(
        ".editor-code-block__codemirror .cm-editor.cm-focused:hover .cm-selectionBackground",
      ),
    ).toMatch(/background-color:\s*var\(--accent-color\) !important;/);
    expect(
      getRule(
        ".editor-code-block__codemirror .cm-editor.cm-focused:not(:hover) .cm-selectionBackground, .editor-code-block__codemirror .cm-editor:not(.cm-focused) .cm-selectionBackground",
      ),
    ).toMatch(/background-color:\s*transparent !important;/);
    expect(
      getRule(".editor-code-block__codemirror .cm-content ::selection"),
    ).toMatch(/background-color:\s*var\(--accent-color\) !important;/);
  });

  it("only shows the focused CodeMirror cursor while the pointer is inside", () => {
    const cursorRule = getRule(
      ".editor-code-block__codemirror .cm-editor.cm-focused:hover .cm-cursor",
    );

    expect(cursorRule).toMatch(
      /border-left-color:\s*var\(--editor-code-block-cursor\) !important;/,
    );
    expect(cursorRule).toMatch(/border-left-style:\s*solid !important;/);
    expect(cursorRule).toMatch(
      /border-left-width:\s*var\(--editor-code-block-cursor-width, 2px\) !important;/,
    );
    expect(
      getRule(
        ".editor-code-block__codemirror .cm-editor.cm-focused:not(:hover) .cm-cursor",
      ),
    ).toMatch(/border-left-color:\s*transparent !important;/);
  });

  it("draws a fallback cursor while an empty CodeMirror document has no cursor layer", () => {
    const cursorRule = getRule(
      ".editor-code-block__codemirror .cm-editor.cm-focused:hover:not(:has(.cm-cursor-primary)) .cm-content > .cm-line:only-child:has(> br:only-child)::before",
    );

    expect(cursorRule).toMatch(/content:\s*"";/);
    expect(cursorRule).toMatch(/position:\s*absolute;/);
    expect(cursorRule).toMatch(
      /border-left:\s*var\(--editor-code-block-cursor-width, 2px\) solid\s+var\(--editor-code-block-cursor\);/,
    );
  });

  it("keeps paragraph text aligned with the block side menu", () => {
    expect(getRule('.bn-block-content[data-content-type="paragraph"]')).toMatch(
      /margin-top:\s*0;/,
    );
  });

  it("keeps heading text aligned with the block side menu", () => {
    expect(getRule(":is(.bn-editor, .bn-editor-preview) h1")).toMatch(
      /margin-top:\s*0;/,
    );
    expect(getRule(":is(.bn-editor, .bn-editor-preview) h2")).toMatch(
      /margin-top:\s*0;/,
    );
    expect(getRule(":is(.bn-editor, .bn-editor-preview) h3")).toMatch(
      /margin-top:\s*0;/,
    );
  });

  it("aligns the code block side menu with the code block header row", () => {
    expect(getRule('.bn-side-menu[data-block-type="codeBlock"]')).toMatch(
      /display:\s*flex;/,
    );
    expect(getRule('.bn-side-menu[data-block-type="codeBlock"]')).toMatch(
      /height:\s*72px;/,
    );
    expect(getRule('.bn-side-menu[data-block-type="codeBlock"]')).toMatch(
      /align-items:\s*center;/,
    );
    expect(getRule('.bn-side-menu[data-block-type="codeBlock"]')).toMatch(
      /pointer-events:\s*none;/,
    );
    expect(
      getRule(
        '.bn-side-menu[data-block-type="codeBlock"] .mantine-UnstyledButton-root',
      ),
    ).toMatch(/align-items:\s*center;/);
    expect(
      getRule(
        '.bn-side-menu[data-block-type="codeBlock"] .mantine-UnstyledButton-root',
      ),
    ).toMatch(/pointer-events:\s*auto;/);
  });

  it("keeps the transparent block side menu hitbox from catching text selection drags", () => {
    expect(getRule(".bn-side-menu")).toMatch(/pointer-events:\s*none;/);
    expect(getRule(".bn-side-menu .mantine-UnstyledButton-root")).toMatch(
      /pointer-events:\s*auto;/,
    );
  });

  it("aligns the quote block side menu with the quote content", () => {
    expect(getRule('.bn-side-menu[data-block-type="quote"]')).toMatch(
      /display:\s*flex;/,
    );
    expect(getRule('.bn-side-menu[data-block-type="quote"]')).toMatch(
      /height:\s*58px;/,
    );
    expect(getRule('.bn-side-menu[data-block-type="quote"]')).toMatch(
      /align-items:\s*center;/,
    );
    expect(getRule('.bn-side-menu[data-block-type="quote"]')).toMatch(
      /pointer-events:\s*none;/,
    );
    expect(
      getRule(
        '.bn-side-menu[data-block-type="quote"] .mantine-UnstyledButton-root',
      ),
    ).toMatch(/align-items:\s*center;/);
    expect(
      getRule(
        '.bn-side-menu[data-block-type="quote"] .mantine-UnstyledButton-root',
      ),
    ).toMatch(/pointer-events:\s*auto;/);
  });

  it("keeps the aligned quote parent side menu hoverable across its gap", () => {
    expect(getRule(".editor-side-menu")).toMatch(/display:\s*flex;/);
    expect(
      getRule('.editor-side-menu[data-quote-has-children="true"]'),
    ).toMatch(/padding-right:\s*16px;/);

    const quoteSideMenuRule = getRule(
      '.editor-side-menu[data-quote-has-children="true"] .bn-side-menu[data-block-type="quote"]',
    );
    expect(quoteSideMenuRule).toMatch(/height:\s*30px;/);
    expect(quoteSideMenuRule).toMatch(/margin-right:\s*0\s*!important;/);
    expect(quoteSideMenuRule).not.toMatch(/transform:/);
  });

  it("removes the default nested-block indent from direct quote children", () => {
    expect(stylesheet).toMatch(
      /\.bn-block-outer:has\(\s*> \.bn-block > \.bn-block-content\[data-content-type="quote"\]\s*\):has\(\s*> \.bn-block > \.bn-block-group\s*\)[\s\S]*> \.bn-block[\s\S]*> \.bn-block-group\s*\{[\s\S]*margin-left:\s*0;/,
    );
  });

  it("keeps the table wrapper and extend row button within the editor width", () => {
    expect(stylesheet).toMatch(
      /:is\(\.bn-editor, \.bn-editor-preview\) \[data-content-type="table"\] table\s*\{[\s\S]*width:\s*max-content;/,
    );
    expect(stylesheet).toMatch(
      /\.bn-mantine \.bn-extend-button-add-remove-rows\s*\{[\s\S]*width:\s*calc\(100% - 22px\);/,
    );
  });
});
