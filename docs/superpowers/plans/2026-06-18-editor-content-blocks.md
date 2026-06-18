# Editor Content Blocks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve rich Markdown block rendering for checklists, bullet lists, quotes, and Shiki-highlighted code blocks with a polished searchable language picker and floating copy button.

**Architecture:** Keep the existing BlockNote editor lifecycle and Markdown persistence pipeline. Add small editor code-block helper modules, replace only the BlockNote `codeBlock` render implementation while reusing BlockNote's default parsing, keyboard shortcuts, input rules, and Shiki extension, then polish checklist, bullet list, quote, and code block CSS.

**Tech Stack:** Electron, Vite, React 19, TypeScript, BlockNote 0.51, Shiki 3, Vitest, CSS.

---

## File Structure

- Create `src/renderer/src/features/editor/lib/editor-code-block-languages.ts`
  - Owns the common language list, aliases, labels, search, and fallback helpers.
- Create `src/renderer/src/features/editor/lib/editor-code-block-languages.test.ts`
  - Tests language lookup and search behavior.
- Create `src/renderer/src/features/editor/components/editor-code-block.tsx`
  - React renderer for BlockNote `codeBlock`: language pill, searchable popover, line numbers, editable code content, and copy button.
- Create `src/renderer/src/features/editor/components/editor-code-block.test.tsx`
  - Tests the renderer helpers and user-facing copy/search interactions where jsdom can support them.
- Create `src/renderer/src/features/editor/lib/blocknote-schema.ts`
  - Builds the editor schema by reusing default BlockNote blocks and replacing `codeBlock`.
- Modify `src/renderer/src/features/editor/components/blocknote-editor.tsx`
  - Passes the custom schema to `useCreateBlockNote`.
- Modify `src/renderer/src/styles/blocknote-overrides.css`
  - Updates checklist, bullet list, quote, code block shell, language search popover, line numbers, copy button, and Shiki token styling.
- Modify `src/renderer/src/styles/blocknote-overrides.test.ts`
  - Adds stylesheet regression assertions.
- Modify `src/renderer/src/features/editor/lib/markdown.test.ts`
  - Adds a focused code fence round-trip preservation case.

## Task 1: Language Catalog And Search Helpers

**Files:**
- Create: `src/renderer/src/features/editor/lib/editor-code-block-languages.ts`
- Create: `src/renderer/src/features/editor/lib/editor-code-block-languages.test.ts`

- [ ] **Step 1: Write the failing language helper tests**

Create `src/renderer/src/features/editor/lib/editor-code-block-languages.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  CODE_BLOCK_LANGUAGE_OPTIONS,
  findCodeBlockLanguage,
  getCodeBlockLanguageLabel,
  getCodeBlockLanguageShortLabel,
  getSupportedCodeBlockLanguageId,
  searchCodeBlockLanguages,
} from "./editor-code-block-languages";

describe("editor code block languages", () => {
  it("defines a focused common language set", () => {
    expect(CODE_BLOCK_LANGUAGE_OPTIONS.map((item) => item.id)).toEqual([
      "text",
      "javascript",
      "typescript",
      "jsx",
      "tsx",
      "vue",
      "html",
      "css",
      "scss",
      "json",
      "markdown",
      "bash",
      "python",
      "java",
      "go",
      "rust",
      "c",
      "cpp",
      "csharp",
      "sql",
      "yaml",
      "toml",
      "xml",
      "dockerfile",
      "diff",
    ]);
  });

  it("resolves ids and aliases without changing unsupported languages", () => {
    expect(getSupportedCodeBlockLanguageId("js")).toBe("javascript");
    expect(getSupportedCodeBlockLanguageId("ts")).toBe("typescript");
    expect(getSupportedCodeBlockLanguageId("c++")).toBe("cpp");
    expect(getSupportedCodeBlockLanguageId("unknownlang")).toBe(
      "unknownlang",
    );
    expect(getSupportedCodeBlockLanguageId("")).toBe("text");
  });

  it("returns labels for known languages and readable fallback labels", () => {
    expect(getCodeBlockLanguageLabel("typescript")).toBe("TypeScript");
    expect(getCodeBlockLanguageShortLabel("typescript")).toBe("ts");
    expect(getCodeBlockLanguageLabel("unknownlang")).toBe("unknownlang");
    expect(getCodeBlockLanguageShortLabel("unknownlang")).toBe("unknownlang");
  });

  it("finds languages by id, label, and aliases", () => {
    expect(findCodeBlockLanguage("py")?.id).toBe("python");
    expect(searchCodeBlockLanguages("script").map((item) => item.id)).toEqual([
      "javascript",
      "typescript",
    ]);
    expect(searchCodeBlockLanguages("yml").map((item) => item.id)).toEqual([
      "yaml",
    ]);
    expect(searchCodeBlockLanguages("zzzz")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the failing language helper tests**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/editor-code-block-languages.test.ts
```

Expected: FAIL because `editor-code-block-languages.ts` does not exist.

- [ ] **Step 3: Implement the language helpers**

Create `src/renderer/src/features/editor/lib/editor-code-block-languages.ts`:

```ts
export interface CodeBlockLanguageOption {
  id: string;
  label: string;
  shortLabel: string;
  aliases: string[];
}

export const CODE_BLOCK_LANGUAGE_OPTIONS: CodeBlockLanguageOption[] = [
  { id: "text", label: "Plain Text", shortLabel: "text", aliases: ["txt", "plain", "plaintext"] },
  { id: "javascript", label: "JavaScript", shortLabel: "js", aliases: ["js", "mjs", "cjs"] },
  { id: "typescript", label: "TypeScript", shortLabel: "ts", aliases: ["ts"] },
  { id: "jsx", label: "JSX", shortLabel: "jsx", aliases: [] },
  { id: "tsx", label: "TSX", shortLabel: "tsx", aliases: [] },
  { id: "vue", label: "Vue", shortLabel: "vue", aliases: [] },
  { id: "html", label: "HTML", shortLabel: "html", aliases: ["htm"] },
  { id: "css", label: "CSS", shortLabel: "css", aliases: [] },
  { id: "scss", label: "SCSS", shortLabel: "scss", aliases: ["sass"] },
  { id: "json", label: "JSON", shortLabel: "json", aliases: ["jsonc"] },
  { id: "markdown", label: "Markdown", shortLabel: "md", aliases: ["md", "mdx"] },
  { id: "bash", label: "Bash", shortLabel: "sh", aliases: ["sh", "shell", "zsh"] },
  { id: "python", label: "Python", shortLabel: "py", aliases: ["py"] },
  { id: "java", label: "Java", shortLabel: "java", aliases: [] },
  { id: "go", label: "Go", shortLabel: "go", aliases: ["golang"] },
  { id: "rust", label: "Rust", shortLabel: "rs", aliases: ["rs"] },
  { id: "c", label: "C", shortLabel: "c", aliases: [] },
  { id: "cpp", label: "C++", shortLabel: "cpp", aliases: ["c++", "cc", "cxx"] },
  { id: "csharp", label: "C#", shortLabel: "cs", aliases: ["cs", "c#"] },
  { id: "sql", label: "SQL", shortLabel: "sql", aliases: [] },
  { id: "yaml", label: "YAML", shortLabel: "yml", aliases: ["yml"] },
  { id: "toml", label: "TOML", shortLabel: "toml", aliases: [] },
  { id: "xml", label: "XML", shortLabel: "xml", aliases: [] },
  { id: "dockerfile", label: "Dockerfile", shortLabel: "docker", aliases: ["docker"] },
  { id: "diff", label: "Diff", shortLabel: "diff", aliases: ["patch"] },
];

const normalizedLanguageEntries = CODE_BLOCK_LANGUAGE_OPTIONS.flatMap(
  (language) => [
    language.id,
    language.label,
    language.shortLabel,
    ...language.aliases,
  ].map((value) => ({
    key: value.toLowerCase(),
    language,
  })),
);

export function findCodeBlockLanguage(
  language: string | undefined,
): CodeBlockLanguageOption | undefined {
  const normalized = language?.trim().toLowerCase();
  if (!normalized) return CODE_BLOCK_LANGUAGE_OPTIONS[0];

  return normalizedLanguageEntries.find((entry) => entry.key === normalized)
    ?.language;
}

export function getSupportedCodeBlockLanguageId(language: string): string {
  const normalized = language.trim();
  if (!normalized) return "text";

  return findCodeBlockLanguage(normalized)?.id ?? normalized;
}

export function getCodeBlockLanguageLabel(language: string): string {
  return findCodeBlockLanguage(language)?.label ?? language;
}

export function getCodeBlockLanguageShortLabel(language: string): string {
  return findCodeBlockLanguage(language)?.shortLabel ?? language;
}

export function searchCodeBlockLanguages(
  query: string,
): CodeBlockLanguageOption[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return CODE_BLOCK_LANGUAGE_OPTIONS;

  return CODE_BLOCK_LANGUAGE_OPTIONS.filter((language) =>
    [language.id, language.label, language.shortLabel, ...language.aliases]
      .map((value) => value.toLowerCase())
      .some((value) => value.includes(normalized)),
  );
}
```

- [ ] **Step 4: Run the language helper tests**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/editor-code-block-languages.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/renderer/src/features/editor/lib/editor-code-block-languages.ts src/renderer/src/features/editor/lib/editor-code-block-languages.test.ts
git commit -m "feat: add editor code block language helpers"
```

## Task 2: Custom Code Block Renderer

**Files:**
- Create: `src/renderer/src/features/editor/components/editor-code-block.tsx`
- Create: `src/renderer/src/features/editor/components/editor-code-block.test.tsx`

- [ ] **Step 1: Write failing renderer tests**

Create `src/renderer/src/features/editor/components/editor-code-block.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  EditorCodeBlock,
  getCodeBlockLineNumbers,
  readCodeBlockText,
} from "./editor-code-block";

function renderCodeBlock(language = "javascript") {
  const updateBlock = vi.fn();
  const block = {
    id: "block-1",
    type: "codeBlock",
    props: { language },
  };

  render(
    <EditorCodeBlock
      block={block}
      editor={{ updateBlock } as never}
      contentRef={() => undefined}
    />,
  );

  return { updateBlock };
}

describe("EditorCodeBlock", () => {
  it("counts line numbers from code text", () => {
    expect(getCodeBlockLineNumbers("one\ntwo\nthree")).toEqual([1, 2, 3]);
    expect(getCodeBlockLineNumbers("")).toEqual([1]);
  });

  it("reads only code text from the code content element", () => {
    const element = document.createElement("code");
    element.textContent = "const value = 1;\nconsole.log(value);";

    expect(readCodeBlockText(element)).toBe(
      "const value = 1;\nconsole.log(value);",
    );
  });

  it("renders a polished language picker and updates the block language", async () => {
    const user = userEvent.setup();
    const { updateBlock } = renderCodeBlock("javascript");

    await user.click(screen.getByRole("button", { name: /change code language/i }));
    const popover = screen.getByRole("dialog", { name: /code language/i });
    await user.type(within(popover).getByRole("searchbox"), "type");
    await user.click(within(popover).getByRole("option", { name: /typescript/i }));

    expect(updateBlock).toHaveBeenCalledWith("block-1", {
      props: { language: "typescript" },
    });
  });

  it("copies only the code content", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderCodeBlock("javascript");

    const code = screen.getByTestId("editor-code-block-content");
    code.textContent = "console.log('copy me');";
    await user.click(screen.getByRole("button", { name: /copy code/i }));

    expect(writeText).toHaveBeenCalledWith("console.log('copy me');");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the failing renderer tests**

Run:

```bash
pnpm test src/renderer/src/features/editor/components/editor-code-block.test.tsx
```

Expected: FAIL because `editor-code-block.tsx` does not exist.

- [ ] **Step 3: Implement the renderer component**

Create `src/renderer/src/features/editor/components/editor-code-block.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BlockNoteEditor } from "@blocknote/core";
import { Check, ChevronDown, Clipboard, Search } from "lucide-react";

import {
  getCodeBlockLanguageLabel,
  getCodeBlockLanguageShortLabel,
  searchCodeBlockLanguages,
} from "../lib/editor-code-block-languages";

interface EditorCodeBlockProps {
  block: {
    id: string;
    props: {
      language: string;
    };
  };
  editor: BlockNoteEditor<any, any, any>;
  contentRef: (node: HTMLElement | null) => void;
}

export function getCodeBlockLineNumbers(text: string): number[] {
  const lineCount = Math.max(1, text.split("\n").length);
  return Array.from({ length: lineCount }, (_, index) => index + 1);
}

export function readCodeBlockText(element: HTMLElement | null): string {
  return element?.textContent ?? "";
}

export function EditorCodeBlock({
  block,
  editor,
  contentRef,
}: EditorCodeBlockProps) {
  const codeRef = useRef<HTMLElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [lineNumbers, setLineNumbers] = useState([1]);
  const language = block.props.language || "text";
  const languageOptions = useMemo(() => searchCodeBlockLanguages(query), [query]);

  const setCodeElement = useCallback(
    (node: HTMLElement | null) => {
      codeRef.current = node;
      contentRef(node);
      setLineNumbers(getCodeBlockLineNumbers(readCodeBlockText(node)));
    },
    [contentRef],
  );

  useEffect(() => {
    const element = codeRef.current;
    if (!element) return;

    const observer = new MutationObserver(() => {
      setLineNumbers(getCodeBlockLineNumbers(readCodeBlockText(element)));
    });
    observer.observe(element, {
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isPickerOpen) return;
    searchInputRef.current?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsPickerOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isPickerOpen]);

  useEffect(
    () => () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    },
    [],
  );

  const updateLanguage = useCallback(
    (nextLanguage: string) => {
      editor.updateBlock(block.id, { props: { language: nextLanguage } });
      setIsPickerOpen(false);
      setQuery("");
    },
    [block.id, editor],
  );

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(readCodeBlockText(codeRef.current));
      setCopied(true);
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }, []);

  return (
    <div className="editor-code-block-shell">
      <div className="editor-code-block-controls" contentEditable={false}>
        <div ref={popoverRef} className="editor-code-block-language">
          <button
            type="button"
            className="editor-code-block-language-trigger"
            aria-label="Change code language"
            aria-expanded={isPickerOpen}
            onClick={() => setIsPickerOpen((value) => !value)}
          >
            <span>{getCodeBlockLanguageShortLabel(language)}</span>
            <ChevronDown size={12} aria-hidden="true" />
          </button>

          {isPickerOpen ? (
            <div
              className="editor-code-block-language-popover"
              role="dialog"
              aria-label="Code language"
            >
              <label className="editor-code-block-language-search">
                <Search size={14} aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  placeholder="Search language"
                  aria-label="Search code language"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="editor-code-block-language-list" role="listbox">
                {languageOptions.length > 0 ? (
                  languageOptions.map((option) => {
                    const selected = option.id === language;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className="editor-code-block-language-option"
                        onClick={() => updateLanguage(option.id)}
                      >
                        <span>
                          <strong>{option.label}</strong>
                          <small>{option.id}</small>
                        </span>
                        {selected ? <Check size={14} aria-hidden="true" /> : null}
                      </button>
                    );
                  })
                ) : (
                  <div className="editor-code-block-language-empty">
                    No languages found
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="editor-code-block-copy"
          aria-label="Copy code"
          onClick={copyCode}
        >
          <Clipboard size={13} aria-hidden="true" />
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>

      <div className="editor-code-block-body">
        <div className="editor-code-block-gutter" aria-hidden="true">
          {lineNumbers.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
        <pre className="editor-code-block-pre">
          <code
            ref={setCodeElement}
            data-testid="editor-code-block-content"
            data-language={language}
            className={`language-${language}`}
            aria-label={`${getCodeBlockLanguageLabel(language)} code`}
          />
        </pre>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the renderer tests**

Run:

```bash
pnpm test src/renderer/src/features/editor/components/editor-code-block.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/renderer/src/features/editor/components/editor-code-block.tsx src/renderer/src/features/editor/components/editor-code-block.test.tsx
git commit -m "feat: add custom editor code block renderer"
```

## Task 3: BlockNote Schema With Shiki Code Blocks

**Files:**
- Create: `src/renderer/src/features/editor/lib/blocknote-schema.ts`
- Modify: `src/renderer/src/features/editor/components/blocknote-editor.tsx`

- [ ] **Step 1: Write a failing schema test**

Create `src/renderer/src/features/editor/lib/blocknote-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { editorBlockSpecs, editorCodeBlockSupportedLanguages } from "./blocknote-schema";

describe("editor BlockNote schema", () => {
  it("replaces the default code block while preserving common blocks", () => {
    expect(Object.keys(editorBlockSpecs)).toContain("paragraph");
    expect(Object.keys(editorBlockSpecs)).toContain("quote");
    expect(Object.keys(editorBlockSpecs)).toContain("checkListItem");
    expect(Object.keys(editorBlockSpecs)).toContain("bulletListItem");
    expect(editorBlockSpecs.codeBlock.config.type).toBe("codeBlock");
  });

  it("configures Shiki supported language metadata", () => {
    expect(editorCodeBlockSupportedLanguages.javascript).toEqual({
      name: "JavaScript",
      aliases: ["js", "mjs", "cjs"],
    });
    expect(editorCodeBlockSupportedLanguages.typescript.aliases).toContain("ts");
    expect(editorCodeBlockSupportedLanguages.cpp.aliases).toContain("c++");
  });
});
```

- [ ] **Step 2: Run the failing schema test**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/blocknote-schema.test.ts
```

Expected: FAIL because `blocknote-schema.ts` does not exist.

- [ ] **Step 3: Implement the custom schema**

Create `src/renderer/src/features/editor/lib/blocknote-schema.ts`:

```ts
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  type CodeBlockOptions,
} from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { createCodeBlockConfig, createCodeBlockSpec } from "@blocknote/core/blocks";
import { createHighlighter } from "shiki";

import { EditorCodeBlock } from "../components/editor-code-block";
import { CODE_BLOCK_LANGUAGE_OPTIONS } from "./editor-code-block-languages";

export const editorCodeBlockSupportedLanguages: NonNullable<
  CodeBlockOptions["supportedLanguages"]
> = Object.fromEntries(
  CODE_BLOCK_LANGUAGE_OPTIONS.map((language) => [
    language.id,
    {
      name: language.label,
      aliases: language.aliases,
    },
  ]),
);

const codeBlockOptions: Partial<CodeBlockOptions> = {
  defaultLanguage: "text",
  supportedLanguages: editorCodeBlockSupportedLanguages,
  createHighlighter: () =>
    createHighlighter({
      langs: CODE_BLOCK_LANGUAGE_OPTIONS.map((language) => language.id),
      themes: ["github-dark", "github-light"],
    }),
};

const baseCodeBlockSpec = createCodeBlockSpec(codeBlockOptions);

const editorCodeBlockSpec = createReactBlockSpec(
  createCodeBlockConfig(codeBlockOptions),
  {
    ...baseCodeBlockSpec.implementation,
    render: EditorCodeBlock,
    toExternalHTML: ({ block, contentRef }) => {
      const language = block.props.language || "text";

      return (
        <pre>
          <code
            ref={contentRef}
            className={`language-${language}`}
            data-language={language}
          />
        </pre>
      );
    },
  },
  baseCodeBlockSpec.extensions,
)();

export const editorBlockSpecs = {
  ...defaultBlockSpecs,
  codeBlock: editorCodeBlockSpec,
};

export const editorSchema = BlockNoteSchema.create({
  blockSpecs: editorBlockSpecs,
});
```

- [ ] **Step 4: Pass the schema into the BlockNote editor**

Modify `src/renderer/src/features/editor/components/blocknote-editor.tsx`:

```tsx
import { editorSchema } from "../lib/blocknote-schema";
```

Change the editor creation:

```tsx
const editor = useCreateBlockNote({ initialContent: undefined, schema: editorSchema });
```

- [ ] **Step 5: Run the schema test**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/blocknote-schema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the existing Markdown adapter tests**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/markdown.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/renderer/src/features/editor/lib/blocknote-schema.ts src/renderer/src/features/editor/lib/blocknote-schema.test.ts src/renderer/src/features/editor/components/blocknote-editor.tsx
git commit -m "feat: wire custom BlockNote code block schema"
```

## Task 4: Markdown Code Fence Regression

**Files:**
- Modify: `src/renderer/src/features/editor/lib/markdown.test.ts`

- [ ] **Step 1: Write a failing code fence preservation test**

Add this test under `describe("preserveMarkdownSource", () => { ... })` in `src/renderer/src/features/editor/lib/markdown.test.ts`:

```ts
  it("preserves fenced code language and content when editing surrounding text", () => {
    const source = [
      "Before",
      "",
      "```ts",
      "const value = 1;",
      "```",
      "",
      "After",
      "",
    ].join("\n");
    const baseline = source;
    const edited = source.replace("Before", "Before edit");

    expect(preserveMarkdownSource(source, baseline, edited)).toBe(
      source.replace("Before", "Before edit"),
    );
  });
```

- [ ] **Step 2: Run the focused Markdown test**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/markdown.test.ts
```

Expected: PASS. If it fails, fix `preserveMarkdownSource` with the smallest mapping correction that preserves existing tests.

- [ ] **Step 3: Commit Task 4**

```bash
git add src/renderer/src/features/editor/lib/markdown.test.ts
git commit -m "test: cover code fence source preservation"
```

## Task 5: Block Styling And Visual Polish

**Files:**
- Modify: `src/renderer/src/styles/blocknote-overrides.css`
- Modify: `src/renderer/src/styles/blocknote-overrides.test.ts`

- [ ] **Step 1: Write failing stylesheet tests**

Add these tests to `src/renderer/src/styles/blocknote-overrides.test.ts`:

```ts
  it("renders quotes as a left-rule block instead of a card", () => {
    const quoteRule = getRule(".bn-editor [data-content-type=\"quote\"]");

    expect(quoteRule).toMatch(/border-left:\s*3px solid var\(--accent-color\);/);
    expect(quoteRule).toMatch(/border-radius:\s*0;/);
    expect(quoteRule).not.toMatch(/border:\s*1px solid/);
  });

  it("styles nested bullet list markers and compact indentation", () => {
    expect(stylesheet).toMatch(
      /\.bn-block-content\[data-content-type="bulletListItem"\]\s*\{[\s\S]*padding-left:\s*0;/,
    );
    expect(stylesheet).toMatch(
      /\.bn-block-content\[data-content-type="bulletListItem"\]::before\s*\{[\s\S]*content:\s*"▪";/,
    );
  });

  it("styles the custom code block shell, language search, gutter, and copy button", () => {
    expect(getRule(".editor-code-block-shell")).toMatch(
      /background:\s*#0d1117;/,
    );
    expect(getRule(".editor-code-block-language-trigger")).toMatch(
      /border-radius:\s*6px;/,
    );
    expect(getRule(".editor-code-block-language-popover")).toMatch(
      /box-shadow:/,
    );
    expect(getRule(".editor-code-block-gutter")).toMatch(
      /user-select:\s*none;/,
    );
    expect(getRule(".editor-code-block-copy")).toMatch(
      /position:\s*absolute;/,
    );
  });
```

- [ ] **Step 2: Run the failing stylesheet tests**

Run:

```bash
pnpm test src/renderer/src/styles/blocknote-overrides.test.ts
```

Expected: FAIL because the new selectors and quote rules are not implemented.

- [ ] **Step 3: Update quote, checklist, bullet, and code styles**

Modify `src/renderer/src/styles/blocknote-overrides.css` by replacing the current quote and code block sections with focused rules and adding custom code block rules:

```css
.bn-editor [data-content-type="quote"] {
  margin-block: 0.65em;
  padding: 0.12em 0 0.12em 0.9em;
  border-left: 3px solid var(--accent-color);
  border-radius: 0;
  background: transparent;
  color: var(--text-secondary);
}

.bn-block-content[data-content-type="bulletListItem"] {
  padding-left: 0;
}

.bn-block-content[data-content-type="bulletListItem"]::before {
  color: var(--text-muted) !important;
  content: "▪";
  font-size: 0.75em;
  line-height: inherit;
}

.bn-block-content[data-content-type="checkListItem"] > div > input {
  accent-color: var(--accent-color);
  width: 17px;
  height: 17px;
  margin-left: 1px;
  margin-right: 11px;
  margin-block: 0;
  flex-shrink: 0;
  border-radius: 3px;
}

.editor-code-block-shell {
  position: relative;
  overflow: hidden;
  margin-block: 0.75em;
  background: #0d1117;
  color: #d6d9df;
  border: 1px solid color-mix(in srgb, var(--border-color) 75%, #1f2937);
  border-radius: 8px;
  font-family: "SF Mono", "Fira Code", Consolas, "Courier New", monospace;
}

.editor-code-block-controls {
  position: absolute;
  inset: 0 0 auto 0;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 10px 12px;
  pointer-events: none;
}

.editor-code-block-language,
.editor-code-block-copy,
.editor-code-block-language-trigger {
  pointer-events: auto;
}

.editor-code-block-language {
  position: relative;
}

.editor-code-block-language-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid #273241;
  border-radius: 6px;
  background: #151b23;
  color: #dce8ff;
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  cursor: pointer;
}

.editor-code-block-language-trigger:hover,
.editor-code-block-language-trigger[aria-expanded="true"] {
  border-color: color-mix(in srgb, var(--accent-color) 62%, #273241);
  background: #1a2230;
}

.editor-code-block-language-popover {
  position: absolute;
  top: 32px;
  left: 0;
  z-index: 5;
  width: 238px;
  overflow: hidden;
  border: 1px solid #2e3a4a;
  border-radius: 10px;
  background: #111821;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.38);
}

.editor-code-block-language-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-bottom: 1px solid #253142;
  color: #8fa3bd;
}

.editor-code-block-language-search input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: #e6edf7;
  font-size: 12px;
}

.editor-code-block-language-list {
  max-height: 260px;
  overflow-y: auto;
  padding: 5px;
}

.editor-code-block-language-option {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #d6d9df;
  padding: 7px 8px;
  text-align: left;
  cursor: pointer;
}

.editor-code-block-language-option:hover,
.editor-code-block-language-option[aria-selected="true"] {
  background: #1d2734;
}

.editor-code-block-language-option strong,
.editor-code-block-language-option small {
  display: block;
}

.editor-code-block-language-option strong {
  font-size: 12px;
}

.editor-code-block-language-option small {
  margin-top: 2px;
  color: #8493a6;
  font-size: 11px;
}

.editor-code-block-language-empty {
  padding: 18px 10px;
  color: #8493a6;
  font-size: 12px;
  text-align: center;
}

.editor-code-block-copy {
  position: absolute;
  top: 10px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: #44546a;
  color: #f3f7ff;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.editor-code-block-copy:hover {
  background: #52647c;
}

.editor-code-block-body {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  padding-top: 46px;
}

.editor-code-block-gutter {
  user-select: none;
  padding: 0 11px 18px 0;
  color: #7d8ba0;
  font-size: 0.82em;
  line-height: 1.72;
  text-align: right;
}

.editor-code-block-gutter span {
  display: block;
  min-height: 1.72em;
}

.editor-code-block-pre {
  min-width: 0;
  margin: 0;
  padding: 0 20px 22px 0;
  overflow-x: auto;
  font-size: 0.86em;
  line-height: 1.72;
  tab-size: 2;
  white-space: pre;
}

.editor-code-block-pre code {
  display: block;
  min-width: max-content;
  outline: none;
}
```

- [ ] **Step 4: Run stylesheet tests**

Run:

```bash
pnpm test src/renderer/src/styles/blocknote-overrides.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/renderer/src/styles/blocknote-overrides.css src/renderer/src/styles/blocknote-overrides.test.ts
git commit -m "style: polish editor content block rendering"
```

## Task 6: Integration Verification

**Files:**
- No new source files unless earlier tasks reveal a type or lint issue.

- [ ] **Step 1: Run focused editor tests**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/editor-code-block-languages.test.ts src/renderer/src/features/editor/components/editor-code-block.test.tsx src/renderer/src/features/editor/lib/blocknote-schema.test.ts src/renderer/src/features/editor/lib/markdown.test.ts src/renderer/src/styles/blocknote-overrides.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript checks**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Run production build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 6: Manually verify the editor UI**

Run:

```bash
pnpm dev
```

Open a Markdown note containing:

```md
> 这是引用

- [ ] 这是 Check List
- [x] 这是选中列表

- 这是列表1
  - 这是列表1-1
- 这是列表2
  - 这是列表2-2

```js
import { Crepe } from "@milkdown/crepe";

const crepe = new Crepe({
  root: "#app",
});
```
```

Expected:

- Quote renders as a left-rule block.
- Checkboxes are square and aligned.
- Nested bullets render compactly.
- Code block shows a left language pill, polished search popover, right floating copy button, line numbers, and Shiki highlighting.
- Copy button copies only code.
- Editing and saving the note preserves Markdown content.

- [ ] **Step 7: Commit verification fixes if needed**

If verification required small fixes, commit them:

```bash
git add src/renderer/src/features/editor src/renderer/src/styles src/renderer/src/features/editor/lib/markdown.test.ts
git commit -m "fix: stabilize editor content block integration"
```

If no fixes were required, do not create an empty commit.

## Self-Review

- Spec coverage: Tasks cover checklist styling, nested bullet styling, quote styling, common language set, searchable language picker, Shiki code highlighting, line numbers, copy button, Markdown round trips, and verification gates.
- Placeholder scan: The plan contains no `TBD`, unresolved placeholder, or missing implementation task.
- Type consistency: `CodeBlockLanguageOption`, `EditorCodeBlock`, `editorBlockSpecs`, `editorCodeBlockSupportedLanguages`, and `editorSchema` are introduced before later tasks reference them.
