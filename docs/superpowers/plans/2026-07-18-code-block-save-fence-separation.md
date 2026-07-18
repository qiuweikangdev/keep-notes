# Code Block Save Fence Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent every future rich-editor save from joining a fenced-code language and its first code line while preserving surrounding Markdown source formatting.

**Architecture:** Keep BlockNote's valid serialized Markdown as the structural source of truth and the reconciled Markdown as the formatting source of truth. Add a fence-aware finalization guard inside `preserveMarkdownSource` that separates a joined opening/first-line boundary only when the serialized document proves the boundary, leaving historical malformed ASCII fences untouched.

**Tech Stack:** TypeScript 5.9, React 19, BlockNote 0.51, Vitest 3, Electron Vite 5, Oxc.

## Global Constraints

- Use the existing `node_modules`; do not install dependencies.
- Do not modify `package.json` or `pnpm-lock.yaml`.
- Limit production changes to Markdown source preservation; do not change code-block UI, CodeMirror, language selection, syntax highlighting, main-process, preload, or IPC code.
- Do not automatically repair historical ASCII fences such as ` ```texthtml... ` during parsing.
- Preserve source line endings, fence marker style, list markers, spacing, and final source ending outside the proven joined boundary.
- Write Chinese comments for the core repair logic.
- Preserve the user's existing unrelated changes in `discard-file-changes.test.ts`, `discard-file-changes.ts`, and `editor-save-coordinator.ts`.
- Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` before completion.

---

### Task 1: Serialized-Guided Fence Boundary Guard

**Files:**
- Modify: `src/renderer/src/features/editor/lib/markdown.test.ts:265-465`
- Modify: `src/renderer/src/features/editor/lib/markdown.ts:46-65,1015-1025`

**Interfaces:**
- Consumes: `FENCED_CODE_OPENING_PATTERN`, `FENCED_CODE_LANGUAGE_CANDIDATES`, `MarkdownLine`, `splitMarkdownLines(markdown: string): MarkdownLine[]`, `getClosingFenceMatch(line: string, openingFence: string)`, and `preserveSourceEnding(source: string, edited: string)`.
- Produces: internal `repairJoinedFencedCodeAfterPreserve(markdown: string, serialized: string): string`; the public `preserveMarkdownSource(source: string, baseline: string, edited: string): string` keeps its existing signature.

- [ ] **Step 1: Add failing save-reconciliation regression coverage**

Add these tests inside the existing `describe("preserveMarkdownSource", ...)` block. The first parameterized test uses the real empty-document baseline (`"\n"`) observed from BlockNote and covers both fence markers and both line-ending styles.

```ts
  it.each([
    { ending: "\n", fence: "```", name: "backtick fences with LF" },
    { ending: "\r\n", fence: "~~~", name: "tilde fences with CRLF" },
  ])(
    "keeps the language and first code line separate for $name",
    ({ ending, fence }) => {
      const serialized = [
        `${fence}text`,
        "html.h5-layout {",
        "  color: red;",
        "}",
        fence,
        "",
      ].join(ending);

      expect(preserveMarkdownSource("", ending, serialized)).toBe(
        serialized.slice(0, -ending.length),
      );
    },
  );

  it("keeps the fence boundary separate across later code edits", () => {
    const source = [
      "```text",
      "html.h5-layout {",
      "  color: red;",
      "}",
      "```",
    ].join("\n");
    const baseline = `${source}\n`;
    const edited = baseline.replace("color: red", "color: blue");

    expect(preserveMarkdownSource(source, baseline, edited)).toBe(
      source.replace("color: red", "color: blue"),
    );
  });
```

Add this prevention-only assertion inside the existing `describe("repairMarkdownSourceBeforeParse", ...)` block:

```ts
  it("does not guess how to split an existing ASCII fence info string", () => {
    const source = [
      "```texthtml.h5-layout {",
      "  color: red;",
      "}",
      "```",
      "",
    ].join("\n");

    expect(repairMarkdownSourceBeforeParse(source)).toBe(source);
  });
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/markdown.test.ts
```

Expected: the new save-reconciliation cases FAIL. The LF case currently returns a value beginning with ` ```texthtml.h5-layout {`, and the CRLF/tilde case has the same missing boundary. The historical-source assertion and existing tests remain green.

- [ ] **Step 3: Add internal boundary types and language equivalence helpers**

Add this interface after `MarkdownLine`:

```ts
interface SerializedFencedCodeBoundary {
  firstLine: string;
  info: string;
}
```

Add these helpers immediately before `repairMarkdownSourceAfterPreserve`:

```ts
function normalizeFencedCodeInfo(info: string): string {
  const normalized = info.trim().toLowerCase();
  return (
    FENCED_CODE_LANGUAGE_CANDIDATES.find(
      ({ value }) => value.toLowerCase() === normalized,
    )?.canonicalId ?? normalized
  );
}

function fencedCodeInfosMatch(left: string, right: string): boolean {
  return normalizeFencedCodeInfo(left) === normalizeFencedCodeInfo(right);
}

function collectSerializedFencedCodeBoundaries(
  markdown: string,
): Array<SerializedFencedCodeBoundary | null> {
  const lines = splitMarkdownLines(markdown);
  const boundaries: Array<SerializedFencedCodeBoundary | null> = [];
  let openingFence: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (openingFence) {
      if (getClosingFenceMatch(line.text, openingFence)) {
        openingFence = null;
      }
      continue;
    }

    const openingMatch = line.text.match(FENCED_CODE_OPENING_PATTERN);
    if (!openingMatch) continue;

    openingFence = openingMatch[2];
    const nextLine = lines[index + 1];
    boundaries.push(
      !nextLine || getClosingFenceMatch(nextLine.text, openingFence)
        ? null
        : {
            firstLine: nextLine.text,
            info: openingMatch[3].trimStart(),
          },
    );
  }

  return boundaries;
}
```

These helpers canonicalize only an exact supported language or alias for comparison. They do not rewrite custom language text or parse historical malformed fences.

- [ ] **Step 4: Implement the fence-aware post-preservation repair**

Add this helper after `collectSerializedFencedCodeBoundaries`:

```ts
function repairJoinedFencedCodeAfterPreserve(
  markdown: string,
  serialized: string,
): string {
  const serializedBoundaries =
    collectSerializedFencedCodeBoundaries(serialized);
  if (serializedBoundaries.length === 0) return markdown;

  const lines = splitMarkdownLines(markdown);
  const repairedLines: MarkdownLine[] = [];
  let boundaryIndex = 0;
  let changed = false;
  let openingFence: string | null = null;

  for (const line of lines) {
    if (openingFence) {
      if (getClosingFenceMatch(line.text, openingFence)) {
        openingFence = null;
      }
      repairedLines.push(line);
      continue;
    }

    const openingMatch = line.text.match(FENCED_CODE_OPENING_PATTERN);
    if (!openingMatch) {
      repairedLines.push(line);
      continue;
    }

    openingFence = openingMatch[2];
    const serializedBoundary = serializedBoundaries[boundaryIndex] ?? null;
    boundaryIndex += 1;
    if (!serializedBoundary?.firstLine) {
      repairedLines.push(line);
      continue;
    }

    const rawInfo = openingMatch[3];
    const leadingWhitespaceLength = rawInfo.length - rawInfo.trimStart().length;
    const leadingWhitespace = rawInfo.slice(0, leadingWhitespaceLength);
    const candidateInfoAndFirstLine = rawInfo.slice(leadingWhitespaceLength);
    if (!candidateInfoAndFirstLine.endsWith(serializedBoundary.firstLine)) {
      repairedLines.push(line);
      continue;
    }

    const candidateInfo = candidateInfoAndFirstLine.slice(
      0,
      -serializedBoundary.firstLine.length,
    );
    if (!fencedCodeInfosMatch(candidateInfo, serializedBoundary.info)) {
      repairedLines.push(line);
      continue;
    }

    // 仅当本次序列化结果证明语言与首行原本分开时，恢复被源码合并吞掉的换行。
    repairedLines.push({
      ending: line.ending || "\n",
      text: `${openingMatch[1]}${openingMatch[2]}${leadingWhitespace}${candidateInfo}`,
    });
    repairedLines.push({
      ending: line.ending,
      text: serializedBoundary.firstLine,
    });
    changed = true;
  }

  if (!changed) return markdown;

  return preserveSourceEnding(
    markdown,
    repairedLines.map((line) => `${line.text}${line.ending}`).join(""),
  );
}
```

Update `repairMarkdownSourceAfterPreserve` so source-ending preservation occurs first, the new structural guard runs second, and the existing pre-parse/list/quote repairs remain in their current order:

```ts
function repairMarkdownSourceAfterPreserve(
  source: string,
  markdown: string,
  serialized: string,
) {
  const sourceEndingPreserved = preserveSourceEnding(source, markdown);
  const fencedCodeSeparated = repairJoinedFencedCodeAfterPreserve(
    sourceEndingPreserved,
    serialized,
  );
  const normalized = normalizeUnorderedListMarkers(
    source,
    repairMarkdownSourceBeforeParse(fencedCodeSeparated),
  );
  return repairEmptyQuoteChildListSource(normalized, serialized);
}
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/markdown.test.ts
```

Expected: PASS. The LF/backtick and CRLF/tilde cases retain separate language and first-code lines, later edits stay separated, and historical ASCII source remains unchanged by pre-parse repair.

- [ ] **Step 6: Run adjacent source-preservation tests**

Run:

```bash
pnpm test src/renderer/src/features/editor/lib/markdown.test.ts src/renderer/src/features/editor/lib/blocknote-schema.test.ts src/renderer/src/features/editor/components/blocknote-editor.test.ts
```

Expected: all suites PASS with no unhandled errors or warnings.

- [ ] **Step 7: Inspect and commit the focused fix**

Run:

```bash
git diff --check -- src/renderer/src/features/editor/lib/markdown.ts src/renderer/src/features/editor/lib/markdown.test.ts
git diff -- src/renderer/src/features/editor/lib/markdown.ts src/renderer/src/features/editor/lib/markdown.test.ts
git add src/renderer/src/features/editor/lib/markdown.ts src/renderer/src/features/editor/lib/markdown.test.ts
git commit -m "fix: keep code fence language separate"
```

Expected: the commit contains only the two Markdown files and uses an English Conventional Commit message.

### Task 2: Repository and Electron Verification

**Files:**
- Verify: `src/renderer/src/features/editor/lib/markdown.ts`
- Verify: `src/renderer/src/features/editor/lib/markdown.test.ts`
- Do not modify files unless a verification failure proves the Task 1 implementation incomplete.

**Interfaces:**
- Consumes: the unchanged public `preserveMarkdownSource(source, baseline, edited): string` behavior from Task 1.
- Produces: automated and manual evidence that future saves keep fenced-code language and first-line content separate.

- [ ] **Step 1: Run the full unit test suite**

Run:

```bash
pnpm test
```

Expected: all tests PASS with no unhandled errors.

- [ ] **Step 2: Run repository-required static verification**

Run:

```bash
pnpm typecheck
pnpm lint
```

Expected: both commands exit with status 0 and report no errors.

- [ ] **Step 3: Run the production build**

Run:

```bash
pnpm build
```

Expected: TypeScript checks and the Electron Vite production build complete successfully.

- [ ] **Step 4: Verify repeated code-block saves in Keep Notes**

Use the existing development app and a non-sensitive temporary note:

1. Start the app with `pnpm dev` if no development instance is running.
2. Create an empty Markdown note.
3. Insert a `text` code block and enter `html.h5-layout {` as line 1, followed by at least two more lines.
4. Wait for the normal save cycle, then inspect the note's Git diff or source mode.
5. Confirm the opening is ` ```text ` and `html.h5-layout {` starts on the following line.
6. Edit line 1 and another code line, wait for another save, and confirm the boundary remains separated.
7. Close and reopen the note and confirm the editor still shows the same language and first code line.

Expected: no save produces ` ```texthtml.h5-layout {`; the first and subsequent saves preserve the line boundary.

- [ ] **Step 5: Inspect final repository state**

Run:

```bash
git status --short
git log -3 --oneline
```

Expected: the implementation commit is present. The user's unrelated pre-existing modifications remain uncommitted and unchanged.
