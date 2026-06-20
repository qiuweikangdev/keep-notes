import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefCallback,
} from "react";
import { TextSelection } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Search,
} from "lucide-react";

import {
  getCodeBlockLanguageLabel,
  getCodeBlockLanguageShortLabel,
  getSupportedCodeBlockLanguageId,
  searchCodeBlockLanguages,
} from "../lib/editor-code-block-languages";

interface EditorCodeBlockBlock {
  id: string;
  props?: {
    language?: string;
  };
}

interface EditorCodeBlockEditor {
  updateBlock: (
    id: string,
    update: {
      props: {
        language: string;
      };
    },
  ) => void;
  prosemirrorView?: {
    state: {
      doc: ProseMirrorNode;
      tr: {
        setMeta: (key: string, value: unknown) => unknown;
        setSelection?: (selection: TextSelection) => {
          scrollIntoView?: () => unknown;
        };
      };
    };
    dispatch: (transaction: unknown) => void;
    focus?: () => void;
    posAtDOM?: (node: Node, offset: number) => number;
  };
}

interface EditorCodeBlockProps {
  block: EditorCodeBlockBlock;
  editor: EditorCodeBlockEditor;
  contentRef?: RefCallback<HTMLElement>;
}

export interface CodeBlockFoldRange {
  startLine: number;
  endLine: number;
}

export interface CodeBlockVisibleLine {
  lineNumber: number;
  text: string;
  foldedRange?: CodeBlockFoldRange;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function serializeElementAttributes(element: Element): string {
  const attributes = Array.from(element.attributes)
    .filter(
      (attribute) =>
        ["class", "style"].includes(attribute.name) ||
        attribute.name.startsWith("data-") ||
        attribute.name.startsWith("aria-"),
    )
    .map((attribute) => ` ${attribute.name}="${escapeHtml(attribute.value)}"`);

  return attributes.join("");
}

function wrapHighlightedText(text: string, ancestors: Element[]): string {
  let html = escapeHtml(text);
  const inlineAncestors = ancestors.filter(
    (element) => element.tagName.toLowerCase() === "span",
  );

  for (let index = inlineAncestors.length - 1; index >= 0; index -= 1) {
    const element = inlineAncestors[index];
    const tagName = element.tagName.toLowerCase();
    html = `<${tagName}${serializeElementAttributes(element)}>${html}</${tagName}>`;
  }

  return html;
}

export function getHighlightedCodeBlockLineHtml(
  element: HTMLElement | null,
  codeText: string,
): string[] {
  const fallbackLines = codeText.split("\n").map(escapeHtml);
  if (!element) return fallbackLines.length > 0 ? fallbackLines : [""];

  const lineHtml: string[] = [""];

  const appendText = (text: string, ancestors: Element[]) => {
    const parts = text.split("\n");

    parts.forEach((part, index) => {
      if (index > 0) {
        lineHtml.push("");
      }
      if (!part) return;

      lineHtml[lineHtml.length - 1] += wrapHighlightedText(part, ancestors);
    });
  };

  const visitNode = (node: Node, ancestors: Element[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.textContent ?? "", ancestors);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const elementNode = node as Element;
    const nextAncestors = [...ancestors, elementNode];

    node.childNodes.forEach((childNode) => visitNode(childNode, nextAncestors));
  };

  element.childNodes.forEach((node) => visitNode(node, []));

  return lineHtml.length > 0 ? lineHtml : fallbackLines;
}

export function getCodeBlockLineNumbers(codeText: string): number[] {
  const lineCount = Math.max(1, codeText.split("\n").length);

  return Array.from({ length: lineCount }, (_, index) => index + 1);
}

function getIndentSize(line: string): number {
  let size = 0;

  for (const character of line) {
    if (character === " ") {
      size += 1;
      continue;
    }
    if (character === "\t") {
      size += 2;
      continue;
    }
    break;
  }

  return size;
}

function stripFoldIgnoredSyntax(line: string): string {
  let result = "";
  let quote: "'" | '"' | "`" | null = null;
  let isEscaped = false;

  // 折叠范围只关心结构符号，先忽略字符串和行内注释中的括号。
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (quote) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }
      if (character === "\\") {
        isEscaped = true;
        continue;
      }
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === "/" && nextCharacter === "/") break;
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }

    result += character;
  }

  return result;
}

function collectBraceFoldRanges(lines: string[]): CodeBlockFoldRange[] {
  const ranges: CodeBlockFoldRange[] = [];
  const stack: Array<{ open: string; lineNumber: number }> = [];
  const closingToOpening: Record<string, string> = {
    ")": "(",
    "]": "[",
    "}": "{",
  };
  const openingBraces = new Set(["(", "[", "{"]);

  // 用栈匹配跨行括号，让函数、类、对象、数组等同作用域块都能折叠。
  lines.forEach((line, lineIndex) => {
    const lineNumber = lineIndex + 1;
    const foldableCode = stripFoldIgnoredSyntax(line);

    for (const character of foldableCode) {
      if (openingBraces.has(character)) {
        stack.push({ open: character, lineNumber });
        continue;
      }

      const expectedOpen = closingToOpening[character];
      if (!expectedOpen) continue;

      const stackIndex = stack.findLastIndex(
        (entry) => entry.open === expectedOpen,
      );
      if (stackIndex === -1) continue;

      const [entry] = stack.splice(stackIndex, 1);
      if (lineNumber > entry.lineNumber) {
        ranges.push({
          startLine: entry.lineNumber,
          endLine: lineNumber,
        });
      }
    }
  });

  return ranges;
}

function collectIndentFoldRanges(lines: string[]): CodeBlockFoldRange[] {
  const ranges: CodeBlockFoldRange[] = [];

  // 兼容 Python/YAML 等缩进型语言：下一段缩进更深时认为当前行开启了作用域。
  for (let lineIndex = 0; lineIndex < lines.length - 1; lineIndex += 1) {
    if (!lines[lineIndex].trim()) continue;

    const currentIndent = getIndentSize(lines[lineIndex]);
    let nextLineIndex = lineIndex + 1;
    while (nextLineIndex < lines.length && !lines[nextLineIndex].trim()) {
      nextLineIndex += 1;
    }
    if (nextLineIndex >= lines.length) break;

    const nextIndent = getIndentSize(lines[nextLineIndex]);
    if (nextIndent <= currentIndent) continue;

    let endLineIndex = nextLineIndex;
    for (
      let candidateIndex = nextLineIndex + 1;
      candidateIndex < lines.length;
      candidateIndex += 1
    ) {
      if (!lines[candidateIndex].trim()) {
        endLineIndex = candidateIndex;
        continue;
      }
      if (getIndentSize(lines[candidateIndex]) <= currentIndent) break;
      endLineIndex = candidateIndex;
    }

    ranges.push({
      startLine: lineIndex + 1,
      endLine: endLineIndex + 1,
    });
  }

  return ranges;
}

export function getCodeBlockFoldRanges(codeText: string): CodeBlockFoldRange[] {
  const lines = codeText.split("\n");
  const widestRangeByStartLine = new Map<number, CodeBlockFoldRange>();

  for (const range of [
    ...collectBraceFoldRanges(lines),
    ...collectIndentFoldRanges(lines),
  ]) {
    if (range.endLine <= range.startLine) continue;

    const existingRange = widestRangeByStartLine.get(range.startLine);
    if (!existingRange || range.endLine > existingRange.endLine) {
      widestRangeByStartLine.set(range.startLine, range);
    }
  }

  return [...widestRangeByStartLine.values()].sort(
    (left, right) =>
      left.startLine - right.startLine || right.endLine - left.endLine,
  );
}

export function getCodeBlockVisibleLines(
  codeText: string,
  foldedStartLines: Iterable<number>,
): CodeBlockVisibleLine[] {
  const lines = codeText.split("\n");
  const foldedStartLineSet = new Set(foldedStartLines);
  const foldRangeByStartLine = new Map(
    getCodeBlockFoldRanges(codeText).map((range) => [range.startLine, range]),
  );
  const visibleLines: CodeBlockVisibleLine[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineNumber = lineIndex + 1;
    const foldedRange = foldRangeByStartLine.get(lineNumber);

    if (foldedRange && foldedStartLineSet.has(lineNumber)) {
      visibleLines.push({
        lineNumber,
        text: lines[lineIndex],
        foldedRange,
      });
      lineIndex = foldedRange.endLine - 1;
      continue;
    }

    visibleLines.push({
      lineNumber,
      text: lines[lineIndex],
    });
  }

  return visibleLines.length > 0 ? visibleLines : [{ lineNumber: 1, text: "" }];
}

export function readCodeBlockText(element: HTMLElement | null): string {
  return element?.textContent ?? "";
}

type EditorCodeBlockProseMirrorView = NonNullable<
  EditorCodeBlockEditor["prosemirrorView"]
>;

function getTextNodeBoundary(
  element: HTMLElement,
  direction: "start" | "end",
): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let boundaryNode: Text | null = null;

  for (
    let currentNode = walker.nextNode() as Text | null;
    currentNode;
    currentNode = walker.nextNode() as Text | null
  ) {
    if (direction === "start") {
      return { node: currentNode, offset: 0 };
    }
    boundaryNode = currentNode;
  }

  if (!boundaryNode) return null;

  return {
    node: boundaryNode,
    offset: boundaryNode.textContent?.length ?? 0,
  };
}

export function selectCodeBlockContent(
  element: HTMLElement | null,
  view?: EditorCodeBlockProseMirrorView,
): boolean {
  const selection = window.getSelection?.();
  if (!element || !selection) return false;

  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);

  if (view?.posAtDOM && view.state.tr.setSelection) {
    try {
      const startBoundary = getTextNodeBoundary(element, "start");
      const endBoundary = getTextNodeBoundary(element, "end");
      const from = startBoundary
        ? view.posAtDOM(startBoundary.node, startBoundary.offset)
        : view.posAtDOM(element, 0);
      const to = endBoundary
        ? view.posAtDOM(endBoundary.node, endBoundary.offset)
        : view.posAtDOM(element, element.childNodes.length);
      const textSelection = TextSelection.create(
        view.state.doc,
        Math.min(from, to),
        Math.max(from, to),
      );
      const transaction = view.state.tr.setSelection(textSelection);
      view.dispatch(transaction.scrollIntoView?.() ?? transaction);
      view.focus?.();
    } catch {
      // DOM Selection 已经生效；ProseMirror 位置映射失败时不阻断用户的全选反馈。
    }
  }

  return true;
}

function isCodeBlockSelectAllShortcut(event: ReactKeyboardEvent<HTMLElement>) {
  return (
    event.key.toLowerCase() === "a" &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey
  );
}

function isSelectionInsideElement(element: HTMLElement): boolean {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0) return false;

  const { anchorNode, focusNode } = selection;

  return (
    (!anchorNode || element.contains(anchorNode)) &&
    (!focusNode || element.contains(focusNode))
  );
}

export function refreshCodeBlockHighlighting(editor: EditorCodeBlockEditor) {
  const view = editor.prosemirrorView;
  if (!view) return;

  view.dispatch(view.state.tr.setMeta("prosemirror-highlight-refresh", true));
}

export function EditorCodeBlock({
  block,
  editor,
  contentRef,
}: EditorCodeBlockProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState(false);
  const [languageQuery, setLanguageQuery] = useState("");
  const [lineNumbers, setLineNumbers] = useState(() =>
    getCodeBlockLineNumbers(""),
  );
  const [codeText, setCodeText] = useState("");
  const [highlightRevision, setHighlightRevision] = useState(0);
  const [foldedStartLines, setFoldedStartLines] = useState<Set<number>>(
    () => new Set(),
  );
  const [isCopied, setIsCopied] = useState(false);

  const language = getSupportedCodeBlockLanguageId(
    block.props?.language ?? "text",
  );
  const languageLabel = getCodeBlockLanguageLabel(language);
  const languageShortLabel = getCodeBlockLanguageShortLabel(language);
  const languageOptions = useMemo(
    () => searchCodeBlockLanguages(languageQuery),
    [languageQuery],
  );
  const foldRanges = useMemo(
    () => getCodeBlockFoldRanges(codeText),
    [codeText],
  );
  const foldRangeByStartLine = useMemo(
    () => new Map(foldRanges.map((range) => [range.startLine, range])),
    [foldRanges],
  );
  const visibleLines = useMemo(
    () => getCodeBlockVisibleLines(codeText, foldedStartLines),
    [codeText, foldedStartLines],
  );
  const highlightedLineHtml = useMemo(
    () => getHighlightedCodeBlockLineHtml(codeRef.current, codeText),
    [codeText, highlightRevision],
  );
  const hasFoldedLines = visibleLines.some((line) => line.foldedRange);
  const displayedLineNumbers = hasFoldedLines
    ? visibleLines.map((line) => line.lineNumber)
    : lineNumbers;

  const updateLineNumbers = useCallback(() => {
    const nextCodeText = readCodeBlockText(codeRef.current);

    setCodeText(nextCodeText);
    setLineNumbers(getCodeBlockLineNumbers(nextCodeText));
    setHighlightRevision((revision) => revision + 1);
  }, []);

  const setCodeElement = useCallback(
    (element: HTMLElement | null) => {
      codeRef.current = element;
      contentRef?.(element);
      updateLineNumbers();
    },
    [contentRef, updateLineNumbers],
  );

  useEffect(() => {
    const codeElement = codeRef.current;
    if (!codeElement || typeof MutationObserver === "undefined") return;

    // 监听 BlockNote 写入的真实文本变化，保证行号与编辑内容同步。
    const observer = new MutationObserver(updateLineNumbers);
    observer.observe(codeElement, {
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [updateLineNumbers]);

  useEffect(() => {
    // Shiki 首次加载是异步的，触发空事务让 ProseMirror 重新计算高亮 decoration。
    const animationFrame = window.requestAnimationFrame(() =>
      refreshCodeBlockHighlighting(editor),
    );
    const delayedRefreshes = [180, 600, 1200].map((delay) =>
      window.setTimeout(() => refreshCodeBlockHighlighting(editor), delay),
    );

    return () => {
      window.cancelAnimationFrame(animationFrame);
      delayedRefreshes.forEach((timer) => window.clearTimeout(timer));
    };
  }, [editor, language]);

  useEffect(() => {
    if (!isLanguagePickerOpen) return;

    searchInputRef.current?.focus();
  }, [isLanguagePickerOpen]);

  useEffect(() => {
    if (!isCopied) return;

    const timer = window.setTimeout(() => setIsCopied(false), 1200);

    return () => window.clearTimeout(timer);
  }, [isCopied]);

  useEffect(() => {
    if (!isLanguagePickerOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setIsLanguagePickerOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isLanguagePickerOpen]);

  useEffect(() => {
    const validStartLines = new Set(foldRanges.map((range) => range.startLine));

    setFoldedStartLines((currentStartLines) => {
      const nextStartLines = new Set<number>();

      for (const startLine of currentStartLines) {
        if (validStartLines.has(startLine)) {
          nextStartLines.add(startLine);
        }
      }

      return nextStartLines.size === currentStartLines.size
        ? currentStartLines
        : nextStartLines;
    });
  }, [foldRanges]);

  const handleLanguageSelect = (nextLanguage: string) => {
    editor.updateBlock(block.id, {
      props: { language: nextLanguage },
    });
    setIsLanguagePickerOpen(false);
    setLanguageQuery("");
  };

  const handleCopy = async () => {
    try {
      const writeText = navigator.clipboard?.writeText;
      if (!writeText) return;

      await writeText.call(
        navigator.clipboard,
        readCodeBlockText(codeRef.current),
      );
      setIsCopied(true);
    } catch {
      setIsCopied(false);
    }
  };

  const handleFoldToggle = (lineNumber: number) => {
    setFoldedStartLines((currentStartLines) => {
      const nextStartLines = new Set(currentStartLines);

      if (nextStartLines.has(lineNumber)) {
        nextStartLines.delete(lineNumber);
      } else {
        nextStartLines.add(lineNumber);
      }

      return nextStartLines;
    });
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isCodeBlockSelectAllShortcut(event)) return;

    const codeElement = codeRef.current;
    const eventTarget = event.target instanceof Node ? event.target : null;
    if (
      !codeElement ||
      ((!eventTarget || !codeElement.contains(eventTarget)) &&
        !isSelectionInsideElement(codeElement))
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    selectCodeBlockContent(codeElement, editor.prosemirrorView);
  };

  return (
    <div
      ref={rootRef}
      className="editor-code-block-shell editor-code-block relative rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)]"
      onKeyDown={handleKeyDown}
    >
      <div
        contentEditable={false}
        className="editor-code-block__toolbar flex items-center justify-between gap-2 border-b border-[var(--border-color)] px-2 py-1"
      >
        <div className="relative">
          <button
            type="button"
            aria-expanded={isLanguagePickerOpen}
            aria-haspopup="dialog"
            aria-label="Change code language"
            className="editor-code-block-language-trigger editor-code-block__language-button inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--button-hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-color)]"
            onClick={() => setIsLanguagePickerOpen((isOpen) => !isOpen)}
          >
            <span>{languageShortLabel}</span>
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {isLanguagePickerOpen ? (
            <div
              role="dialog"
              aria-label="Code language"
              className="editor-code-block-language-popover editor-code-block__language-dialog absolute left-0 top-8 z-50 w-64 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] p-2 shadow-xl"
            >
              <label className="editor-code-block__search-label flex h-8 items-center gap-2 rounded border border-[var(--border-color)] px-2 text-[var(--text-muted)]">
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                <input
                  ref={searchInputRef}
                  type="search"
                  aria-label="Search code language"
                  value={languageQuery}
                  className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                  placeholder="Search language"
                  onChange={(event) => setLanguageQuery(event.target.value)}
                />
              </label>

              <div
                role="listbox"
                aria-label="Code language options"
                className="editor-code-block__language-options mt-2 max-h-64 overflow-y-auto"
              >
                {languageOptions.length > 0 ? (
                  languageOptions.map((option) => {
                    const isSelected = option.id === language;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        className="editor-code-block__language-option flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--button-hover-bg)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-color)]"
                        onClick={() => handleLanguageSelect(option.id)}
                      >
                        <span>{option.label}</span>
                        {isSelected ? (
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : null}
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
          aria-label="Copy code"
          className="editor-code-block-copy editor-code-block__copy-button inline-flex h-7 items-center justify-center rounded text-xs text-[var(--text-secondary)] hover:bg-[var(--button-hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-color)]"
          onClick={handleCopy}
        >
          {isCopied ? (
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      <div className="editor-code-block__body grid grid-cols-[auto_1fr]">
        <div
          contentEditable={false}
          className="editor-code-block-gutter editor-code-block__line-gutter select-none px-3 py-2 text-right font-mono text-xs leading-6 text-[var(--text-muted)]"
        >
          {displayedLineNumbers.map((lineNumber) => {
            const foldRange = foldRangeByStartLine.get(lineNumber);
            const isFolded = foldedStartLines.has(lineNumber);

            return (
              <div key={lineNumber} className="editor-code-block__line-number">
                {foldRange ? (
                  <button
                    type="button"
                    aria-expanded={!isFolded}
                    aria-label={`${
                      isFolded ? "Expand" : "Fold"
                    } code block from line ${foldRange.startLine} to ${
                      foldRange.endLine
                    }`}
                    className="editor-code-block__fold-toggle"
                    onClick={() => handleFoldToggle(lineNumber)}
                  >
                    {isFolded ? (
                      <ChevronRight className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-3 w-3" aria-hidden="true" />
                    )}
                  </button>
                ) : (
                  <span className="editor-code-block__fold-spacer" />
                )}
                <span aria-hidden="true">{lineNumber}</span>
              </div>
            );
          })}
        </div>

        <pre className="editor-code-block__pre m-0 overflow-x-auto p-2">
          <code
            ref={setCodeElement}
            data-testid="editor-code-block-content"
            data-language={language}
            className={`editor-code-block__content language-${language}${
              hasFoldedLines ? " editor-code-block__content--source-hidden" : ""
            }`}
            aria-label={`${languageLabel} code`}
          />

          {hasFoldedLines ? (
            <code
              contentEditable={false}
              className="editor-code-block__fold-preview"
              aria-label={`${languageLabel} folded code preview`}
            >
              {visibleLines.map((line, index) => (
                <span
                  key={line.lineNumber}
                  className="editor-code-block__fold-preview-line"
                >
                  <span
                    className="editor-code-block__fold-preview-code"
                    dangerouslySetInnerHTML={{
                      __html:
                        highlightedLineHtml[line.lineNumber - 1] ??
                        escapeHtml(line.text),
                    }}
                  />
                  {line.foldedRange ? (
                    <span
                      contentEditable={false}
                      aria-label={`${
                        line.foldedRange.endLine - line.foldedRange.startLine
                      } folded lines`}
                      className="editor-code-block__fold-placeholder"
                    >
                      ...
                    </span>
                  ) : null}
                  {index < visibleLines.length - 1 ? "\n" : null}
                </span>
              ))}
            </code>
          ) : null}
        </pre>
      </div>
    </div>
  );
}
