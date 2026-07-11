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
  const left = new Array<number>(baseline.length + 1);
  const right = new Array<number>(baseline.length + 1);
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

function getClosingFenceMatch(line: string, openingFence: string) {
  const match = line.match(FENCED_CODE_LINE_PATTERN);
  if (!match) return null;
  if (match[1][0] !== openingFence[0]) return null;
  if (match[1].length < openingFence.length) return null;
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
    lines.push({
      ending: sourceLine.ending,
      text: `${sourceItem.indent}${sourceItem.marker}${normalizeListMarkerSpacing(sourceItem.spacing)}${editedItem.content}`,
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
  const sourceLines = splitMarkdownLines(source);
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
    if (!hasJoinedListRunContent(sourceRun, sourceContents, baselineContents)) {
      continue;
    }

    // 历史错误可能把多个列表项保存到同一行；富文本顺序未变时也要把源码拆回多行。
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

function splitJoinedUnorderedListLine(
  line: MarkdownLine,
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
    if (!/\S/u.test(content[markerIndex - 1])) continue;

    segments.push(content.slice(segmentStart, markerIndex));
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

function repairJoinedUnorderedListMarkers(markdown: string): string | null {
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
      : splitJoinedUnorderedListLine(line);
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

function repairMarkdownSourceAfterPreserve(source: string, markdown: string) {
  return normalizeUnorderedListMarkers(
    source,
    repairMarkdownSourceBeforeParse(preserveSourceEnding(source, markdown)),
  );
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

  if (baseline === edited) return preservationSource;

  // 大文档跳过列表重排和跨块移动的多次 splitMarkdownLines 扫描，
  // 直接走字符级或行级的保留路径，避免不必要的 O(n) 开销。
  const isLargeDocument =
    preservationSource.length > LARGE_DOC_LIST_PRESERVE_LIMIT;

  if (!isLargeDocument) {
    const reorderedListSource = preserveReorderedUnorderedLists(
      preservationSource,
      baseline,
      edited,
    );
    if (reorderedListSource !== null) return reorderedListSource;

    const movedListSource = preserveMovedUnorderedListItemsAcrossBlocks(
      preservationSource,
      baseline,
      edited,
    );
    if (movedListSource !== null) return movedListSource;
  }

  if (
    source.length + baseline.length + edited.length >
    SOURCE_PRESERVATION_DIFF_CHAR_LIMIT
  ) {
    // 大文档避免字符级 diff 阻塞输入；保留行级列表标记和文件结尾，正文采用编辑器序列化结果。
    return repairMarkdownSourceAfterPreserve(
      preservationSource,
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
      return edited;
    }
  }

  let result = preservationSource;
  for (const edit of mappedEdits.toReversed()) {
    // 映射异常时回退到编辑器结果，避免生成内容错位或重复。
    if (edit.start < 0 || edit.end < edit.start || edit.end > result.length) {
      return repairMarkdownSourceAfterPreserve(preservationSource, edited);
    }
    result =
      result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  }

  return repairMarkdownSourceAfterPreserve(preservationSource, result);
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

export async function parseMarkdown<TBlock>(
  parser: MarkdownParser<TBlock>,
  markdown: string,
  options: MarkdownParseOptions = {},
): Promise<TBlock[]> {
  // 仅规范化传给 BlockNote 的解析副本；原始源码仍用于编辑、比较和保存。
  const repairedMarkdown = repairMarkdownSourceBeforeParse(markdown);
  const parseInput = repairedMarkdown
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
  const blocks = await parser.tryParseMarkdownToBlocks(parseInput);
  return resolveImageBlockUrls(blocks, options);
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
  return serializer.blocksToMarkdownLossy(blocks);
}
