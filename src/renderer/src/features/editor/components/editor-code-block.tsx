import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefCallback,
} from "react";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  codeFolding,
  foldEffect,
  foldGutter,
  foldKeymap,
  foldService,
  foldable,
  foldedRanges,
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
  unfoldEffect,
} from "@codemirror/language";
import {
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  type Extension,
} from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type BlockInfo,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { TextSelection } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Check, ChevronDown, Clipboard, Search } from "lucide-react";

import {
  getCodeBlockLanguageLabel,
  getCodeBlockLanguageShortLabel,
  getSupportedCodeBlockLanguageId,
  searchCodeBlockLanguages,
} from "../lib/editor-code-block-languages";
import { getCodeBlockFoldRanges } from "../lib/editor-code-folding";
export type {
  CodeBlockFoldRange,
  CodeBlockVisibleLine,
} from "../lib/editor-code-folding";
export {
  getCodeBlockFoldRanges,
  getCodeBlockVisibleLines,
} from "../lib/editor-code-folding";

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
      props?: {
        language: string;
      };
      content?: string;
    },
  ) => void;
  removeBlocks?: (ids: string[]) => void;
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
    root?: Document | ShadowRoot;
  };
}

interface EditorCodeBlockProps {
  block: EditorCodeBlockBlock;
  editor: EditorCodeBlockEditor;
  contentRef?: RefCallback<HTMLElement>;
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

function getLeadingWhitespace(value: string): string {
  return value.match(/^[\t ]*/)?.[0] ?? "";
}

function getVisibleLeadingWhitespaceFromHtml(value: string): string {
  let indent = "";

  // 高亮后的 HTML 可能把行首空格包进 span，比较缩进时需要跳过标签本身。
  for (let index = 0; index < value.length; ) {
    const character = value[index];

    if (character === "<") {
      const closeIndex = value.indexOf(">", index + 1);
      if (closeIndex === -1) break;
      index = closeIndex + 1;
      continue;
    }

    if (character === " " || character === "\t") {
      indent += character;
      index += 1;
      continue;
    }

    if (value.startsWith("&nbsp;", index)) {
      indent += " ";
      index += "&nbsp;".length;
      continue;
    }

    break;
  }

  return indent;
}

function restoreSourceLineIndentation(sourceLine: string, lineHtml: string) {
  const sourceIndent = getLeadingWhitespace(sourceLine);
  if (!sourceIndent) return lineHtml;

  const htmlIndent = getVisibleLeadingWhitespaceFromHtml(lineHtml);
  if (sourceIndent.startsWith(htmlIndent)) {
    return `${escapeHtml(sourceIndent.slice(htmlIndent.length))}${lineHtml}`;
  }

  return lineHtml;
}

function getCodeMirrorLanguageExtension(language: string): Extension {
  switch (language) {
    case "javascript":
      return javascript();
    case "typescript":
      return javascript({ typescript: true });
    case "jsx":
      return javascript({ jsx: true });
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "json":
      return json();
    case "html":
    case "xml":
    case "vue":
      return html();
    case "css":
    case "scss":
      return css();
    case "markdown":
      return markdown();
    default:
      return [];
  }
}

const editorCodeMirrorTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--editor-code-block-bg)",
    color: "var(--editor-code-block-text)",
    fontSize: "0.88em",
  },
  ".cm-scroller": {
    fontFamily: '"SF Mono", "Fira Code", Consolas, "Courier New", monospace',
    lineHeight: "1.6rem",
  },
  ".cm-content": {
    fontWeight: "600",
    minWidth: "max-content",
    padding: "0.5rem 0.5rem 0.5rem 0",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-gutters": {
    backgroundColor: "var(--editor-code-block-bg)",
    borderRight: "0",
    color: "var(--editor-code-block-muted)",
    padding: "0.5rem 0.25rem 0.5rem 0.75rem",
  },
  ".cm-gutterElement": {
    minHeight: "1.6rem",
    padding: "0 0.35rem 0 0",
  },
  ".cm-foldGutter .cm-gutterElement": {
    cursor: "pointer",
    minWidth: "0.85rem",
    paddingRight: "0.15rem",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-cursor": {
    borderLeftColor: "var(--accent-color)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--accent-color) 26%, transparent)",
  },
  "&.cm-focused": {
    outline: "none",
  },
});

const editorCodeMirrorHighlightStyle = HighlightStyle.define([
  {
    tag: [
      t.keyword,
      t.controlKeyword,
      t.definitionKeyword,
      t.moduleKeyword,
      t.modifier,
      t.operatorKeyword,
      t.atom,
      t.null,
      t.bool,
    ],
    color: "var(--editor-code-token-keyword)",
    fontWeight: "700",
  },
  {
    tag: [t.string, t.character, t.attributeValue, t.docString],
    color: "var(--editor-code-token-string)",
    fontWeight: "700",
  },
  {
    tag: [t.number, t.integer, t.float, t.literal],
    color: "var(--editor-code-token-number)",
    fontWeight: "700",
  },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName)],
    color: "var(--editor-code-token-function)",
    fontWeight: "700",
  },
  {
    tag: [t.className, t.typeName, t.namespace],
    color: "var(--editor-code-token-type)",
    fontWeight: "700",
  },
  {
    tag: [t.tagName, t.variableName],
    color: "var(--editor-code-token-variable)",
    fontWeight: "700",
  },
  {
    tag: [t.propertyName, t.attributeName, t.labelName],
    color: "var(--editor-code-token-property)",
    fontWeight: "700",
  },
  {
    tag: [
      t.operator,
      t.arithmeticOperator,
      t.compareOperator,
      t.logicOperator,
      t.definitionOperator,
      t.separator,
      t.punctuation,
    ],
    color: "var(--editor-code-token-operator)",
  },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
    color: "var(--editor-code-token-comment)",
    fontStyle: "italic",
  },
  {
    tag: [t.heading, t.strong],
    color: "var(--editor-code-token-heading)",
    fontWeight: "700",
  },
  {
    tag: [t.link, t.url],
    color: "var(--editor-code-token-link)",
  },
]);

function stopCodeMirrorEvent(event: Event) {
  event.stopPropagation();

  return false;
}

function handleCodeMirrorKeyDown(event: KeyboardEvent, view: EditorView) {
  if (event.key.toLowerCase() === "a" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    event.stopPropagation();
    view.dispatch({
      selection: EditorSelection.range(0, view.state.doc.length),
      scrollIntoView: true,
    });

    return true;
  }

  return stopCodeMirrorEvent(event);
}

function isCodeMirrorEmptyAtStart(view: EditorView) {
  const selection = view.state.selection.main;

  return (
    view.state.doc.lines === 1 &&
    selection.empty &&
    selection.anchor === 0 &&
    view.state.doc.line(1).text.length === 0
  );
}

const codeMirrorFallbackFoldRangeCache = new WeakMap<
  object,
  Map<number, { from: number; to: number }>
>();

function getCodeMirrorFallbackFoldRanges(state: EditorState) {
  const cachedRanges = codeMirrorFallbackFoldRangeCache.get(state.doc);
  if (cachedRanges) return cachedRanges;

  const rangesByStartPosition = new Map<number, { from: number; to: number }>();

  for (const range of getCodeBlockFoldRanges(state.doc.toString())) {
    const startLine = state.doc.line(range.startLine);
    const endLine = state.doc.line(range.endLine);
    const foldRange = {
      from: startLine.to,
      to: endLine.to,
    };

    if (foldRange.to > foldRange.from) {
      rangesByStartPosition.set(startLine.from, foldRange);
    }
  }

  codeMirrorFallbackFoldRangeCache.set(state.doc, rangesByStartPosition);

  return rangesByStartPosition;
}

function getCodeMirrorFallbackFoldRange(state: EditorState, lineStart: number) {
  return getCodeMirrorFallbackFoldRanges(state).get(lineStart) ?? null;
}

function getFoldedCodeMirrorRangeAtLine(view: EditorView, line: BlockInfo) {
  let foldedRange: { from: number; to: number } | null = null;

  foldedRanges(view.state).between(line.from, line.to, (from, to) => {
    foldedRange = { from, to };
  });

  return foldedRange;
}

function toggleCodeMirrorFoldAtLine(
  view: EditorView,
  line: BlockInfo,
  event: Event,
) {
  event.preventDefault();
  event.stopPropagation();

  const foldedRange = getFoldedCodeMirrorRangeAtLine(view, line);
  if (foldedRange) {
    view.dispatch({
      effects: unfoldEffect.of(foldedRange),
    });

    return true;
  }

  const foldRange = foldable(view.state, line.from, line.to);
  if (foldRange) {
    view.dispatch({
      effects: foldEffect.of(foldRange),
    });
  }

  return true;
}

const editorCodeMirrorDomEventHandlers = EditorView.domEventHandlers({
  click: stopCodeMirrorEvent,
  keydown: handleCodeMirrorKeyDown,
  mousedown: stopCodeMirrorEvent,
  pointerdown: stopCodeMirrorEvent,
});

const editorCodeMirrorFoldGutterHandlers = {
  click: (view: EditorView, line: BlockInfo, event: Event) =>
    toggleCodeMirrorFoldAtLine(view, line, event),
  mousedown: (_view: EditorView, _line: unknown, event: Event) =>
    stopCodeMirrorEvent(event),
  pointerdown: (_view: EditorView, _line: unknown, event: Event) =>
    stopCodeMirrorEvent(event),
};

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

  if (lineHtml.length === 0) return fallbackLines;

  // 折叠预览必须以原始代码文本为准补齐行首缩进，避免高亮 DOM 漏掉空白时造成视觉“自动缩进”。
  return codeText.split("\n").map((sourceLine, index) => {
    const highlightedLine = lineHtml[index] ?? "";
    if (!highlightedLine && sourceLine) return escapeHtml(sourceLine);

    return restoreSourceLineIndentation(sourceLine, highlightedLine);
  });
}

export function getCodeBlockLineNumbers(codeText: string): number[] {
  const lineCount = Math.max(1, codeText.split("\n").length);

  return Array.from({ length: lineCount }, (_, index) => index + 1);
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

function isCodeBlockBackspaceShortcut(event: ReactKeyboardEvent<HTMLElement>) {
  return (
    event.key === "Backspace" &&
    !event.metaKey &&
    !event.ctrlKey &&
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
  const codeMirrorViewRef = useRef<EditorView | null>(null);
  const codeMirrorLanguageRef = useRef(new Compartment());
  const isSyncingFromCodeMirrorRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [codeMirrorHost, setCodeMirrorHost] = useState<HTMLDivElement | null>(
    null,
  );
  const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState(false);
  const [languageQuery, setLanguageQuery] = useState("");
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

  const syncCodeMirrorDocument = useCallback((nextCodeText: string) => {
    const view = codeMirrorViewRef.current;
    if (!view || view.state.doc.toString() === nextCodeText) return;

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: nextCodeText,
      },
    });
  }, []);

  const syncContentHostToCodeMirror = useCallback(() => {
    const nextCodeText = readCodeBlockText(codeRef.current);

    if (!isSyncingFromCodeMirrorRef.current) {
      syncCodeMirrorDocument(nextCodeText);
    }
  }, [syncCodeMirrorDocument]);

  const setCodeElement = useCallback(
    (element: HTMLElement | null) => {
      codeRef.current = element;
      contentRef?.(element);
      syncContentHostToCodeMirror();
    },
    [contentRef, syncContentHostToCodeMirror],
  );

  useEffect(() => {
    const codeElement = codeRef.current;
    if (!codeElement || typeof MutationObserver === "undefined") return;

    // 监听 BlockNote 写入的真实文本变化，保证 CodeMirror 与持久化内容同步。
    const observer = new MutationObserver(syncContentHostToCodeMirror);
    observer.observe(codeElement, {
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [syncContentHostToCodeMirror]);

  useEffect(() => {
    if (!codeMirrorHost || codeMirrorViewRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;

      const nextCodeText = update.state.doc.toString();
      const codeElement = codeRef.current;

      // CodeMirror 是可见编辑器；隐藏 content host 只负责让 BlockNote/Markdown 保存链路继续拿到代码文本。
      isSyncingFromCodeMirrorRef.current = true;
      if (codeElement && codeElement.textContent !== nextCodeText) {
        codeElement.textContent = nextCodeText;
      }
      window.queueMicrotask(() => {
        isSyncingFromCodeMirrorRef.current = false;
      });

      editor.updateBlock(block.id, { content: nextCodeText });
    });

    const view = new EditorView({
      parent: codeMirrorHost,
      root: editor.prosemirrorView?.root,
      state: EditorState.create({
        doc: readCodeBlockText(codeRef.current),
        extensions: [
          Prec.highest(
            keymap.of([
              {
                key: "Backspace",
                run: (view) => {
                  if (!isCodeMirrorEmptyAtStart(view)) return false;
                  if (!editor.removeBlocks) return false;

                  // 代码内容已经删空后，再按一次退格，交给 BlockNote 删除整个代码块。
                  editor.removeBlocks([block.id]);

                  return true;
                },
              },
              {
                key: "Mod-a",
                run: (view) => {
                  view.dispatch({
                    selection: EditorSelection.range(0, view.state.doc.length),
                    scrollIntoView: true,
                  });

                  return true;
                },
              },
            ]),
          ),
          lineNumbers(),
          foldGutter({
            domEventHandlers: editorCodeMirrorFoldGutterHandlers,
          }),
          foldService.of(getCodeMirrorFallbackFoldRange),
          codeFolding(),
          history(),
          drawSelection(),
          dropCursor(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          bracketMatching(),
          syntaxHighlighting(editorCodeMirrorHighlightStyle, {
            fallback: true,
          }),
          indentUnit.of("  "),
          EditorState.tabSize.of(2),
          editorCodeMirrorTheme,
          editorCodeMirrorDomEventHandlers,
          codeMirrorLanguageRef.current.of(
            getCodeMirrorLanguageExtension(language),
          ),
          keymap.of([
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
            ...foldKeymap,
          ]),
          updateListener,
        ],
      }),
    });
    codeMirrorViewRef.current = view;

    return () => {
      view.destroy();
      codeMirrorViewRef.current = null;
    };
  }, [codeMirrorHost]);

  useLayoutEffect(() => {
    if (!codeMirrorHost) return;

    const handleNativeKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "a" ||
        (!event.metaKey && !event.ctrlKey) ||
        event.altKey
      ) {
        return;
      }

      const view = codeMirrorViewRef.current;
      if (!view) return;

      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        selection: EditorSelection.range(0, view.state.doc.length),
        scrollIntoView: true,
      });
    };

    codeMirrorHost.addEventListener("keydown", handleNativeKeyDown, true);

    return () =>
      codeMirrorHost.removeEventListener("keydown", handleNativeKeyDown, true);
  }, [codeMirrorHost]);

  useEffect(() => {
    const view = codeMirrorViewRef.current;
    if (!view) return;

    view.dispatch({
      effects: codeMirrorLanguageRef.current.reconfigure(
        getCodeMirrorLanguageExtension(language),
      ),
    });
  }, [language]);

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
        codeMirrorViewRef.current?.state.doc.toString() ??
          readCodeBlockText(codeRef.current),
      );
      setIsCopied(true);
    } catch {
      setIsCopied(false);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isCodeBlockBackspaceShortcut(event)) {
      const eventTarget = event.target instanceof Element ? event.target : null;
      if (eventTarget?.closest(".editor-code-block-language-popover")) return;
      if (eventTarget?.closest(".editor-code-block__codemirror")) return;

      const view = codeMirrorViewRef.current;
      if (!view || !isCodeMirrorEmptyAtStart(view) || !editor.removeBlocks) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      editor.removeBlocks([block.id]);

      return;
    }

    if (!isCodeBlockSelectAllShortcut(event)) return;

    const eventTargetElement =
      event.target instanceof Element ? event.target : null;
    if (eventTargetElement?.closest(".editor-code-block-language-popover")) {
      return;
    }

    const codeMirrorView = codeMirrorViewRef.current;
    if (codeMirrorView) {
      event.preventDefault();
      event.stopPropagation();
      codeMirrorView.dispatch({
        selection: EditorSelection.range(0, codeMirrorView.state.doc.length),
        scrollIntoView: true,
      });

      return;
    }

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

  const handleCodeMirrorHostKeyDownCapture = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (!isCodeBlockSelectAllShortcut(event)) return;

    const view = codeMirrorViewRef.current;
    if (!view) return;

    event.preventDefault();
    event.stopPropagation();
    view.dispatch({
      selection: EditorSelection.range(0, view.state.doc.length),
      scrollIntoView: true,
    });
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

      <div className="editor-code-block__body">
        <div className="editor-code-block__code-pane">
          <pre
            aria-hidden="true"
            className="editor-code-block__pre editor-code-block__blocknote-content-pre m-0"
          >
            <code
              ref={setCodeElement}
              data-testid="editor-code-block-content"
              data-language={language}
              className={`editor-code-block__content editor-code-block__blocknote-content language-${language}`}
              aria-label={`${languageLabel} code`}
            />
          </pre>
          <div
            ref={setCodeMirrorHost}
            className="editor-code-block__codemirror"
            data-testid="editor-code-block-codemirror"
            onKeyDownCapture={handleCodeMirrorHostKeyDownCapture}
          />
        </div>
      </div>
    </div>
  );
}
