import type { FindTextOptions } from "./find-in-file";
import { findTextMatches } from "./find-in-file";

const MATCH_HIGHLIGHT_NAME = "keep-notes-find-match";
const ACTIVE_HIGHLIGHT_NAME = "keep-notes-find-active-match";

interface HighlightConstructor {
  new (...ranges: Range[]): unknown;
}

interface HighlightRegistry {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
}

interface CssWithHighlights extends CSS {
  highlights?: HighlightRegistry;
}

function getHighlightRegistry(): HighlightRegistry | null {
  return ((globalThis.CSS as CssWithHighlights | undefined)?.highlights ??
    null) as HighlightRegistry | null;
}

function getHighlightConstructor(): HighlightConstructor | null {
  return ((globalThis as { Highlight?: HighlightConstructor }).Highlight ??
    null) as HighlightConstructor | null;
}

function shouldSkipTextNode(node: Node): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  return Boolean(
    parent.closest(
      "[data-editor-find-ignore], input, textarea, script, style, noscript",
    ),
  );
}

export function collectEditorFindRanges(
  root: HTMLElement,
  query: string,
  options: FindTextOptions,
): Range[] {
  if (!query) return [];

  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return shouldSkipTextNode(node)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.nodeValue ?? "";
    for (const match of findTextMatches(text, query, options)) {
      const range = document.createRange();
      range.setStart(node, match.start);
      range.setEnd(node, match.end);
      ranges.push(range);
    }
  }

  return ranges;
}

export function clearEditorFindHighlights() {
  const registry = getHighlightRegistry();
  registry?.delete(MATCH_HIGHLIGHT_NAME);
  registry?.delete(ACTIVE_HIGHLIGHT_NAME);
}

export function applyEditorFindHighlights(
  ranges: Range[],
  activeIndex: number,
) {
  const registry = getHighlightRegistry();
  const HighlightCtor = getHighlightConstructor();
  if (!registry || !HighlightCtor) return;

  registry.set(MATCH_HIGHLIGHT_NAME, new HighlightCtor(...ranges));
  const activeRange = ranges[activeIndex];
  if (activeRange) {
    registry.set(ACTIVE_HIGHLIGHT_NAME, new HighlightCtor(activeRange));
  } else {
    registry.delete(ACTIVE_HIGHLIGHT_NAME);
  }
}

export function scrollRangeIntoView(range: Range | undefined) {
  if (!range) return;

  const parent =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  parent?.scrollIntoView({ block: "center", inline: "nearest" });
}

export function selectEditorFindRanges(ranges: Range[]) {
  if (ranges.length === 0) return;

  const selection = window.getSelection();
  if (!selection) return;

  selection.removeAllRanges();
  for (const range of ranges) {
    selection.addRange(range);
  }
  scrollRangeIntoView(ranges[0]);
}
