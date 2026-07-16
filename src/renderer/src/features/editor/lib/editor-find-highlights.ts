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
      '[data-editor-find-ignore], [aria-hidden="true"], .cm-gutters, input, textarea, script, style, noscript',
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
): boolean {
  const registry = getHighlightRegistry();
  const HighlightCtor = getHighlightConstructor();
  if (!registry || !HighlightCtor) return false;

  registry.set(MATCH_HIGHLIGHT_NAME, new HighlightCtor(...ranges));
  const activeRange = ranges[activeIndex];
  if (activeRange) {
    registry.set(ACTIVE_HIGHLIGHT_NAME, new HighlightCtor(activeRange));
  } else {
    registry.delete(ACTIVE_HIGHLIGHT_NAME);
  }
  return true;
}

/**
 * 以只读覆盖层绘制匹配区域，不包裹或改写 ProseMirror 的文本节点，
 * 避免触发编辑器的 DOM 同步，并绕过 Electron 对 CSS Highlight API 的绘制缺陷。
 */
export function renderEditorFindHighlightFallback(
  root: HTMLElement,
  ranges: Range[],
  activeIndex: number,
): () => void {
  const overlay = document.createElement("div");
  overlay.dataset.editorFindHighlightOverlay = "true";
  overlay.setAttribute("aria-hidden", "true");
  // 覆盖层使用视口坐标并挂到 body，避免富文本表面被移动或重排时改变绝对定位的参考系。
  document.body.append(overlay);

  let animationFrame: number | null = null;
  const render = () => {
    animationFrame = null;
    const markers = document.createDocumentFragment();

    ranges.forEach((range, rangeIndex) => {
      for (const rect of Array.from(range.getClientRects())) {
        const marker = document.createElement("div");
        marker.dataset.editorFindHighlight = "true";
        if (rangeIndex === activeIndex) {
          marker.dataset.editorFindHighlightActive = "true";
        }
        // 收紧到字符视觉高度，避免整行底色遮挡代码与正文的层级。
        marker.style.left = `${rect.left - 1}px`;
        marker.style.top = `${rect.top + 2}px`;
        marker.style.width = `${rect.width + 2}px`;
        marker.style.height = `${Math.max(rect.height - 4, 2)}px`;
        markers.append(marker);
      }
    });

    overlay.replaceChildren(markers);
  };
  const scheduleRender = () => {
    if (animationFrame !== null) return;
    animationFrame = requestAnimationFrame(render);
  };

  render();
  // 捕获子滚动容器的滚动，保证富文本和代码块滚动后仍与文字对齐。
  root.addEventListener("scroll", scheduleRender, true);
  window.addEventListener("resize", scheduleRender);
  window.addEventListener("scroll", scheduleRender, true);

  return () => {
    root.removeEventListener("scroll", scheduleRender, true);
    window.removeEventListener("resize", scheduleRender);
    window.removeEventListener("scroll", scheduleRender, true);
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    overlay.remove();
  };
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
