# Code Block First-Line and Focus Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover first-line code accidentally joined to a supported fenced-code language, display Bash as `bash`, prevent language-control overflow, and make all non-control code block areas reliably focus CodeMirror.

**Architecture:** Extend the existing Markdown pre-parse repair boundary so malformed source is corrected before BlockNote parses or caches it. Keep language normalization in the existing language registry, constrain the language trigger in the existing stylesheet, and adjust the CodeMirror node-view shell fallback without changing CodeMirror's native content positioning or fold controls.

**Tech Stack:** TypeScript 5.9, React 19, BlockNote 0.51, CodeMirror 6, Vitest 3, Testing Library, Tailwind CSS 3, Oxc.

## Global Constraints

- Use `pnpm`; do not install dependencies or modify `pnpm-lock.yaml`.
- Keep changes limited to Markdown repair, code-block language presentation, code-block focus, and their tests.
- Preserve valid fenced code, unsupported language values, source line endings, fence marker style, and final source ending.
- Continue accepting `sh`, `shell`, and `zsh` as Bash aliases.
- Keep filesystem and Git behavior outside the renderer unchanged.
- Write Chinese comments for core method logic.
- Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` before completion.

---

### Task 1: Canonical Bash Label and Overflow Guard

**Files:**
- Modify: `src/renderer/src/features/editor/lib/editor-code-block-languages.test.ts`
- Modify: `src/renderer/src/features/editor/lib/editor-code-block-languages.ts`
- Modify: `src/renderer/src/styles/blocknote-overrides.test.ts`
- Modify: `src/renderer/src/styles/blocknote-overrides.css`

**Interfaces:**
- Consumes: `getCodeBlockLanguageShortLabel(language: string): string` and `.editor-code-block-language-trigger`.
- Produces: Bash short label `bash`; a trigger whose width is bounded and whose label truncates on one line.

- [ ] **Step 1: Write failing Bash-label tests**

Add these assertions to the existing language resolution and label tests:

```ts
expect(getSupportedCodeBlockLanguageId("sh")).toBe("bash");
expect(getSupportedCodeBlockLanguageId("shell")).toBe("bash");
expect(getSupportedCodeBlockLanguageId("zsh")).toBe("bash");
expect(getCodeBlockLanguageShortLabel("bash")).toBe("bash");
expect(getCodeBlockLanguageShortLabel("sh")).toBe("bash");
```

- [ ] **Step 2: Run the language test and verify RED**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/editor-code-block-languages.test.ts
```

Expected: FAIL because Bash currently has `shortLabel: "sh"`.

- [ ] **Step 3: Change the canonical Bash short label**

Update only the Bash entry:

```ts
{
  id: "bash",
  label: "Bash",
  shortLabel: "bash",
  aliases: ["sh", "shell", "zsh"],
},
```

- [ ] **Step 4: Run the language test and verify GREEN**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/editor-code-block-languages.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write a failing stylesheet test for the language trigger**

Add a focused test to `blocknote-overrides.test.ts`:

```ts
it("keeps the code language trigger on one line inside the code block", () => {
  expect(getRule(".editor-code-block-language-trigger")).toMatch(
    /max-width:\s*calc\(100% - 36px\);/,
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
});
```

- [ ] **Step 6: Run the stylesheet test and verify RED**

Run:

```bash
pnpm test src/renderer/src/styles/blocknote-overrides.test.ts
```

Expected: FAIL because the trigger and its label do not have overflow constraints.

- [ ] **Step 7: Add the minimal overflow guard**

Extend the existing trigger rule and add a label rule:

```css
.editor-code-block-language-trigger {
  /* existing declarations stay unchanged */
  max-width: calc(100% - 36px);
}

.editor-code-block-language-trigger > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 8: Run both focused test files and verify GREEN**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/editor-code-block-languages.test.ts src/renderer/src/styles/blocknote-overrides.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit the presentation repair**

```bash
git add src/renderer/src/features/editor/lib/editor-code-block-languages.ts src/renderer/src/features/editor/lib/editor-code-block-languages.test.ts src/renderer/src/styles/blocknote-overrides.css src/renderer/src/styles/blocknote-overrides.test.ts
git commit -m "fix: normalize bash code block label"
```

### Task 2: Malformed Fenced-Code First-Line Repair

**Files:**
- Modify: `src/renderer/src/features/editor/lib/markdown.test.ts`
- Modify: `src/renderer/src/features/editor/lib/markdown.ts`

**Interfaces:**
- Consumes: `CODE_BLOCK_LANGUAGE_OPTIONS` and the existing `MarkdownLine`, `splitMarkdownLines`, `getClosingFenceMatch`, and `preserveSourceEnding` helpers.
- Produces: existing public `repairMarkdownSourceBeforeParse(markdown: string): string` with an additional fenced-code normalization pass; no new public API.

- [ ] **Step 1: Import and test the public repair boundary**

Add `repairMarkdownSourceBeforeParse` to the imports in `markdown.test.ts`, then add:

```ts
describe("repairMarkdownSourceBeforeParse", () => {
  it("recovers Chinese first-line content joined to a bash fence", () => {
    const source = [
      "核心步骤",
      "",
      "```bash写一个 while True 无限循环",
      "不断从数据库查任务",
      "```",
      "",
    ].join("\n");

    expect(repairMarkdownSourceBeforeParse(source)).toBe(
      [
        "核心步骤",
        "",
        "```bash",
        "写一个 while True 无限循环",
        "不断从数据库查任务",
        "```",
        "",
      ].join("\n"),
    );
  });

  it("canonicalizes a bash alias when recovering joined content", () => {
    expect(
      repairMarkdownSourceBeforeParse("~~~sh echo ready\r\necho next\r\n~~~\r\n"),
    ).toBe("~~~bash\r\necho ready\r\necho next\r\n~~~\r\n");
  });

  it("leaves valid and unsupported fenced-code openings unchanged", () => {
    const source = [
      "```bash",
      "echo ready",
      "```",
      "",
      "```unknownlang joined content",
      "value",
      "```",
      "",
    ].join("\n");

    expect(repairMarkdownSourceBeforeParse(source)).toBe(source);
  });

  it("does not repair fence-like text inside an open code block", () => {
    const source = [
      "````text",
      "```bash写一个循环",
      "````",
      "",
    ].join("\n");

    expect(repairMarkdownSourceBeforeParse(source)).toBe(source);
  });
});
```

- [ ] **Step 2: Run the Markdown tests and verify RED**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/markdown.test.ts
```

Expected: the two repair expectations FAIL because only joined unordered-list markers are repaired.

- [ ] **Step 3: Add language candidates and opening-fence matching**

Import the registry and define focused internal types/constants near the existing fence pattern:

```ts
import { CODE_BLOCK_LANGUAGE_OPTIONS } from "./editor-code-block-languages";

interface FencedCodeLanguageCandidate {
  canonicalId: string;
  value: string;
}

const FENCED_CODE_OPENING_PATTERN = /^( {0,3})(```+|~~~+)(.*)$/u;
const FENCED_CODE_LANGUAGE_CANDIDATES: FencedCodeLanguageCandidate[] =
  CODE_BLOCK_LANGUAGE_OPTIONS.flatMap((language) =>
    [language.id, ...language.aliases].map((value) => ({
      canonicalId: language.id,
      value,
    })),
  ).sort((left, right) => right.value.length - left.value.length);
```

- [ ] **Step 4: Implement the minimal fenced-code repair pass**

Add helpers before `repairMarkdownSourceBeforeParse`:

```ts
function splitJoinedFencedCodeOpening(line: MarkdownLine): MarkdownLine[] | null {
  const match = line.text.match(FENCED_CODE_OPENING_PATTERN);
  if (!match) return null;

  const [, indent, fence, rawInfo] = match;
  const info = rawInfo.trimStart();
  if (!info) return null;

  const normalizedInfo = info.toLowerCase();
  const candidate = FENCED_CODE_LANGUAGE_CANDIDATES.find(({ value }) =>
    normalizedInfo.startsWith(value.toLowerCase()),
  );
  if (!candidate) return null;

  const firstLine = info.slice(candidate.value.length).trimStart();
  if (!firstLine) return null;

  return [
    {
      text: `${indent}${fence}${candidate.canonicalId}`,
      ending: line.ending || "\n",
    },
    {
      text: firstLine,
      ending: line.ending,
    },
  ];
}

function repairJoinedFencedCodeFirstLines(markdown: string): string | null {
  const lines = splitMarkdownLines(markdown);
  const nextLines: MarkdownLine[] = [];
  let openingFence: string | null = null;
  let changed = false;

  for (const line of lines) {
    if (openingFence) {
      const closingMatch = getClosingFenceMatch(line.text, openingFence);
      if (closingMatch) openingFence = null;
      nextLines.push(line);
      continue;
    }

    const openingMatch = line.text.match(FENCED_CODE_OPENING_PATTERN);
    if (!openingMatch) {
      nextLines.push(line);
      continue;
    }

    const repairedLines = splitJoinedFencedCodeOpening(line);
    if (repairedLines) {
      changed = true;
      nextLines.push(...repairedLines);
    } else {
      nextLines.push(line);
    }
    openingFence = openingMatch[2];
  }

  if (!changed) return null;

  return preserveSourceEnding(
    markdown,
    nextLines.map((line) => `${line.text}${line.ending}`).join(""),
  );
}
```

Compose it with the existing repair:

```ts
export function repairMarkdownSourceBeforeParse(markdown: string): string {
  const fencedCodeRepaired =
    repairJoinedFencedCodeFirstLines(markdown) ?? markdown;
  return repairJoinedUnorderedListMarkers(fencedCodeRepaired) ?? fencedCodeRepaired;
}
```

Keep a Chinese comment above the candidate match explaining that the longest supported language or alias is removed from the malformed info string and the remainder becomes code line one.

- [ ] **Step 5: Run the Markdown tests and verify GREEN**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/markdown.test.ts
```

Expected: PASS.

- [ ] **Step 6: Add an integration assertion for parsed block content**

Add this test to `blocknote-schema.test.ts`:

```ts
it("preserves the recovered first line in a malformed bash code block", async () => {
  const editor = BlockNoteEditor.create({ schema: editorSchema });
  const repaired = repairMarkdownSourceBeforeParse(
    "```bash写一个 while True 无限循环\n不断从数据库查任务\n```",
  );
  const blocks = await editor.tryParseMarkdownToBlocks(repaired);

  expect(blocks[0]).toMatchObject({
    type: "codeBlock",
    props: { language: "bash" },
  });
  expect(getInlineText(blocks[0])).toBe(
    "写一个 while True 无限循环\n不断从数据库查任务",
  );
});
```

Import `repairMarkdownSourceBeforeParse` from `./markdown`. The existing `getInlineText` helper joins the code block's inline text segments and retains newline characters contained in their `text` values.

- [ ] **Step 7: Run the schema and Markdown suites**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/markdown.test.ts src/renderer/src/features/editor/lib/blocknote-schema.test.ts
```

Expected: PASS with the malformed source producing a Bash block whose content starts with the recovered line.

- [ ] **Step 8: Commit the source repair**

```bash
git add src/renderer/src/features/editor/lib/markdown.ts src/renderer/src/features/editor/lib/markdown.test.ts src/renderer/src/features/editor/lib/blocknote-schema.test.ts
git commit -m "fix: recover code block first line"
```

### Task 3: Reliable Gutter and Shell Focus

**Files:**
- Modify: `src/renderer/src/features/editor/lib/blocknote-schema.test.ts`
- Modify: `src/renderer/src/features/editor/lib/editor-code-block-node-view.ts`

**Interfaces:**
- Consumes: `EditorCodeBlockNodeView.focusCodeMirrorFromShell(event: MouseEvent)` and the existing CodeMirror DOM.
- Produces: content clicks retain CodeMirror native caret placement; line-number gutter and shell-whitespace clicks focus CodeMirror; toolbar/popover/fold controls keep their current behavior.

- [ ] **Step 1: Write the failing line-number gutter focus test**

Place this test after the existing blank-shell focus test:

```ts
it("focuses CodeMirror when clicking the line-number gutter", async () => {
  setupMatchMedia();
  const editor = BlockNoteEditor.create({
    schema: editorSchema,
    initialContent: [
      {
        type: "codeBlock",
        props: { language: "bash" },
        content: "echo ready\necho next",
      },
    ],
  });
  const { container } = render(createElement(BlockNoteView, { editor }));

  await waitFor(() => {
    expect(getCodeMirrorView(container).state.doc.lines).toBe(2);
  });

  const view = getCodeMirrorView(container);
  const lineNumber = container.querySelector<HTMLElement>(
    ".editor-code-block__codemirror .cm-lineNumbers .cm-gutterElement",
  );
  expect(lineNumber).not.toBe(null);

  view.contentDOM.blur();
  fireEvent.mouseDown(lineNumber as HTMLElement);

  expect(view.hasFocus).toBe(true);
});
```

- [ ] **Step 2: Run the schema test and verify RED**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/blocknote-schema.test.ts
```

Expected: FAIL because `.cm-gutters` is excluded by `focusCodeMirrorFromShell`.

- [ ] **Step 3: Remove only the blanket gutter exclusion**

Change the fallback selector from:

```ts
[
  ".editor-code-block__toolbar",
  ".editor-code-block-language-popover",
  ".cm-content",
  ".cm-gutters",
].join(", ")
```

to:

```ts
[
  ".editor-code-block__toolbar",
  ".editor-code-block-language-popover",
  ".cm-content",
].join(", ")
```

Retain the existing Chinese comment. Do not change fold-gutter event handlers; they already stop their own pointer events and preserve folding semantics.

- [ ] **Step 4: Run the schema test and verify GREEN**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/blocknote-schema.test.ts
```

Expected: PASS, including existing folding, selection, blank-shell focus, picker, and copy tests.

- [ ] **Step 5: Commit the focus repair**

```bash
git add src/renderer/src/features/editor/lib/editor-code-block-node-view.ts src/renderer/src/features/editor/lib/blocknote-schema.test.ts
git commit -m "fix: focus code blocks from line gutters"
```

### Task 4: Full Verification and Manual Regression

**Files:**
- Verify only; modify earlier task files only if a verification failure proves the implementation incomplete.

**Interfaces:**
- Consumes: all behavior produced by Tasks 1–3.
- Produces: evidence that the focused regression tests, repository checks, production build, and real Electron interaction pass.

- [ ] **Step 1: Run all focused code-block and Markdown tests**

```bash
pnpm test src/renderer/src/features/editor/lib/editor-code-block-languages.test.ts src/renderer/src/features/editor/lib/markdown.test.ts src/renderer/src/features/editor/lib/blocknote-schema.test.ts src/renderer/src/styles/blocknote-overrides.test.ts
```

Expected: all tests PASS with no unhandled errors.

- [ ] **Step 2: Run the full unit test suite**

```bash
pnpm test
```

Expected: all tests PASS.

- [ ] **Step 3: Run repository-required static verification**

```bash
pnpm typecheck
pnpm lint
```

Expected: both commands exit with status 0 and report no errors.

- [ ] **Step 4: Run the production build**

```bash
pnpm build
```

Expected: TypeScript checks and Electron Vite build complete successfully.

- [ ] **Step 5: Reproduce the repaired document in Electron**

Using the existing development app and a non-sensitive test note, load:

````markdown
```bash写一个 while True 无限循环
不断从数据库查任务
有任务就处理
没任务就 sleep 几秒
```
````

Confirm:

- the control reads `bash`;
- `写一个 while True 无限循环` is code line 1;
- the control does not wrap or cover code;
- clicks on line 1, a line number, and right-side blank shell space show a CodeMirror caret;
- the source mode now contains a ` ```bash ` opening followed by the recovered first line;
- fold, copy, and language-picker controls still work.

- [ ] **Step 6: Inspect the final diff**

```bash
git status --short
git diff --check
git diff HEAD~3 -- src/renderer/src/features/editor/lib/markdown.ts src/renderer/src/features/editor/lib/markdown.test.ts src/renderer/src/features/editor/lib/editor-code-block-languages.ts src/renderer/src/features/editor/lib/editor-code-block-languages.test.ts src/renderer/src/features/editor/lib/editor-code-block-node-view.ts src/renderer/src/features/editor/lib/blocknote-schema.test.ts src/renderer/src/styles/blocknote-overrides.css src/renderer/src/styles/blocknote-overrides.test.ts
```

Expected: only the planned code-block files changed, with no whitespace errors or unrelated refactoring.
