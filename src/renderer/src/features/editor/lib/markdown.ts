import { diffChars, type Change } from "diff";

import { CODE_BLOCK_LANGUAGE_OPTIONS } from "./editor-code-block-languages";

export interface MarkdownParser<TBlock> {
  tryParseMarkdownToBlocks(markdown: string): Promise<TBlock[]> | TBlock[];
}

export interface MarkdownSerializer<TBlock> {
  blocksToMarkdownLossy(blocks: TBlock[]): Promise<string> | string;
}

export interface MarkdownParseOptions {
  markdownFilePath?: string | null;
  resolveImageUrl?: (url: string) => Promise<string | null> | string | null;
}

interface MarkdownTreeBlock {
  children?: MarkdownTreeBlock[];
  type?: unknown;
}

interface QuoteListDescriptor {
  itemCount: number;
  quoteOrdinal: number;
}

export function markdownEquals(left: string, right: string): boolean {
  return left === right;
}

interface SourceBoundaryMap {
  left: number[];
  right: number[];
}

interface MarkdownEdit {
  start: number;
  end: number;
  replacement: string;
}

const SOURCE_PRESERVATION_DIFF_CHAR_LIMIT = 16_000;
const LARGE_DOC_LIST_PRESERVE_LIMIT = 8_000;
const UNORDERED_LIST_LINE_PATTERN = /^([ \t]{0,3})([-+*])([ \t]+)(.*)$/u;
const FENCED_CODE_LINE_PATTERN = /^ {0,3}(```+|~~~+)/u;
const FENCED_CODE_OPENING_PATTERN = /^( {0,3})(```+|~~~+)(.*)$/u;

interface FencedCodeLanguageCandidate {
  canonicalId: string;
  value: string;
}

const FENCED_CODE_LANGUAGE_CANDIDATES: FencedCodeLanguageCandidate[] =
  CODE_BLOCK_LANGUAGE_OPTIONS.flatMap((language) =>
    [language.id, ...language.aliases].map((value) => ({
      canonicalId: language.id,
      value,
    })),
  ).toSorted((left, right) => right.value.length - left.value.length);

interface MarkdownLine {
  ending: string;
  text: string;
}

interface SerializedFencedCodeBoundary {
  firstLine: string;
  info: string;
}

interface UnorderedListItemLine {
  content: string;
  indent: string;
  lineIndex: number;
  marker: string;
  spacing: string;
}

interface UnorderedListRun {
  endLineIndex: number;
  items: UnorderedListItemLine[];
  startLineIndex: number;
}

function createSourceBoundaryMap(
  baseline: string,
  source: string,
): SourceBoundaryMap {
  const left: number[] = [];
  const right: number[] = [];
  left.length = baseline.length + 1;
  right.length = baseline.length + 1;
  let baselineOffset = 0;
  let sourceOffset = 0;

  for (const change of diffChars(baseline, source)) {
    if (change.added) {
      left[baselineOffset] ??= sourceOffset;
      sourceOffset += change.value.length;
      right[baselineOffset] = sourceOffset;
      continue;
    }

    if (change.removed) {
      for (let index = 0; index <= change.value.length; index += 1) {
        const boundary = baselineOffset + index;
        left[boundary] ??= sourceOffset;
        right[boundary] ??= sourceOffset;
      }
      baselineOffset += change.value.length;
      continue;
    }

    for (let index = 0; index <= change.value.length; index += 1) {
      const boundary = baselineOffset + index;
      const mappedOffset = sourceOffset + index;
      left[boundary] ??= mappedOffset;
      right[boundary] = mappedOffset;
    }
    baselineOffset += change.value.length;
    sourceOffset += change.value.length;
  }

  left[baseline.length] ??= source.length;
  right[baseline.length] ??= source.length;
  return { left, right };
}

function getBoundaryContextScore(
  baseline: string,
  source: string,
  baselineOffset: number,
  sourceOffset: number,
): number {
  const contextLength = 48;
  let score = 0;

  for (
    let distance = 1;
    distance <= contextLength &&
    baselineOffset - distance >= 0 &&
    sourceOffset - distance >= 0;
    distance += 1
  ) {
    if (
      baseline[baselineOffset - distance] !== source[sourceOffset - distance]
    ) {
      break;
    }
    score += 1;
  }

  for (
    let distance = 0;
    distance < contextLength &&
    baselineOffset + distance < baseline.length &&
    sourceOffset + distance < source.length;
    distance += 1
  ) {
    if (
      baseline[baselineOffset + distance] !== source[sourceOffset + distance]
    ) {
      break;
    }
    score += 1;
  }

  return score;
}

function chooseSourceBoundary(
  baseline: string,
  source: string,
  boundaryMap: SourceBoundaryMap,
  baselineOffset: number,
): number {
  const candidates = new Set([
    boundaryMap.left[baselineOffset],
    boundaryMap.right[baselineOffset],
  ]);
  let selected = boundaryMap.left[baselineOffset] ?? 0;
  let selectedScore = -1;

  for (const candidate of candidates) {
    if (candidate === undefined) continue;
    const score = getBoundaryContextScore(
      baseline,
      source,
      baselineOffset,
      candidate,
    );
    if (score > selectedScore) {
      selected = candidate;
      selectedScore = score;
    }
  }

  return selected;
}

function collectMarkdownEdits(changes: Change[]): MarkdownEdit[] {
  const edits: MarkdownEdit[] = [];
  let baselineOffset = 0;
  let pending: MarkdownEdit | null = null;

  const flushPending = () => {
    if (pending) {
      edits.push(pending);
      pending = null;
    }
  };

  for (const change of changes) {
    if (!change.added && !change.removed) {
      flushPending();
      baselineOffset += change.value.length;
      continue;
    }

    pending ??= {
      start: baselineOffset,
      end: baselineOffset,
      replacement: "",
    };
    if (change.removed) {
      baselineOffset += change.value.length;
      pending.end = baselineOffset;
    } else {
      pending.replacement += change.value;
    }
  }
  flushPending();

  return edits;
}

function locateExactChangedText(
  source: string,
  oldText: string,
  expectedOffset: number,
): number | null {
  if (!oldText) return expectedOffset;

  const searchStart = Math.max(0, expectedOffset - 160);
  const searchEnd = Math.min(
    source.length,
    expectedOffset + oldText.length + 160,
  );
  const localSource = source.slice(searchStart, searchEnd);
  let localIndex = localSource.indexOf(oldText);
  let bestOffset: number | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  while (localIndex >= 0) {
    const candidate = searchStart + localIndex;
    const distance = Math.abs(candidate - expectedOffset);
    if (distance < bestDistance) {
      bestOffset = candidate;
      bestDistance = distance;
    }
    localIndex = localSource.indexOf(oldText, localIndex + 1);
  }

  return bestOffset;
}

function preserveSourceEnding(source: string, edited: string): string {
  if (!edited) return edited;

  const sourceEnding = source.match(/(?:\r\n|\r|\n)+$/)?.[0] ?? "";
  return `${edited.replace(/(?:\r\n|\r|\n)+$/g, "")}${sourceEnding}`;
}

function splitMarkdownLines(markdown: string): MarkdownLine[] {
  const lines: MarkdownLine[] = [];
  let start = 0;

  while (start < markdown.length) {
    let lineBreakIndex = -1;
    for (let index = start; index < markdown.length; index += 1) {
      if (markdown[index] === "\r" || markdown[index] === "\n") {
        lineBreakIndex = index;
        break;
      }
    }

    if (lineBreakIndex < 0) {
      lines.push({ text: markdown.slice(start), ending: "" });
      break;
    }

    let ending = markdown[lineBreakIndex];
    if (ending === "\r" && markdown[lineBreakIndex + 1] === "\n") {
      ending = "\r\n";
    }
    lines.push({
      text: markdown.slice(start, lineBreakIndex),
      ending,
    });
    start = lineBreakIndex + ending.length;
  }

  return lines;
}

function findMarkupRegionEnd(
  lines: MarkdownLine[],
  startIndex: number,
): number | null {
  const openingMatch = lines[startIndex].text.match(
    /^\s*<([A-Za-z][A-Za-z0-9:.-]*)\b/u,
  );
  if (!openingMatch) return null;

  const tagName = openingMatch[1].toLowerCase();
  let openingClosed = false;
  let quote: "'" | '"' | null = null;
  let braceDepth = 0;

  for (let index = startIndex; index < lines.length; index += 1) {
    const text = lines[index].text;
    if (openingClosed) {
      if (text.toLowerCase().includes(`</${tagName}`)) return index;
      continue;
    }

    for (let offset = 0; offset < text.length; offset += 1) {
      const character = text[offset];
      if (quote) {
        if (character === quote && text[offset - 1] !== "\\") quote = null;
        continue;
      }
      if (character === "'" || character === '"') {
        quote = character;
        continue;
      }
      if (character === "{" || character === "[") {
        braceDepth += 1;
        continue;
      }
      if ((character === "}" || character === "]") && braceDepth > 0) {
        braceDepth -= 1;
        continue;
      }
      if (character !== ">" || braceDepth > 0) continue;

      const beforeClose = text.slice(0, offset).trimEnd();
      if (beforeClose.endsWith("/")) return index;
      openingClosed = true;
      if (
        text
          .slice(offset + 1)
          .toLowerCase()
          .includes(`</${tagName}`)
      ) {
        return index;
      }
      break;
    }
  }

  return null;
}

function normalizeMarkupSpacerLines(markdown: string): string {
  const lines = splitMarkdownLines(markdown);
  let openingFence: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (openingFence) {
      if (getClosingFenceMatch(line.text, openingFence)) openingFence = null;
      continue;
    }

    const openingFenceMatch = line.text.match(FENCED_CODE_LINE_PATTERN);
    if (openingFenceMatch) {
      openingFence = openingFenceMatch[1];
      continue;
    }

    let regionEnd = findMarkupRegionEnd(lines, index);
    if (regionEnd === null || regionEnd === index) continue;

    // 浏览器运行时会在源码硬换行后额外导出一个空白行；每组间隔只去掉一个，
    // 因而用户原本保留的连续空行仍能按原数量回写。
    for (let cursor = index; cursor <= regionEnd; cursor += 1) {
      if (lines[cursor].ending && lines[cursor].text.endsWith("\\")) {
        lines[cursor].text = lines[cursor].text.slice(0, -1);
      }
      if (
        cursor > index &&
        cursor < regionEnd &&
        lines[cursor].text.trim() === "" &&
        lines[cursor - 1].text.trim() !== ""
      ) {
        let nextContentIndex = cursor + 1;
        while (
          nextContentIndex <= regionEnd &&
          lines[nextContentIndex].text.trim() === ""
        ) {
          nextContentIndex += 1;
        }
        if (nextContentIndex > regionEnd) continue;

        lines.splice(cursor, 1);
        regionEnd -= 1;
        cursor = nextContentIndex - 2;
      }
    }
    index = regionEnd;
  }

  return lines.map((line) => `${line.text}${line.ending}`).join("");
}

function normalizeMarkupHardBreaks(markdown: string): string {
  const lines = splitMarkdownLines(markdown);
  let openingFence: string | null = null;
  let paragraphStart: number | null = null;

  const flushParagraph = (endIndex: number) => {
    if (paragraphStart === null) return;
    const paragraphLines = lines.slice(paragraphStart, endIndex);
    const containsMarkup = paragraphLines.some((line) =>
      /<\/?[A-Za-z][A-Za-z0-9-]*/u.test(line.text),
    );
    const paragraphText = paragraphLines.map((line) => line.text).join("\n");
    const containsBracedSource =
      paragraphText.includes("{") && paragraphText.includes("}");

    if (containsMarkup || containsBracedSource) {
      // BlockNote 会把同一段落内的换行导出为 `\` 硬换行；源码文案应保留原始单换行。
      for (let index = paragraphStart; index < endIndex; index += 1) {
        const line = lines[index];
        if (line.ending && line.text.endsWith("\\")) {
          line.text = line.text.slice(0, -1);
        }
      }
    }
    paragraphStart = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (openingFence) {
      if (getClosingFenceMatch(line.text, openingFence)) {
        openingFence = null;
      }
      continue;
    }

    const openingMatch = line.text.match(FENCED_CODE_LINE_PATTERN);
    if (openingMatch) {
      flushParagraph(index);
      openingFence = openingMatch[1];
      continue;
    }

    if (line.text.trim() === "") {
      flushParagraph(index);
      continue;
    }
    paragraphStart ??= index;
  }

  flushParagraph(lines.length);
  return normalizeMarkupSpacerLines(
    lines.map((line) => `${line.text}${line.ending}`).join(""),
  );
}

function getClosingFenceMatch(line: string, openingFence: string) {
  const match = line.match(FENCED_CODE_LINE_PATTERN);
  if (!match) return null;
  if (match[1][0] !== openingFence[0]) return null;
  if (match[1].length < openingFence.length) return null;
  // 关闭围栏后只允许空白，避免把代码块内的 fence-like 内容误判为结束位置。
  if (!/^[ \t]*$/u.test(line.slice(match[0].length))) return null;
  return match;
}

function findNextListLineIndex(
  lines: MarkdownLine[],
  startIndex: number,
): number | null {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.text.trim() === "") continue;
    return line.text.match(UNORDERED_LIST_LINE_PATTERN) ? index : null;
  }

  return null;
}

function collectUnorderedListRuns(lines: MarkdownLine[]): UnorderedListRun[] {
  const runs: UnorderedListRun[] = [];
  let openingFence: string | null = null;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const fenceMatch = openingFence
      ? getClosingFenceMatch(line.text, openingFence)
      : line.text.match(FENCED_CODE_LINE_PATTERN);
    if (fenceMatch) {
      openingFence = openingFence ? null : fenceMatch[1];
      index += 1;
      continue;
    }

    const match = openingFence
      ? null
      : line.text.match(UNORDERED_LIST_LINE_PATTERN);
    if (!match) {
      index += 1;
      continue;
    }

    const run: UnorderedListRun = {
      endLineIndex: index + 1,
      items: [],
      startLineIndex: index,
    };

    while (index < lines.length) {
      const currentLine = lines[index];
      const currentMatch = currentLine.text.match(UNORDERED_LIST_LINE_PATTERN);
      if (currentMatch) {
        run.items.push({
          content: currentMatch[4],
          indent: currentMatch[1],
          lineIndex: index,
          marker: currentMatch[2],
          spacing: currentMatch[3],
        });
        index += 1;
        run.endLineIndex = index;
        continue;
      }

      if (
        currentLine.text.trim() === "" &&
        findNextListLineIndex(lines, index + 1) !== null
      ) {
        index += 1;
        run.endLineIndex = index;
        continue;
      }

      break;
    }

    runs.push(run);
  }

  return runs;
}

function getListRunContents(run: UnorderedListRun): string[] {
  return run.items.map((item) => item.content);
}

function getListItemContents(items: UnorderedListItemLine[]): string[] {
  return items.map((item) => item.content);
}

function collectUnorderedListItems(
  lines: MarkdownLine[],
): UnorderedListItemLine[] {
  return collectUnorderedListRuns(lines).flatMap((run) => run.items);
}

function hasSameContentOrder(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => {
      return item === right[index];
    })
  );
}

function hasSameContentMultiset(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;

  const counts = new Map<string, number>();
  for (const item of left) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  for (const item of right) {
    const count = counts.get(item);
    if (!count) return false;
    if (count === 1) {
      counts.delete(item);
    } else {
      counts.set(item, count - 1);
    }
  }

  return counts.size === 0;
}

function getListItemFormatBuckets(items: UnorderedListItemLine[]) {
  const buckets = new Map<string, UnorderedListItemLine[]>();

  for (const item of items) {
    const bucket = buckets.get(item.content);
    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(item.content, [item]);
    }
  }

  return buckets;
}

function takeListItemFormat(
  buckets: Map<string, UnorderedListItemLine[]>,
  fallbackItems: UnorderedListItemLine[],
  content: string,
  fallbackIndex: number,
) {
  const bucket = buckets.get(content);
  const matchedItem = bucket?.shift();
  if (matchedItem) return matchedItem;
  return fallbackItems[Math.min(fallbackIndex, fallbackItems.length - 1)];
}

function escapeRegExpText(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function hasJoinedListRunContent(
  sourceRun: UnorderedListRun,
  sourceContents: string[],
  contents: string[],
): boolean {
  const sourceItem = sourceRun.items[0];
  if (!sourceItem || sourceContents.length !== 1) return false;
  if (contents.length <= sourceRun.items.length) return false;

  const markerPattern = escapeRegExpText(sourceItem.marker);
  const contentPattern = contents
    .map(escapeRegExpText)
    .join(`${markerPattern}[ \\t]+`);
  return new RegExp(`^${contentPattern}$`, "u").test(sourceContents[0]);
}

function normalizeListMarkerSpacing(spacing: string): string {
  return spacing.includes("\t") ? spacing : " ";
}

function createListRunLinesFromSourceFormat(
  sourceLines: MarkdownLine[],
  sourceRun: UnorderedListRun,
  editedRun: UnorderedListRun,
): MarkdownLine[] {
  const lines: MarkdownLine[] = [];

  for (let index = 0; index < editedRun.items.length; index += 1) {
    const sourceItem =
      sourceRun.items[Math.min(index, sourceRun.items.length - 1)];
    const editedItem = editedRun.items[index];
    const sourceLine = sourceLines[sourceItem.lineIndex];
    const isLastEditedItem = index === editedRun.items.length - 1;
    const sourceRunEnding =
      sourceLines[sourceRun.items.at(-1)?.lineIndex ?? sourceItem.lineIndex]
        .ending;
    lines.push({
      ending: isLastEditedItem
        ? sourceRunEnding
        : sourceLine.ending || sourceRunEnding || "\n",
      // 列表层级属于编辑结果的结构，不能沿用旧源码对应位置的缩进。
      text: `${editedItem.indent}${sourceItem.marker}${normalizeListMarkerSpacing(sourceItem.spacing)}${editedItem.content}`,
    });

    const nextSourceItem = sourceRun.items[index + 1];
    if (!nextSourceItem) continue;

    for (
      let lineIndex = sourceItem.lineIndex + 1;
      lineIndex < nextSourceItem.lineIndex;
      lineIndex += 1
    ) {
      lines.push(sourceLines[lineIndex]);
    }
  }

  return lines;
}

function repairJoinedUnorderedListSource(
  source: string,
  baseline: string,
): string | null {
  const separatedSource = repairJoinedUnorderedListMarkers(source, true);
  if (separatedSource === null) return null;

  const sourceLines = splitMarkdownLines(separatedSource);
  const baselineLines = splitMarkdownLines(baseline);
  const sourceRuns = collectUnorderedListRuns(sourceLines);
  const baselineRuns = collectUnorderedListRuns(baselineLines);

  if (sourceRuns.length === 0 || sourceRuns.length !== baselineRuns.length) {
    return null;
  }

  const replacements: Array<{
    lines: MarkdownLine[];
    startLineIndex: number;
    endLineIndex: number;
  }> = [];

  for (let index = 0; index < sourceRuns.length; index += 1) {
    const sourceRun = sourceRuns[index];
    const baselineRun = baselineRuns[index];
    const sourceContents = getListRunContents(sourceRun);
    const baselineContents = getListRunContents(baselineRun);
    if (!hasSameContentOrder(sourceContents, baselineContents)) return null;

    // 部分列表项被拼接时，以富文本基线恢复层级，同时保留源码原有 marker 风格。
    replacements.push({
      endLineIndex: sourceRun.endLineIndex,
      lines: createListRunLinesFromSourceFormat(
        sourceLines,
        sourceRun,
        baselineRun,
      ),
      startLineIndex: sourceRun.startLineIndex,
    });
  }

  if (replacements.length === 0) return null;

  const nextLines = [...sourceLines];
  for (const replacement of replacements.toReversed()) {
    nextLines.splice(
      replacement.startLineIndex,
      replacement.endLineIndex - replacement.startLineIndex,
      ...replacement.lines,
    );
  }

  return preserveSourceEnding(
    source,
    nextLines.map((line) => `${line.text}${line.ending}`).join(""),
  );
}

function preserveChangedUnorderedListStructure(
  source: string,
  baseline: string,
  edited: string,
): string | null {
  const sourceLines = splitMarkdownLines(source);
  const baselineLines = splitMarkdownLines(baseline);
  const editedLines = splitMarkdownLines(edited);
  const sourceRuns = collectUnorderedListRuns(sourceLines);
  const baselineRuns = collectUnorderedListRuns(baselineLines);
  const editedRuns = collectUnorderedListRuns(editedLines);
  const structureChanged =
    baselineRuns.length !== editedRuns.length ||
    baselineRuns.some((baselineRun, runIndex) => {
      const editedRun = editedRuns[runIndex];
      return (
        !editedRun ||
        baselineRun.items.length !== editedRun.items.length ||
        baselineRun.items.some(
          (item, itemIndex) =>
            item.indent !== editedRun.items[itemIndex]?.indent,
        )
      );
    });

  if (!structureChanged) return null;
  if (
    sourceRuns.length === 0 ||
    sourceRuns.length !== baselineRuns.length ||
    baselineRuns.length !== editedRuns.length
  ) {
    return preserveSourceEnding(source, edited);
  }

  const replacements: Array<{
    lines: MarkdownLine[];
    startLineIndex: number;
    endLineIndex: number;
  }> = [];

  for (let index = 0; index < baselineRuns.length; index += 1) {
    const sourceRun = sourceRuns[index];
    const baselineRun = baselineRuns[index];
    const editedRun = editedRuns[index];
    if (
      !hasSameContentOrder(
        getListRunContents(sourceRun),
        getListRunContents(baselineRun),
      )
    ) {
      return preserveSourceEnding(source, edited);
    }

    replacements.push({
      endLineIndex: sourceRun.endLineIndex,
      lines: createListRunLinesFromSourceFormat(
        sourceLines,
        sourceRun,
        editedRun,
      ),
      startLineIndex: sourceRun.startLineIndex,
    });
  }

  const nextLines = [...sourceLines];
  for (const replacement of replacements.toReversed()) {
    nextLines.splice(
      replacement.startLineIndex,
      replacement.endLineIndex - replacement.startLineIndex,
      ...replacement.lines,
    );
  }

  // 新增、删除或缩进列表项属于块结构变更，直接按编辑器树重建，避免字符 diff 拼接换行。
  return preserveSourceEnding(
    source,
    nextLines.map((line) => `${line.text}${line.ending}`).join(""),
  );
}

function splitJoinedUnorderedListLine(
  line: MarkdownLine,
  allowWhitespaceSeparatedMarkers = false,
): MarkdownLine[] | null {
  const match = line.text.match(UNORDERED_LIST_LINE_PATTERN);
  if (!match) return null;

  const [, indent, marker, spacing, content] = match;
  const markerPattern = new RegExp(`${escapeRegExpText(marker)}[ \\t]+`, "gu");
  const segments: string[] = [];
  let segmentStart = 0;

  for (const markerMatch of content.matchAll(markerPattern)) {
    const markerIndex = markerMatch.index;
    if (markerIndex === undefined || markerIndex === 0) continue;
    if (
      !allowWhitespaceSeparatedMarkers &&
      !/\S/u.test(content[markerIndex - 1])
    ) {
      continue;
    }

    segments.push(content.slice(segmentStart, markerIndex).trimEnd());
    segmentStart = markerIndex + markerMatch[0].length;
  }

  if (segments.length === 0) return null;

  segments.push(content.slice(segmentStart));
  const markerSpacing = normalizeListMarkerSpacing(spacing);

  return segments.map((segment, index) => ({
    ending: index === segments.length - 1 ? line.ending : "\n",
    text: `${indent}${marker}${markerSpacing}${segment}`,
  }));
}

function repairJoinedUnorderedListMarkers(
  markdown: string,
  allowWhitespaceSeparatedMarkers = false,
): string | null {
  const lines = splitMarkdownLines(markdown);
  let openingFence: string | null = null;
  let changed = false;
  const nextLines: MarkdownLine[] = [];

  for (const line of lines) {
    const fenceMatch = openingFence
      ? getClosingFenceMatch(line.text, openingFence)
      : line.text.match(FENCED_CODE_LINE_PATTERN);
    if (fenceMatch) {
      openingFence = openingFence ? null : fenceMatch[1];
      nextLines.push(line);
      continue;
    }

    const repairedLines = openingFence
      ? null
      : splitJoinedUnorderedListLine(line, allowWhitespaceSeparatedMarkers);
    if (!repairedLines) {
      nextLines.push(line);
      continue;
    }

    changed = true;
    nextLines.push(...repairedLines);
  }

  if (!changed) return null;

  return preserveSourceEnding(
    markdown,
    nextLines.map((line) => `${line.text}${line.ending}`).join(""),
  );
}

function splitJoinedFencedCodeOpening(
  line: MarkdownLine,
): MarkdownLine[] | null {
  const match = line.text.match(FENCED_CODE_OPENING_PATTERN);
  if (!match) return null;

  const [, indent, fence, rawInfo] = match;
  const info = rawInfo.trimStart();
  if (!info) return null;

  const normalizedInfo = info.toLowerCase();
  // 优先移除最长的受支持语言或别名；其后必须是空白或非 ASCII 内容，剩余部分才作为首行代码。
  const candidate = FENCED_CODE_LANGUAGE_CANDIDATES.find(({ value }) => {
    if (!normalizedInfo.startsWith(value.toLowerCase())) return false;
    const boundary = info[value.length];
    return (
      boundary !== undefined && (/\s/u.test(boundary) || boundary > "\x7f")
    );
  });
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

export function repairMarkdownSourceBeforeParse(markdown: string): string {
  const fencedCodeRepaired =
    repairJoinedFencedCodeFirstLines(markdown) ?? markdown;
  return (
    repairJoinedUnorderedListMarkers(fencedCodeRepaired) ?? fencedCodeRepaired
  );
}

function preserveReorderedUnorderedLists(
  source: string,
  baseline: string,
  edited: string,
): string | null {
  const sourceLines = splitMarkdownLines(source);
  const baselineLines = splitMarkdownLines(baseline);
  const editedLines = splitMarkdownLines(edited);
  const sourceRuns = collectUnorderedListRuns(sourceLines);
  const baselineRuns = collectUnorderedListRuns(baselineLines);
  const editedRuns = collectUnorderedListRuns(editedLines);

  if (
    sourceRuns.length === 0 ||
    sourceRuns.length !== baselineRuns.length ||
    baselineRuns.length !== editedRuns.length
  ) {
    return null;
  }

  const replacements: Array<{
    lines: MarkdownLine[];
    startLineIndex: number;
    endLineIndex: number;
  }> = [];

  for (let index = 0; index < sourceRuns.length; index += 1) {
    const sourceRun = sourceRuns[index];
    const baselineRun = baselineRuns[index];
    const editedRun = editedRuns[index];
    const sourceContents = getListRunContents(sourceRun);
    const baselineContents = getListRunContents(baselineRun);
    const editedContents = getListRunContents(editedRun);
    const sourceMatchesBaseline = hasSameContentOrder(
      sourceContents,
      baselineContents,
    );
    const sourceMatchesEdited = hasSameContentOrder(
      sourceContents,
      editedContents,
    );
    const sourceMatchesJoinedBaseline = hasJoinedListRunContent(
      sourceRun,
      sourceContents,
      baselineContents,
    );
    const sourceMatchesJoinedEdited = hasJoinedListRunContent(
      sourceRun,
      sourceContents,
      editedContents,
    );

    if (!hasSameContentMultiset(baselineContents, editedContents)) {
      return null;
    }
    if (
      !sourceMatchesBaseline &&
      !sourceMatchesEdited &&
      !sourceMatchesJoinedBaseline &&
      !sourceMatchesJoinedEdited
    ) {
      return null;
    }
    if (
      sourceMatchesBaseline &&
      hasSameContentOrder(baselineContents, editedContents)
    ) {
      continue;
    }

    // 拖拽保存可能和上一轮 baseline 交错；只要三方列表项集合一致，就用块级顺序重建，避免字符级 diff 把换行/标记映射错位。
    replacements.push({
      endLineIndex: editedRun.endLineIndex,
      lines: createListRunLinesFromSourceFormat(
        sourceLines,
        sourceRun,
        editedRun,
      ),
      startLineIndex: editedRun.startLineIndex,
    });
  }

  if (replacements.length === 0) return null;

  const nextLines = [...editedLines];
  for (const replacement of replacements.toReversed()) {
    nextLines.splice(
      replacement.startLineIndex,
      replacement.endLineIndex - replacement.startLineIndex,
      ...replacement.lines,
    );
  }

  return preserveSourceEnding(
    source,
    nextLines.map((line) => `${line.text}${line.ending}`).join(""),
  );
}

function preserveMovedUnorderedListItemsAcrossBlocks(
  source: string,
  baseline: string,
  edited: string,
): string | null {
  const sourceLines = splitMarkdownLines(source);
  const baselineLines = splitMarkdownLines(baseline);
  const editedLines = splitMarkdownLines(edited);
  const sourceItems = collectUnorderedListItems(sourceLines);
  const baselineItems = collectUnorderedListItems(baselineLines);
  const editedItems = collectUnorderedListItems(editedLines);
  const sourceContents = getListItemContents(sourceItems);
  const baselineContents = getListItemContents(baselineItems);
  const editedContents = getListItemContents(editedItems);
  const listShapeChanged =
    !hasSameContentOrder(baselineContents, editedContents) ||
    baselineItems.some((item, index) => {
      return item.lineIndex !== editedItems[index]?.lineIndex;
    });

  if (baselineItems.length < 2 || editedItems.length !== baselineItems.length) {
    return null;
  }
  if (
    sourceItems.length !== baselineItems.length ||
    !hasSameContentMultiset(baselineContents, editedContents)
  ) {
    return null;
  }
  if (
    !hasSameContentMultiset(sourceContents, baselineContents) &&
    !hasSameContentMultiset(sourceContents, editedContents)
  ) {
    return null;
  }

  const formatBuckets = getListItemFormatBuckets(sourceItems);
  let openingFence: string | null = null;
  let changed = false;
  let editedItemIndex = 0;
  const nextLines = editedLines.map((line) => {
    const isInsideFence = openingFence !== null;
    const fenceMatch = openingFence
      ? getClosingFenceMatch(line.text, openingFence)
      : line.text.match(FENCED_CODE_LINE_PATTERN);
    const editedMatch = isInsideFence
      ? null
      : line.text.match(UNORDERED_LIST_LINE_PATTERN);
    let nextText = line.text;

    if (editedMatch) {
      const sourceItem = takeListItemFormat(
        formatBuckets,
        sourceItems,
        editedMatch[4],
        editedItemIndex,
      );
      const sourceMarkerSpacing = normalizeListMarkerSpacing(
        sourceItem.spacing,
      );
      nextText = `${editedMatch[1]}${sourceItem.marker}${sourceMarkerSpacing}${editedMatch[4]}`;
      changed ||= nextText !== line.text;
      editedItemIndex += 1;
    }

    if (fenceMatch) {
      openingFence = openingFence ? null : fenceMatch[1];
    }

    return {
      ending: line.ending,
      text: nextText,
    };
  });

  if (!changed && !listShapeChanged) return null;

  // 列表跨标题/普通块拖动时 run 数会变化，不能再用字符级 diff 映射源码。
  return preserveSourceEnding(
    source,
    nextLines.map((line) => `${line.text}${line.ending}`).join(""),
  );
}

function preserveLargeDocumentListMarkers(source: string, edited: string) {
  const sourceLines = splitMarkdownLines(source);
  const editedLines = splitMarkdownLines(edited);
  if (sourceLines.length !== editedLines.length) {
    return preserveSourceEnding(source, edited);
  }

  let openingFence: string | null = null;
  const result = editedLines
    .map((editedLine, index) => {
      const sourceLine = sourceLines[index];
      const isInsideFence = openingFence !== null;
      const openingFenceMatch = openingFence
        ? getClosingFenceMatch(sourceLine.text, openingFence)
        : sourceLine.text.match(FENCED_CODE_LINE_PATTERN);
      const sourceListMatch = sourceLine.text.match(
        UNORDERED_LIST_LINE_PATTERN,
      );
      const editedListMatch = editedLine.text.match(
        UNORDERED_LIST_LINE_PATTERN,
      );
      let nextText = editedLine.text;

      if (!isInsideFence && sourceListMatch && editedListMatch) {
        // 大文档不做字符级 diff，但仍保留源码中已有的无序列表标记。
        nextText = `${editedListMatch[1]}${sourceListMatch[2]}${editedListMatch[3]}${editedListMatch[4]}`;
      }

      if (openingFenceMatch) {
        openingFence = openingFence ? null : openingFenceMatch[1];
      }

      return `${nextText}${sourceLine.ending || editedLine.ending}`;
    })
    .join("");

  return preserveSourceEnding(source, result);
}

function getListLineSignature(text: string, quoted: boolean): string | null {
  if (quoted && !/^> ?/u.test(text)) return null;
  const content = quoted ? text.replace(/^> ?/u, "") : text;
  const match = content.match(/^([ \t]*)[-+*][ \t]+(.*)$/u);
  if (!match) return null;

  return `${match[1].length}:${match[2]}`;
}

function repairEmptyQuoteChildListSource(
  markdown: string,
  serialized: string,
): string {
  const serializedLines = splitMarkdownLines(serialized);
  const quotedRuns: string[][] = [];

  for (let index = 0; index < serializedLines.length; index += 1) {
    const signatures: string[] = [];
    while (index < serializedLines.length) {
      const signature = getListLineSignature(serializedLines[index].text, true);
      if (!signature) break;
      signatures.push(signature);
      index += 1;
    }
    if (signatures.length > 0) quotedRuns.push(signatures);
  }
  if (quotedRuns.length === 0) return markdown;

  const sourceLines = splitMarkdownLines(markdown);
  for (const quotedRun of quotedRuns) {
    for (let listStart = 0; listStart < sourceLines.length; listStart += 1) {
      const sourceSignatures = quotedRun.map((_, offset) =>
        getListLineSignature(
          sourceLines[listStart + offset]?.text ?? "",
          false,
        ),
      );
      if (
        sourceSignatures.some((signature) => signature === null) ||
        sourceSignatures.some(
          (signature, offset) => signature !== quotedRun[offset],
        )
      ) {
        continue;
      }

      let quoteIndex = listStart - 1;
      while (quoteIndex >= 0 && sourceLines[quoteIndex].text.trim() === "") {
        quoteIndex -= 1;
      }
      if (quoteIndex < 0 || !/^>\s*$/u.test(sourceLines[quoteIndex].text)) {
        continue;
      }

      const quotedListLines = sourceLines
        .slice(listStart, listStart + quotedRun.length)
        .map((line) => ({
          ...line,
          text: `> ${line.text.replace(/^([ \t]*)[-+*]([ \t]+)/u, "$1-$2")}`,
        }));

      // 旧源码中的空引用占位与外层列表属于同一个富文本父引用，合并回标准引用列表。
      sourceLines.splice(
        quoteIndex,
        listStart + quotedRun.length - quoteIndex,
        ...quotedListLines,
      );
      break;
    }
  }

  return sourceLines.map((line) => `${line.text}${line.ending}`).join("");
}

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

function isMarkupTagOpener(source: string, offset: number): boolean {
  const candidate = source.slice(offset + 1);
  if (/^[A-Za-z][A-Za-z\d+.-]*:\/\//u.test(candidate)) return false;
  if (/^(?:!--|!DOCTYPE\b|\?xml\b)/iu.test(candidate)) return true;

  return /^\/?[A-Za-z][A-Za-z\d_.:-]*(?=[\s/>]|$)/u.test(candidate);
}

function lineContainsMarkupForParser(
  source: string,
  inlineCodeFenceLength: { current: number },
): boolean {
  for (let offset = 0; offset < source.length; ) {
    if (source[offset] === "`") {
      let runLength = 1;
      while (source[offset + runLength] === "`") runLength += 1;
      if (inlineCodeFenceLength.current === 0) {
        inlineCodeFenceLength.current = runLength;
      } else if (inlineCodeFenceLength.current === runLength) {
        inlineCodeFenceLength.current = 0;
      }
      offset += runLength;
      continue;
    }

    if (
      inlineCodeFenceLength.current === 0 &&
      source[offset] === "<" &&
      isMarkupTagOpener(source, offset)
    ) {
      return true;
    }
    offset += 1;
  }

  return false;
}

interface ProtectedMarkup {
  continuationMarker: string;
  markdown: string;
  replacements: ReadonlyMap<string, string>;
}

function protectMarkupForParser(markdown: string): ProtectedMarkup {
  const lines = splitMarkdownLines(markdown);
  const inlineCodeFenceLength = { current: 0 };
  const protectedLines: boolean[] = [];
  let openingFence: string | null = null;
  let markupBlockActive = false;

  // 只保护正文中的源码段；围栏代码、缩进代码、行内代码和自动链接继续交给原 Markdown 规则。
  for (const line of lines) {
    if (!line.text.trim()) {
      markupBlockActive = false;
      inlineCodeFenceLength.current = 0;
      protectedLines.push(false);
      continue;
    }

    const fenceMatch = openingFence
      ? getClosingFenceMatch(line.text, openingFence)
      : line.text.match(FENCED_CODE_LINE_PATTERN);
    if (fenceMatch) {
      openingFence = openingFence ? null : fenceMatch[1];
      markupBlockActive = false;
      inlineCodeFenceLength.current = 0;
      protectedLines.push(false);
      continue;
    }
    if (openingFence) {
      protectedLines.push(false);
      continue;
    }

    if (
      !markupBlockActive &&
      !/^(?: {4}|\t)/u.test(line.text) &&
      lineContainsMarkupForParser(line.text, inlineCodeFenceLength)
    ) {
      markupBlockActive = true;
    }
    protectedLines.push(markupBlockActive);
  }

  if (!protectedLines.includes(true)) {
    return { continuationMarker: "", markdown, replacements: new Map() };
  }

  // 临时私有字符让 BlockNote 无法把 JSX/HTML 解释成标签；解析后按字符映射无损还原。
  const sourceCharacters = new Set(Array.from(markdown));
  const encodedCharacters = new Map<string, string>();
  const replacements = new Map<string, string>();
  let nextPrivateCodePoint = 0xf0000;
  const takePrivateCharacter = () => {
    let character = String.fromCodePoint(nextPrivateCodePoint);
    while (sourceCharacters.has(character) || replacements.has(character)) {
      nextPrivateCodePoint += 1;
      character = String.fromCodePoint(nextPrivateCodePoint);
    }
    nextPrivateCodePoint += 1;
    return character;
  };
  const continuationMarker = takePrivateCharacter();
  const encodeCharacter = (character: string) => {
    const existing = encodedCharacters.get(character);
    if (existing) return existing;

    const encoded = takePrivateCharacter();
    encodedCharacters.set(character, encoded);
    replacements.set(encoded, character);
    return encoded;
  };
  const protectedMarkdown = lines
    .map((line, index) => {
      if (!protectedLines[index]) return `${line.text}${line.ending}`;

      const prefix = protectedLines[index - 1] ? continuationMarker : "";
      const encoded = Array.from(line.text, encodeCharacter).join("");
      const hardBreak = line.ending && protectedLines[index + 1] ? "  " : "";
      return `${prefix}${encoded}${hardBreak}${line.ending}`;
    })
    .join("");

  return { continuationMarker, markdown: protectedMarkdown, replacements };
}

function restoreProtectedMarkup<T>(
  value: T,
  continuationMarker: string,
  replacements: ReadonlyMap<string, string>,
): T {
  if (typeof value === "string") {
    // BlockNote 会在硬换行后补一个空格，借助续行标记只移除这一个解析器附加字符。
    const normalized = value
      .replaceAll(` ${continuationMarker}`, continuationMarker)
      .replaceAll(continuationMarker, "");
    return Array.from(
      normalized,
      (character) => replacements.get(character) ?? character,
    ).join("") as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) =>
      restoreProtectedMarkup(item, continuationMarker, replacements),
    ) as T;
  }
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      restoreProtectedMarkup(item, continuationMarker, replacements),
    ]),
  ) as T;
}

/**
 * 规范化无序列表标记，解决 BlockNote 序列化器硬编码 marker = "* " 的问题。
 * 当源文件只使用 - 或 + 作为列表标记时，将结果中被 BlockNote 改写的 * 还原为源文件的标记。
 * 如果源文件混合使用了多种标记，不做规范化以避免误改。
 */
function normalizeUnorderedListMarkers(source: string, result: string): string {
  const sourceLines = splitMarkdownLines(source);
  let hasDash = false;
  let hasStar = false;
  let hasPlus = false;
  let openingFence: string | null = null;

  for (const line of sourceLines) {
    const fenceMatch = openingFence
      ? getClosingFenceMatch(line.text, openingFence)
      : line.text.match(FENCED_CODE_LINE_PATTERN);
    if (fenceMatch) {
      openingFence = openingFence ? null : fenceMatch[1];
      continue;
    }
    if (openingFence) continue;

    const match = line.text.match(UNORDERED_LIST_LINE_PATTERN);
    if (!match) continue;
    if (match[2] === "-") hasDash = true;
    else if (match[2] === "*") hasStar = true;
    else if (match[2] === "+") hasPlus = true;
  }

  // 确定源文件的主导标记。
  // 只使用 - → 规范化 * 为 -
  // 只使用 + → 规范化 * 为 +
  // 使用 * 或混合标记 → 不处理（避免误改用户有意使用的 *）
  let preferredMarker: string | null = null;
  if (hasDash && !hasStar && !hasPlus) {
    preferredMarker = "-";
  } else if (hasPlus && !hasStar && !hasDash) {
    preferredMarker = "+";
  }

  if (preferredMarker === null) return result;

  const resultLines = splitMarkdownLines(result);
  openingFence = null;
  const normalized = resultLines.map((line) => {
    const fenceMatch = openingFence
      ? getClosingFenceMatch(line.text, openingFence)
      : line.text.match(FENCED_CODE_LINE_PATTERN);
    if (fenceMatch) {
      openingFence = openingFence ? null : fenceMatch[1];
      return line;
    }
    if (openingFence) return line;

    const match = line.text.match(UNORDERED_LIST_LINE_PATTERN);
    if (match && match[2] !== preferredMarker) {
      return {
        ...line,
        text: `${match[1]}${preferredMarker}${match[3]}${match[4]}`,
      };
    }
    return line;
  });

  return normalized.map((line) => `${line.text}${line.ending}`).join("");
}

export function preserveMarkdownSource(
  source: string,
  baseline: string,
  edited: string,
): string {
  const repairedJoinedListSource = repairJoinedUnorderedListSource(
    source,
    baseline,
  );
  const repairedListMarkerSource =
    repairedJoinedListSource ?? repairMarkdownSourceBeforeParse(source);
  const preservationSource = repairedListMarkerSource;
  const finalizeMarkdown = (markdown: string) =>
    repairMarkdownSourceAfterPreserve(preservationSource, markdown, edited);

  // 空白文件没有可供差异映射的源码边界，直接采用编辑器结果可避免换行被映射成空格或空段落。
  if (!preservationSource.trim()) {
    return repairMarkdownSourceAfterPreserve("", edited, edited);
  }

  if (baseline === edited) return finalizeMarkdown(preservationSource);

  // 大文档跳过列表重排和跨块移动的多次 splitMarkdownLines 扫描，
  // 直接走字符级或行级的保留路径，避免不必要的 O(n) 开销。
  const isLargeDocument =
    preservationSource.length > LARGE_DOC_LIST_PRESERVE_LIMIT;

  if (!isLargeDocument) {
    const changedListStructure = preserveChangedUnorderedListStructure(
      preservationSource,
      baseline,
      edited,
    );
    if (changedListStructure !== null) {
      return finalizeMarkdown(changedListStructure);
    }

    const reorderedListSource = preserveReorderedUnorderedLists(
      preservationSource,
      baseline,
      edited,
    );
    if (reorderedListSource !== null) {
      return finalizeMarkdown(reorderedListSource);
    }

    const movedListSource = preserveMovedUnorderedListItemsAcrossBlocks(
      preservationSource,
      baseline,
      edited,
    );
    if (movedListSource !== null) return finalizeMarkdown(movedListSource);
  }

  if (
    source.length + baseline.length + edited.length >
    SOURCE_PRESERVATION_DIFF_CHAR_LIMIT
  ) {
    // 大文档避免字符级 diff 阻塞输入；保留行级列表标记和文件结尾，正文采用编辑器序列化结果。
    return finalizeMarkdown(
      preserveLargeDocumentListMarkers(preservationSource, edited),
    );
  }

  const boundaryMap = createSourceBoundaryMap(baseline, preservationSource);
  const edits = collectMarkdownEdits(diffChars(baseline, edited));
  const mappedEdits = edits.map((edit) => {
    const oldText = baseline.slice(edit.start, edit.end);
    let start = chooseSourceBoundary(
      baseline,
      preservationSource,
      boundaryMap,
      edit.start,
    );
    let end = chooseSourceBoundary(
      baseline,
      preservationSource,
      boundaryMap,
      edit.end,
    );
    const exactStart = locateExactChangedText(
      preservationSource,
      oldText,
      start,
    );

    if (exactStart !== null) {
      start = exactStart;
      end = exactStart + oldText.length;
    }

    return { ...edit, start, end };
  });
  for (let index = 1; index < mappedEdits.length; index += 1) {
    if (mappedEdits[index - 1].end > mappedEdits[index].start) {
      return finalizeMarkdown(edited);
    }
  }

  let result = preservationSource;
  for (const edit of mappedEdits.toReversed()) {
    // 映射异常时回退到编辑器结果，避免生成内容错位或重复。
    if (edit.start < 0 || edit.end < edit.start || edit.end > result.length) {
      return finalizeMarkdown(edited);
    }
    result =
      result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  }

  return finalizeMarkdown(result);
}

export function ensureEditableBlocks<TBlock>(
  blocks: TBlock[],
  createBlankBlock: () => TBlock,
): TBlock[] {
  return blocks.length > 0 ? blocks : [createBlankBlock()];
}

function hasUrlProtocol(url: string) {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(url);
}

function normalizeLocalPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const prefix = normalized.match(/^[A-Za-z]:/)?.[0] ?? "";
  const isAbsolute = normalized.startsWith("/") || Boolean(prefix);
  const parts = normalized.split("/");
  const result: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (result.length > 0 && result[result.length - 1] !== "..") {
        result.pop();
      } else if (!isAbsolute) {
        result.push(part);
      }
      continue;
    }
    result.push(part);
  }

  const joined = result.join("/");
  if (prefix) return joined;
  return isAbsolute ? `/${joined}` : joined;
}

function getLocalDirname(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex < 0) return "";
  if (slashIndex === 0) return "/";
  return normalized.slice(0, slashIndex);
}

function joinLocalPath(baseDir: string, relativePath: string) {
  if (!baseDir) return normalizeLocalPath(relativePath);
  return normalizeLocalPath(`${baseDir.replace(/\/$/u, "")}/${relativePath}`);
}

function toFileUrl(path: string) {
  const normalized = normalizeLocalPath(path);
  const encodedPath = normalized
    .split("/")
    .map((part) => encodeURIComponent(part).replace(/^([A-Za-z])%3A$/u, "$1:"))
    .join("/");

  if (/^[A-Za-z]:/u.test(normalized)) {
    return `file:///${encodedPath}`;
  }

  return `file://${encodedPath}`;
}

export function resolveEditorImageUrl(
  url: string,
  markdownFilePath: string | null,
): string {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return url;
  if (hasUrlProtocol(trimmedUrl) || trimmedUrl.startsWith("//")) {
    return url;
  }

  if (trimmedUrl.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(trimmedUrl)) {
    return toFileUrl(trimmedUrl);
  }

  if (!markdownFilePath) return url;

  return toFileUrl(
    joinLocalPath(getLocalDirname(markdownFilePath), trimmedUrl),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getInlineText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((item) => {
      if (!isRecord(item)) return "";
      if (typeof item.text === "string") return item.text;
      return getInlineText(item.content);
    })
    .join("");
}

function getMarkdownImageFromPlainText(content: unknown) {
  const text = getInlineText(content).trim();
  const match = text.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/u);
  if (!match) return null;

  return {
    name: match[1],
    url: match[2],
  };
}

function getMarkdownImageFromLinkContent(content: unknown) {
  if (!Array.isArray(content) || content.length !== 2) return null;

  const [prefix, link] = content;
  if (!isRecord(prefix) || prefix.type !== "text" || prefix.text !== "!") {
    return null;
  }
  if (
    !isRecord(link) ||
    link.type !== "link" ||
    typeof link.href !== "string"
  ) {
    return null;
  }

  return {
    name: getInlineText(link.content),
    url: link.href,
  };
}

function createImageBlockFromParagraph<TBlock>(
  block: Record<string, unknown>,
  image: { name: string; url: string },
): TBlock {
  const nextBlock: Record<string, unknown> = {
    type: "image",
    props: {
      ...(isRecord(block.props) ? block.props : {}),
      name: image.name,
      url: image.url,
    },
  };

  if (Array.isArray(block.children)) {
    nextBlock.children = block.children;
  }

  return nextBlock as TBlock;
}

function promoteMarkdownImageParagraph<TBlock>(block: TBlock): TBlock {
  if (!isRecord(block) || block.type !== "paragraph") return block;

  const image =
    getMarkdownImageFromLinkContent(block.content) ??
    getMarkdownImageFromPlainText(block.content);
  if (!image) return block;

  return createImageBlockFromParagraph(block, image);
}

async function resolveImageBlockUrls<TBlock>(
  blocks: TBlock[],
  options: MarkdownParseOptions,
): Promise<TBlock[]> {
  return Promise.all(
    blocks.map(async (block) => {
      const promotedBlock = promoteMarkdownImageParagraph(block);
      if (!isRecord(promotedBlock)) return promotedBlock;

      let nextBlock: Record<string, unknown> = promotedBlock;
      const props = isRecord(promotedBlock.props) ? promotedBlock.props : null;
      const sourceUrl =
        props && typeof props.url === "string" ? props.url : null;

      if (
        options.resolveImageUrl &&
        promotedBlock.type === "image" &&
        sourceUrl
      ) {
        const resolvedUrl = resolveEditorImageUrl(
          sourceUrl,
          options.markdownFilePath ?? null,
        );
        const imageDataUrl = await options.resolveImageUrl(resolvedUrl);

        if (imageDataUrl && imageDataUrl !== sourceUrl) {
          // BlockNote 的图片节点直接使用 props.url 渲染，提前转为 data URL 可避开 Electron 资源来源限制。
          nextBlock = {
            ...nextBlock,
            props: {
              ...props,
              url: imageDataUrl,
            },
          };
        }
      }

      if (Array.isArray(nextBlock.children)) {
        const children = await resolveImageBlockUrls(
          nextBlock.children,
          options,
        );
        if (children !== nextBlock.children) {
          nextBlock = {
            ...nextBlock,
            children,
          };
        }
      }

      return nextBlock as TBlock;
    }),
  );
}

const QUOTE_LINE_PATTERN = /^> ?/u;
const QUOTE_BLANK_LINE_PATTERN = /^>\s*$/u;
const QUOTE_LIST_LINE_PATTERN = /^>\s*[-+*]\s+/u;

function getMarkdownBlockType(block: unknown): string | null {
  if (!isRecord(block) || typeof block.type !== "string") return null;
  return block.type;
}

function collectCodeBlockContents(blocks: unknown[]): string[] {
  const contents: string[] = [];

  const visit = (block: unknown) => {
    if (!isRecord(block)) return;
    if (getMarkdownBlockType(block) === "codeBlock") {
      contents.push(getInlineText(block.content));
    }
    if (Array.isArray(block.children)) {
      block.children.forEach(visit);
    }
  };

  blocks.forEach(visit);
  return contents;
}

function normalizeSerializedCodeBlockContent<TBlock>(
  markdown: string,
  blocks: TBlock[],
): string {
  const codeBlockContents = collectCodeBlockContents(blocks);
  if (codeBlockContents.length === 0) return markdown;

  const lines = splitMarkdownLines(markdown);
  let codeBlockIndex = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const openingMatch = lines[index].text.match(FENCED_CODE_OPENING_PATTERN);
    if (!openingMatch) continue;

    const openingFence = openingMatch[2];
    let closingIndex = index + 1;
    while (
      closingIndex < lines.length &&
      !getClosingFenceMatch(lines[closingIndex].text, openingFence)
    ) {
      closingIndex += 1;
    }
    if (closingIndex >= lines.length) break;

    const expectedContent = codeBlockContents[codeBlockIndex];
    codeBlockIndex += 1;
    if (expectedContent === undefined) break;

    const expectedLines = expectedContent.replace(/\r\n?/g, "\n").split("\n");
    const serializedLines = lines.slice(index + 1, closingIndex);
    if (expectedLines.length === serializedLines.length) {
      const replacements: Array<{ index: number; text: string }> = [];
      let matchesContent = true;

      for (let offset = 0; offset < expectedLines.length; offset += 1) {
        const expectedLine = expectedLines[offset];
        const serializedLine = serializedLines[offset].text;
        const indentedExpectedLine = `${openingMatch[1]}${expectedLine}`;

        if (
          serializedLine === expectedLine ||
          serializedLine === indentedExpectedLine
        ) {
          continue;
        }
        if (serializedLine === `${expectedLine}\\`) {
          replacements.push({ index: index + 1 + offset, text: expectedLine });
          continue;
        }
        if (serializedLine === `${indentedExpectedLine}\\`) {
          replacements.push({
            index: index + 1 + offset,
            text: indentedExpectedLine,
          });
          continue;
        }

        matchesContent = false;
        break;
      }

      if (matchesContent) {
        // 仅清理序列化器相对真实代码内容额外追加的反斜杠，用户源码中的反斜杠保持不变。
        for (const replacement of replacements) {
          lines[replacement.index].text = replacement.text;
        }
      }
    }

    index = closingIndex;
  }

  return lines.map((line) => `${line.text}${line.ending}`).join("");
}

// BlockNote 会将引用内的列表行折叠为普通引用文本，解析前临时展开后再恢复子块关系。
function normalizeQuoteListsForParser(markdown: string): {
  descriptors: QuoteListDescriptor[];
  markdown: string;
} {
  const lines = markdown.split("\n");
  const descriptors: QuoteListDescriptor[] = [];
  let quoteOrdinal = 0;
  let index = 0;

  while (index < lines.length) {
    if (!QUOTE_LINE_PATTERN.test(lines[index])) {
      index += 1;
      continue;
    }

    const quoteStart = index;
    let quoteEnd = index;
    while (
      quoteEnd < lines.length &&
      QUOTE_LINE_PATTERN.test(lines[quoteEnd])
    ) {
      quoteEnd += 1;
    }
    quoteOrdinal += 1;

    let listStart = quoteStart;
    while (
      listStart < quoteEnd &&
      !QUOTE_LIST_LINE_PATTERN.test(lines[listStart])
    ) {
      listStart += 1;
    }
    if (listStart === quoteEnd) {
      index = quoteEnd;
      continue;
    }

    let listEnd = listStart;
    while (listEnd < quoteEnd && QUOTE_LIST_LINE_PATTERN.test(lines[listEnd])) {
      listEnd += 1;
    }
    if (listEnd !== quoteEnd) {
      index = quoteEnd;
      continue;
    }

    let replacementStart = listStart;
    while (
      replacementStart > quoteStart &&
      QUOTE_BLANK_LINE_PATTERN.test(lines[replacementStart - 1])
    ) {
      replacementStart -= 1;
    }
    const listLines = lines
      .slice(listStart, listEnd)
      .map((line) => line.replace(/^> ?/u, ""));
    const quotePrefix = replacementStart === quoteStart ? [">"] : [];

    lines.splice(
      replacementStart,
      listEnd - replacementStart,
      ...quotePrefix,
      "",
      ...listLines,
    );
    const listIndents = listLines.map(
      (line) => line.match(/^([ \t]*)[-+*][ \t]+/u)?.[1].length ?? 0,
    );
    const rootIndent = Math.min(...listIndents);
    const itemCount = listIndents.filter(
      (indent) => indent === rootIndent,
    ).length;
    // 描述符按顶层列表块计数，嵌套列表行会由解析器保留在父列表项 children 中。
    descriptors.push({ itemCount, quoteOrdinal });
    index = replacementStart + quotePrefix.length + listLines.length + 1;
  }

  return { descriptors, markdown: lines.join("\n") };
}

function restoreQuoteListChildren<TBlock>(
  blocks: TBlock[],
  descriptors: QuoteListDescriptor[],
): TBlock[] {
  const restoredBlocks = [...blocks];

  for (const descriptor of descriptors) {
    let quoteCount = 0;
    const quoteIndex = restoredBlocks.findIndex((block) => {
      if (getMarkdownBlockType(block) !== "quote") return false;
      quoteCount += 1;
      return quoteCount === descriptor.quoteOrdinal;
    });
    if (quoteIndex === -1) continue;

    const listBlocks = restoredBlocks.slice(
      quoteIndex + 1,
      quoteIndex + 1 + descriptor.itemCount,
    );
    if (
      listBlocks.length !== descriptor.itemCount ||
      !listBlocks.every(
        (block) => getMarkdownBlockType(block) === "bulletListItem",
      )
    ) {
      continue;
    }

    const quote = restoredBlocks[quoteIndex];
    if (!isRecord(quote)) continue;
    const children = Array.isArray(quote.children) ? quote.children : [];
    restoredBlocks.splice(quoteIndex, descriptor.itemCount + 1, {
      ...quote,
      children: [...children, ...listBlocks],
    } as TBlock);
  }

  return restoredBlocks;
}

function getQuoteListChildren<TBlock>(block: TBlock): TBlock[] | null {
  if (!isRecord(block) || block.type !== "quote") return null;
  if (!Array.isArray(block.children) || block.children.length === 0)
    return null;
  return block.children.every(
    (child) => getMarkdownBlockType(child) === "bulletListItem",
  )
    ? (block.children as TBlock[])
    : null;
}

// BlockNote 序列化非列表父块时会提升其子块，需要手动补回标准引用列表前缀。
async function serializeQuoteListBlocks<TBlock>(
  serializer: MarkdownSerializer<TBlock>,
  blocks: TBlock[],
): Promise<string> {
  if (!blocks.some((block) => getQuoteListChildren(block))) {
    return serializer.blocksToMarkdownLossy(blocks);
  }

  const chunks: string[] = [];
  let pendingBlocks: TBlock[] = [];
  const flushPendingBlocks = async () => {
    if (pendingBlocks.length === 0) return;
    const markdown = await serializer.blocksToMarkdownLossy(pendingBlocks);
    chunks.push(markdown.trimEnd());
    pendingBlocks = [];
  };

  for (const block of blocks) {
    const children = getQuoteListChildren(block);
    if (!children) {
      pendingBlocks.push(block);
      continue;
    }

    await flushPendingBlocks();
    const quote = block as MarkdownTreeBlock;
    const quoteMarkdown = await serializer.blocksToMarkdownLossy([
      { ...quote, children: [] } as TBlock,
    ]);
    const listMarkdown = await serializer.blocksToMarkdownLossy(children);
    const quotedList = listMarkdown
      .trimEnd()
      .split("\n")
      .map((line) => {
        if (!line) return ">";

        // 引用子列表统一使用 Markdown 的短横线模板，同时保留嵌套层级缩进。
        const normalizedLine = line.replace(/^([ \t]*)[-+*]([ \t]+)/u, "$1-$2");
        return `> ${normalizedLine}`;
      })
      .join("\n");
    const quoteContent = isRecord(block) ? getInlineText(block.content) : "";

    // 空父引用仅承担子块容器职责，源码不输出额外的 `>` 占位行。
    chunks.push(
      quoteContent.trim()
        ? `${quoteMarkdown.trimEnd()}\n>\n${quotedList}`
        : quotedList,
    );
  }

  await flushPendingBlocks();
  return `${chunks.join("\n\n")}\n`;
}

export async function parseMarkdown<TBlock>(
  parser: MarkdownParser<TBlock>,
  markdown: string,
  options: MarkdownParseOptions = {},
): Promise<TBlock[]> {
  // 仅规范化传给 BlockNote 的解析副本；原始源码仍用于编辑、比较和保存。
  const repairedMarkdown = repairMarkdownSourceBeforeParse(markdown);
  const protectedMarkup = protectMarkupForParser(repairedMarkdown);
  const parseInput = protectedMarkup.markdown
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
  const normalized = normalizeQuoteListsForParser(parseInput);
  const blocks = await parser.tryParseMarkdownToBlocks(normalized.markdown);
  const restoredBlocks =
    protectedMarkup.replacements.size === 0
      ? blocks
      : restoreProtectedMarkup(
          blocks,
          protectedMarkup.continuationMarker,
          protectedMarkup.replacements,
        );
  return resolveImageBlockUrls(
    restoreQuoteListChildren(restoredBlocks, normalized.descriptors),
    options,
  );
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function serializeMarkdown<TBlock>(
  serializer: MarkdownSerializer<TBlock>,
  blocks: TBlock[],
): Promise<string> {
  // 大文档序列化可能阻塞数百毫秒；让出主线程确保用户交互不被延迟。
  await yieldToMain();
  const markdown = await serializeQuoteListBlocks(serializer, blocks);
  return normalizeSerializedCodeBlockContent(
    normalizeMarkupHardBreaks(markdown),
    blocks,
  );
}
