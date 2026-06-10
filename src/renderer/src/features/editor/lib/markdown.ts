import { diffChars, type Change } from "diff";

export interface MarkdownParser<TBlock> {
  tryParseMarkdownToBlocks(markdown: string): Promise<TBlock[]> | TBlock[];
}

export interface MarkdownSerializer<TBlock> {
  blocksToMarkdownLossy(blocks: TBlock[]): Promise<string> | string;
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

export function preserveMarkdownSource(
  source: string,
  baseline: string,
  edited: string,
): string {
  if (baseline === edited) return source;

  const boundaryMap = createSourceBoundaryMap(baseline, source);
  const edits = collectMarkdownEdits(diffChars(baseline, edited));
  const mappedEdits = edits.map((edit) => {
    const oldText = baseline.slice(edit.start, edit.end);
    let start = chooseSourceBoundary(baseline, source, boundaryMap, edit.start);
    let end = chooseSourceBoundary(baseline, source, boundaryMap, edit.end);
    const exactStart = locateExactChangedText(source, oldText, start);

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

  let result = source;
  for (const edit of mappedEdits.reverse()) {
    // 映射异常时回退到编辑器结果，避免生成内容错位或重复。
    if (edit.start < 0 || edit.end < edit.start || edit.end > result.length) {
      return edited;
    }
    result =
      result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  }

  return preserveSourceEnding(source, result);
}

export function ensureEditableBlocks<TBlock>(
  blocks: TBlock[],
  createBlankBlock: () => TBlock,
): TBlock[] {
  return blocks.length > 0 ? blocks : [createBlankBlock()];
}

export async function parseMarkdown<TBlock>(
  parser: MarkdownParser<TBlock>,
  markdown: string,
): Promise<TBlock[]> {
  // 仅规范化传给 BlockNote 的解析副本；原始源码仍用于编辑、比较和保存。
  const parseInput = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  return parser.tryParseMarkdownToBlocks(parseInput);
}

export async function serializeMarkdown<TBlock>(
  serializer: MarkdownSerializer<TBlock>,
  blocks: TBlock[],
): Promise<string> {
  return serializer.blocksToMarkdownLossy(blocks);
}
