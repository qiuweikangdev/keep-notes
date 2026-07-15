import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  isolateHistory,
  undoDepth,
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
  EditorView as CodeMirrorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type BlockInfo,
  type ViewUpdate,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import type { Block, BlockNoteEditor } from "@blocknote/core";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView as ProseMirrorView } from "@tiptap/pm/view";

import {
  CODE_BLOCK_LANGUAGE_OPTIONS,
  getCodeBlockLanguageShortLabel,
  getSupportedCodeBlockLanguageId,
  searchCodeBlockLanguages,
} from "./editor-code-block-languages";
import { getCodeBlockFoldRanges } from "./editor-code-folding";

interface CodeBlockNodeViewProps {
  editor?: {
    view?: ProseMirrorView;
    schema?: Schema;
  };
  getPos?: () => number | undefined;
  node?: ProseMirrorNode;
}

interface CodeBlockRenderContext {
  props?: CodeBlockNodeViewProps;
  renderType?: "dom" | "nodeView";
}

interface EditorCodeBlockNodeViewOptions {
  block: Block;
  editor: BlockNoteEditor;
  props?: CodeBlockNodeViewProps;
}

const codeMirrorFallbackFoldRangeCache = new WeakMap<
  object,
  Map<number, { from: number; to: number }>
>();

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

const editorCodeMirrorTheme = CodeMirrorView.theme({
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
    padding: "0 0.25rem 0 0.75rem",
  },
  ".cm-gutterElement": {
    lineHeight: "1.6rem",
    minHeight: "0",
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
    borderLeftWidth: "2px",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--accent-color)",
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

function getFoldedCodeMirrorRangeAtLine(view: CodeMirrorView, line: BlockInfo) {
  let foldedRange: { from: number; to: number } | null = null;

  foldedRanges(view.state).between(line.from, line.to, (from, to) => {
    foldedRange = { from, to };
  });

  return foldedRange;
}

function isInsideFoldedCodeMirrorRange(view: CodeMirrorView, position: number) {
  let isInside = false;

  foldedRanges(view.state).between(position, position, (from, to) => {
    if (from < position && to > position) isInside = true;
  });

  return isInside;
}

function stopCodeMirrorControlEvent(event: Event) {
  event.preventDefault();
  event.stopPropagation();
}

function stopCodeMirrorBubbleEvent(event: Event) {
  event.stopPropagation();
}

export function shouldStopEditorCodeBlockNodeViewEvent(event: Event): boolean {
  const target = event.target instanceof Element ? event.target : null;
  const isCodeMirrorContent = Boolean(target?.closest(".cm-content"));

  // 外层编辑器拖选经过代码内容区时，需要继续接收移动和释放事件来扩展块级选区。
  if (
    isCodeMirrorContent &&
    ["mousemove", "mouseup", "pointermove", "pointerup"].includes(event.type)
  ) {
    return false;
  }

  return true;
}

function toggleCodeMirrorFoldAtLine(
  view: CodeMirrorView,
  line: BlockInfo,
  event: Event,
) {
  stopCodeMirrorControlEvent(event);

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

function readBlockContentText(block: Block): string {
  const content = block.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((item) => {
      if (typeof item !== "object" || item === null) return "";
      if ("text" in item && typeof item.text === "string") return item.text;
      if ("content" in item && Array.isArray(item.content)) {
        return item.content
          .map((child) =>
            typeof child === "object" &&
            child !== null &&
            "text" in child &&
            typeof child.text === "string"
              ? child.text
              : "",
          )
          .join("");
      }

      return "";
    })
    .join("");
}

function createExternalCodeBlockHtml(block: Block) {
  const language =
    "language" in block.props && typeof block.props.language === "string"
      ? block.props.language
      : "text";
  const pre = document.createElement("pre");
  const code = document.createElement("code");

  code.className = `language-${language}`;
  code.dataset.language = language;
  code.textContent = readBlockContentText(block);
  pre.appendChild(code);

  return { dom: pre };
}

function createIconSvg(path: string) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  const svgPath = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  svgPath.setAttribute("d", path);
  svg.appendChild(svgPath);

  return svg;
}

function createCopyIconSvg() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2",
  );

  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", "8");
  rect.setAttribute("y", "2");
  rect.setAttribute("width", "8");
  rect.setAttribute("height", "4");
  rect.setAttribute("rx", "1");
  rect.setAttribute("ry", "1");

  svg.append(path, rect);

  return svg;
}

function createCheckIconSvg() {
  return createIconSvg("M20 6 9 17l-5-5");
}

function getMountedProseMirrorView(editor: BlockNoteEditor) {
  try {
    return editor.prosemirrorView;
  } catch {
    return undefined;
  }
}

function getNodeViewProseMirrorView(props: CodeBlockNodeViewProps | undefined) {
  try {
    return props?.editor?.view;
  } catch {
    return undefined;
  }
}

function getProseMirrorRoot(view: ProseMirrorView | undefined) {
  try {
    return view?.root;
  } catch {
    return undefined;
  }
}

class EditorCodeBlockNodeView {
  public readonly dom: HTMLElement;

  private codeMirror: CodeMirrorView;

  private codeMirrorLanguage = new Compartment();

  private isUpdatingFromProseMirror = false;

  private language: string;

  private languageButton!: HTMLButtonElement;

  private languageOptionsHost: HTMLDivElement | null = null;

  private popover: HTMLDivElement | null = null;

  private node?: ProseMirrorNode;

  private readonly block: Block;

  private readonly editor: BlockNoteEditor;

  private readonly getPos?: () => number | undefined;

  private readonly prosemirrorView?: ProseMirrorView;

  private copyResetTimer: number | null = null;

  private readonly closeLanguagePickerOnPointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      this.closeLanguagePicker();
      return;
    }

    if (
      this.popover?.contains(target) ||
      this.languageButton.contains(target)
    ) {
      return;
    }

    this.closeLanguagePicker();
  };

  private readonly handleNativeKeyDown = (event: KeyboardEvent) => {
    if (
      event.key.toLowerCase() === "a" &&
      (event.metaKey || event.ctrlKey) &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.selectAllCode();
      return;
    }

    if (event.key === "Backspace" && this.deleteEmptyCodeBlock()) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  private readonly focusCodeMirrorFromShell = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (
      target?.closest(
        [
          ".editor-code-block__toolbar",
          ".editor-code-block-language-popover",
        ].join(", "),
      )
    ) {
      return;
    }

    // 点击代码正文、普通 gutter 或其他非控件区域时，让焦点回到 CodeMirror，而不是落到外层富文本。
    this.codeMirror.focus();
  };

  constructor({ block, editor, props }: EditorCodeBlockNodeViewOptions) {
    this.block = block;
    this.editor = editor;
    this.node = props?.node;
    this.getPos = props?.getPos;
    this.prosemirrorView =
      getNodeViewProseMirrorView(props) ?? getMountedProseMirrorView(editor);
    this.language = this.getLanguage(block, this.node);

    this.dom = document.createElement("div");
    this.dom.className =
      "editor-code-block-shell editor-code-block relative rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)]";
    this.dom.contentEditable = "false";

    const toolbar = this.createToolbar();
    const body = document.createElement("div");
    body.className = "editor-code-block__body";

    const codePane = document.createElement("div");
    codePane.className = "editor-code-block__code-pane";

    const codeMirrorHost = document.createElement("div");
    codeMirrorHost.className = "editor-code-block__codemirror";
    codeMirrorHost.dataset.testid = "editor-code-block-codemirror";

    codePane.appendChild(codeMirrorHost);
    body.appendChild(codePane);
    this.dom.append(toolbar, body);

    this.codeMirror = new CodeMirrorView({
      parent: codeMirrorHost,
      root: getProseMirrorRoot(this.prosemirrorView),
      state: EditorState.create({
        doc: this.node?.textContent ?? readBlockContentText(block),
        extensions: this.getCodeMirrorExtensions(),
      }),
    });
    this.codeMirror.contentDOM.addEventListener(
      "keydown",
      this.handleNativeKeyDown,
      true,
    );
    this.dom.addEventListener("mousedown", this.focusCodeMirrorFromShell);
  }

  public stopEvent = (event: Event) =>
    shouldStopEditorCodeBlockNodeViewEvent(event);

  public ignoreMutation = () => {
    return true;
  };

  public destroy = () => {
    this.closeLanguagePicker();
    if (this.copyResetTimer !== null) {
      window.clearTimeout(this.copyResetTimer);
      this.copyResetTimer = null;
    }
    this.dom.removeEventListener("mousedown", this.focusCodeMirrorFromShell);
    this.codeMirror.contentDOM.removeEventListener(
      "keydown",
      this.handleNativeKeyDown,
      true,
    );
    this.codeMirror.destroy();
  };

  public selectNode = () => {
    this.codeMirror.focus();
  };

  public deselectNode = () => {
    const position = this.getPos?.();
    const selection = this.prosemirrorView?.state.selection;
    if (position !== undefined && selection) {
      const contentFrom = position + 1;
      const contentTo =
        contentFrom +
        (this.node?.content.size ?? this.codeMirror.state.doc.length);

      // 内部 CodeMirror 同步文本选区时会取消外层节点选区，此时仍需保留代码编辑焦点。
      if (selection.from >= contentFrom && selection.to <= contentTo) return;
    }

    this.codeMirror.contentDOM.blur();
  };

  public setSelection = (anchor: number, head: number) => {
    this.codeMirror.focus();

    // pane 恢复的外部选择可能落在折叠区内部；CodeMirror 会因此自动展开，需保留原折叠状态。
    if (isInsideFoldedCodeMirrorRange(this.codeMirror, head)) return;

    this.codeMirror.dispatch({
      selection: EditorSelection.range(anchor, head),
    });
  };

  public update = (node: ProseMirrorNode) => {
    if (node.type.name !== "codeBlock") return false;

    this.node = node;
    this.syncCodeMirrorDocument(node.textContent);
    this.setLanguage(this.getLanguage(this.block, node), false);

    return true;
  };

  private getCodeMirrorExtensions(): Extension[] {
    return [
      Prec.highest(
        keymap.of([
          {
            key: "Backspace",
            run: () => this.deleteEmptyCodeBlock(),
          },
          {
            key: "Mod-a",
            run: () => {
              this.selectAllCode();

              return true;
            },
          },
          {
            key: "Enter",
            run: (view) => {
              // 换行与下一行内容组成独立撤销单元，避免一次撤回清空多行输入。
              view.dispatch({ annotations: isolateHistory.of("before") });

              return false;
            },
          },
          {
            key: "Mod-z",
            run: (view) => {
              if (undoDepth(view.state) > 0) return false;

              // 代码内容已全部撤回后，继续撤销外层的代码块创建等结构操作。
              return this.editor.undo();
            },
          },
        ]),
      ),
      lineNumbers(),
      foldGutter({
        domEventHandlers: {
          click: (view, line, event) =>
            toggleCodeMirrorFoldAtLine(view, line, event),
          mousedown: (_view, _line, event) => {
            stopCodeMirrorBubbleEvent(event);

            return false;
          },
          pointerdown: (_view, _line, event) => {
            stopCodeMirrorBubbleEvent(event);

            return false;
          },
        },
      }),
      foldService.of(getCodeMirrorFallbackFoldRange),
      codeFolding(),
      history(),
      drawSelection({ cursorBlinkRate: 0 }),
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
      this.codeMirrorLanguage.of(getCodeMirrorLanguageExtension(this.language)),
      EditorState.readOnly.of(!this.editor.isEditable),
      EditorState.changeFilter.of(() => this.editor.isEditable),
      CodeMirrorView.domEventHandlers({
        keydown: (event) => {
          if (
            event.key.toLowerCase() === "a" &&
            (event.metaKey || event.ctrlKey) &&
            !event.altKey
          ) {
            event.preventDefault();
            event.stopPropagation();
            this.selectAllCode();

            return true;
          }

          if (event.key === "Backspace" && this.deleteEmptyCodeBlock()) {
            event.preventDefault();

            return true;
          }

          return false;
        },
      }),
      CodeMirrorView.updateListener.of((update) => this.forwardUpdate(update)),
      keymap.of([
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
      ]),
    ];
  }

  private forwardUpdate(update: ViewUpdate) {
    if (this.isUpdatingFromProseMirror || !this.codeMirror.hasFocus) return;

    const view = this.prosemirrorView;
    const getPos = this.getPos;
    if (!view || !getPos) return;

    const pos = getPos();
    if (pos === undefined) return;

    const offset = pos + 1;
    const selection = update.state.selection.main;
    const nextSelectionFrom = offset + selection.from;
    const nextSelectionTo = offset + selection.to;
    const currentSelection = view.state.selection;

    if (
      !update.docChanged &&
      currentSelection.from === nextSelectionFrom &&
      currentSelection.to === nextSelectionTo
    ) {
      return;
    }

    let tr = view.state.tr;
    let changeOffset = offset;

    update.changes.iterChanges((fromA, toA, fromB, toB, text) => {
      const insertText = text.toString();

      if (insertText.length > 0) {
        tr = tr.replaceWith(
          changeOffset + fromA,
          changeOffset + toA,
          view.state.schema.text(insertText),
        );
      } else {
        tr = tr.delete(changeOffset + fromA, changeOffset + toA);
      }

      changeOffset += toB - fromB - (toA - fromA);
    });

    tr = tr.setSelection(
      TextSelection.create(tr.doc, nextSelectionFrom, nextSelectionTo),
    );
    // 代码文本由 CodeMirror 维护撤销栈，外层只记录代码块创建、删除等结构历史。
    view.dispatch(tr.setMeta("addToHistory", false));
  }

  private selectAllCode() {
    this.codeMirror.dispatch({
      selection: EditorSelection.range(0, this.codeMirror.state.doc.length),
      scrollIntoView: true,
    });
  }

  private deleteEmptyCodeBlock() {
    const selection = this.codeMirror.state.selection.main;
    const isAtEmptyStart =
      this.codeMirror.state.doc.lines === 1 &&
      this.codeMirror.state.doc.line(1).text.length === 0 &&
      selection.empty &&
      selection.anchor === 0;

    if (!isAtEmptyStart) return false;

    const view = this.prosemirrorView;
    const pos = this.getPos?.();
    if (!view || pos === undefined) return false;

    const paragraph = view.state.schema.nodes.paragraph?.createChecked(
      {},
      this.node?.content,
    );
    if (!paragraph) return false;

    // 与 Milkdown 一样，空代码块退格时直接替换为普通段落，避免留下 ```language 的壳。
    const tr = view.state.tr.replaceWith(
      pos,
      pos + (this.node?.nodeSize ?? 1),
      paragraph,
    );
    tr.setSelection(TextSelection.near(tr.doc.resolve(pos)));

    view.dispatch(tr);
    view.focus();

    return true;
  }

  private syncCodeMirrorDocument(nextCodeText: string) {
    if (this.codeMirror.state.doc.toString() === nextCodeText) return;

    this.isUpdatingFromProseMirror = true;
    this.codeMirror.dispatch({
      changes: {
        from: 0,
        to: this.codeMirror.state.doc.length,
        insert: nextCodeText,
      },
    });
    this.isUpdatingFromProseMirror = false;
  }

  private getLanguage(block: Block, node?: ProseMirrorNode) {
    const nodeLanguage = node?.attrs.language;
    if (typeof nodeLanguage === "string") {
      return getSupportedCodeBlockLanguageId(nodeLanguage);
    }

    const blockLanguage =
      "language" in block.props && typeof block.props.language === "string"
        ? block.props.language
        : "text";

    return getSupportedCodeBlockLanguageId(blockLanguage);
  }

  private setLanguage(nextLanguage: string, shouldDispatch = true) {
    const normalizedLanguage = getSupportedCodeBlockLanguageId(nextLanguage);
    if (this.language === normalizedLanguage) return;

    this.language = normalizedLanguage;
    this.languageButton.querySelector("span")!.textContent =
      getCodeBlockLanguageShortLabel(normalizedLanguage);
    this.codeMirror.dispatch({
      effects: this.codeMirrorLanguage.reconfigure(
        getCodeMirrorLanguageExtension(normalizedLanguage),
      ),
    });

    if (!shouldDispatch) return;

    const view = this.prosemirrorView;
    const pos = this.getPos?.();
    if (view && pos !== undefined) {
      view.dispatch(
        view.state.tr.setNodeAttribute(pos, "language", normalizedLanguage),
      );
      return;
    }

    this.editor.updateBlock(this.block, {
      props: { language: normalizedLanguage },
    });
  }

  private createToolbar() {
    const toolbar = document.createElement("div");
    toolbar.className =
      "editor-code-block__toolbar flex items-center justify-between gap-2 border-b border-[var(--border-color)] px-2 py-1";

    const languageWrap = document.createElement("div");
    languageWrap.className = "editor-code-block__language-wrap relative";

    this.languageButton = document.createElement("button");
    this.languageButton.type = "button";
    this.languageButton.ariaLabel = "Change code language";
    this.languageButton.className =
      "editor-code-block-language-trigger editor-code-block__language-button inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--button-hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-color)]";
    const label = document.createElement("span");
    label.textContent = getCodeBlockLanguageShortLabel(this.language);
    this.languageButton.append(label, createIconSvg("m6 9 6 6 6-6"));
    this.languageButton.addEventListener(
      "mousedown",
      stopCodeMirrorControlEvent,
    );
    this.languageButton.addEventListener("click", (event) => {
      stopCodeMirrorControlEvent(event);
      this.toggleLanguagePicker(languageWrap);
    });

    languageWrap.appendChild(this.languageButton);

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.ariaLabel = "Copy code";
    copyButton.className =
      "editor-code-block-copy editor-code-block__copy-button inline-flex h-7 items-center justify-center rounded text-xs text-[var(--text-secondary)] hover:bg-[var(--button-hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-color)]";
    copyButton.appendChild(createCopyIconSvg());
    copyButton.addEventListener("mousedown", stopCodeMirrorControlEvent);
    copyButton.addEventListener("click", async (event) => {
      stopCodeMirrorControlEvent(event);
      await navigator.clipboard?.writeText(
        this.codeMirror.state.doc.toString(),
      );
      copyButton.replaceChildren(createCheckIconSvg());
      copyButton.dataset.copied = "true";
      if (this.copyResetTimer !== null) {
        window.clearTimeout(this.copyResetTimer);
      }
      this.copyResetTimer = window.setTimeout(() => {
        copyButton.replaceChildren(createCopyIconSvg());
        delete copyButton.dataset.copied;
        this.copyResetTimer = null;
      }, 1200);
    });

    toolbar.append(languageWrap, copyButton);

    return toolbar;
  }

  private toggleLanguagePicker(parent: HTMLElement) {
    if (this.popover) {
      this.closeLanguagePicker();
      return;
    }

    const popover = document.createElement("div");
    popover.role = "dialog";
    popover.ariaLabel = "Code language";
    popover.className =
      "editor-code-block-language-popover editor-code-block__language-dialog absolute left-0 top-8 z-50 w-64 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] p-2 shadow-xl";

    const label = document.createElement("label");
    label.className =
      "editor-code-block__search-label flex h-8 items-center gap-2 rounded border border-[var(--border-color)] px-2 text-[var(--text-muted)]";
    label.appendChild(
      createIconSvg("m21 21-4.3-4.3 M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16"),
    );

    const input = document.createElement("input");
    input.type = "search";
    input.ariaLabel = "Search code language";
    input.className =
      "min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]";
    input.placeholder = "Search language";
    label.appendChild(input);

    const options = document.createElement("div");
    options.role = "listbox";
    options.ariaLabel = "Code language options";
    options.className =
      "editor-code-block__language-options mt-2 max-h-64 overflow-y-auto";
    this.languageOptionsHost = options;

    popover.append(label, options);
    parent.appendChild(popover);
    this.popover = popover;
    this.renderLanguageOptions("");

    popover.dataset.closeListener = "true";
    document.addEventListener(
      "pointerdown",
      this.closeLanguagePickerOnPointerDown,
    );

    popover.addEventListener("mousedown", stopCodeMirrorControlEvent);
    input.addEventListener("input", () =>
      this.renderLanguageOptions(input.value),
    );
    input.focus();
  }

  private closeLanguagePicker() {
    document.removeEventListener(
      "pointerdown",
      this.closeLanguagePickerOnPointerDown,
    );
    this.popover?.remove();
    this.popover = null;
    this.languageOptionsHost = null;
  }

  private renderLanguageOptions(query: string) {
    const host = this.languageOptionsHost;
    if (!host) return;

    host.textContent = "";
    const languages =
      query.trim().length > 0
        ? searchCodeBlockLanguages(query)
        : CODE_BLOCK_LANGUAGE_OPTIONS;

    if (languages.length === 0) {
      const empty = document.createElement("div");
      empty.className = "editor-code-block-language-empty";
      empty.textContent = "No languages found";
      host.appendChild(empty);
      return;
    }

    for (const language of languages) {
      const option = document.createElement("button");
      option.type = "button";
      option.role = "option";
      option.ariaSelected = String(language.id === this.language);
      option.className =
        "editor-code-block__language-option flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--button-hover-bg)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-color)]";
      option.textContent = language.label;
      option.addEventListener("mousedown", stopCodeMirrorControlEvent);
      option.addEventListener("click", (event) => {
        stopCodeMirrorControlEvent(event);
        this.setLanguage(language.id);
        this.closeLanguagePicker();
      });
      host.appendChild(option);
    }
  }
}

export function createEditorCodeBlockNodeView(
  this: CodeBlockRenderContext,
  block: Block,
  editor: BlockNoteEditor,
) {
  return new EditorCodeBlockNodeView({
    block,
    editor,
    props: this.props,
  });
}

export function createEditorCodeBlockExternalHTML(block: Block) {
  return createExternalCodeBlockHtml(block);
}
