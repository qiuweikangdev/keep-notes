import {
  BlockNoteSchema,
  createBlockSpec,
  createExtension,
  createStyleSpecFromTipTapMark,
  defaultBlockSpecs,
  defaultStyleSpecs,
  getBlockInfo,
  getNodeById,
  insertBlocks,
  nodeToBlock,
  updateBlockTr,
  type CodeBlockOptions,
} from "@blocknote/core";
import {
  createCodeBlockConfig,
  createCodeBlockSpec,
  createQuoteBlockSpec,
} from "@blocknote/core/blocks";
import {
  FormattingToolbarExtension,
  SideMenuExtension,
} from "@blocknote/core/extensions";
import { InputRule } from "@tiptap/core";
import Code from "@tiptap/extension-code";
import { closeHistory } from "@tiptap/pm/history";
import {
  AllSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";
import type { Mark, Node, Slice } from "@tiptap/pm/model";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import {
  createEditorCodeBlockExternalHTML,
  createEditorCodeBlockNodeView,
} from "./editor-code-block-node-view";
import { CODE_BLOCK_LANGUAGE_OPTIONS } from "./editor-code-block-languages";

export const editorCodeBlockSupportedLanguages: NonNullable<
  CodeBlockOptions["supportedLanguages"]
> = Object.fromEntries(
  CODE_BLOCK_LANGUAGE_OPTIONS.map((language) => [
    language.id,
    {
      name: language.label,
      aliases: language.aliases,
    },
  ]),
);

const codeBlockOptions: Partial<CodeBlockOptions> = {
  defaultLanguage: "text",
  supportedLanguages: editorCodeBlockSupportedLanguages,
};

const editorInlineCodeStyleSpec = createStyleSpecFromTipTapMark(
  Code.extend({
    addInputRules() {
      return [
        new InputRule({
          find: /(^|[^`])`([^`]+)`(?!`)$/,
          handler: ({ state, range, match }) => {
            const { tr, schema } = state;
            const leadingText = match[1] ?? "";
            const codeText = match[2] ?? "";

            // 默认 markInputRule 会删除匹配到的前导字符；这里仅替换反引号包裹的片段。
            tr.replaceWith(range.from + leadingText.length, range.to, [
              schema.text(codeText, [this.type.create()]),
            ]);
          },
        }),
        new InputRule({
          find: /(^|[^`])`([^`]+)`(?!`) $/,
          handler: ({ state, range, match }) => {
            const { tr, schema } = state;
            const leadingText = match[1] ?? "";
            const codeText = match[2] ?? "";

            // 用户先输入成对反引号再补内容并按空格时，也保留前导字符。
            tr.replaceWith(range.from + leadingText.length, range.to, [
              schema.text(codeText, [this.type.create()]),
              schema.text(" "),
            ]);
          },
        }),
      ];
    },
  }),
  "boolean",
);

const INLINE_CODE_NORMALIZER_META = "editor-inline-code-normalizer";
const inlineCodeMarkerPattern = /`([^`\n]+)`/g;
const INLINE_CODE_EDITING_CONTENT_CLASS = "editor-inline-code__editing-content";
const INLINE_CODE_EDITING_CARET_CLASS = "editor-inline-code__editing-caret";
const INLINE_CODE_EDITING_MARKER_CLASS = "editor-inline-code__editing-marker";
const INLINE_CODE_EDITING_START_CLASS = "editor-inline-code__editing-start";
const INLINE_CODE_EDITING_END_CLASS = "editor-inline-code__editing-end";
const INLINE_CODE_COMPOSING_CONTENT_CLASS =
  "editor-inline-code__composing-content";
const INLINE_CODE_LATIN_CONTENT_CLASS = "editor-inline-code__latin-content";
const INLINE_CODE_TRAILING_CLICK_SLOP = 16;
const inlineCodeLatinContentPattern = /[\u0020-\u007e]+/g;

type InlineCodeEditingState = {
  activeRange: { from: number; to: number } | null;
  isComposing: boolean;
  suppressedSelectionPosition: number | null;
};

const EMPTY_INLINE_CODE_EDITING_STATE: InlineCodeEditingState = {
  activeRange: null,
  isComposing: false,
  suppressedSelectionPosition: null,
};
const inlineCodeEditingPluginKey = new PluginKey<InlineCodeEditingState>(
  "editor-inline-code-editing",
);
const inlineCodeLatinContentPluginKey = new PluginKey<DecorationSet>(
  "editor-inline-code-latin-content",
);

type InlineCodeMarkerReplacement = {
  from: number;
  marks: Mark[];
  text: string;
  to: number;
};

function collectInlineCodeMarkerReplacements(
  state: EditorState,
  shouldScanNode: (position: number, nodeSize: number) => boolean,
) {
  const codeMark = state.schema.marks.code;
  if (!codeMark) return [];

  const replacements: InlineCodeMarkerReplacement[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true;
    if (!shouldScanNode(pos, node.nodeSize)) return true;
    if (node.marks.some((mark) => mark.type === codeMark)) return true;
    if (state.doc.resolve(pos).parent.type.spec.code) return true;

    for (const match of node.text.matchAll(inlineCodeMarkerPattern)) {
      const matchIndex = match.index;
      const codeText = match[1];
      if (matchIndex === undefined || !codeText) continue;

      replacements.push({
        from: pos + matchIndex,
        marks: [...node.marks, codeMark.create()],
        text: codeText,
        to: pos + matchIndex + match[0].length,
      });
    }

    return true;
  });
  return replacements;
}

function createInlineCodeMarkerNormalizationTransaction(
  state: EditorState,
  replacements: InlineCodeMarkerReplacement[],
) {
  if (replacements.length === 0) return null;

  const tr = state.tr;
  for (let index = replacements.length - 1; index >= 0; index -= 1) {
    const replacement = replacements[index];
    tr.replaceWith(
      replacement.from,
      replacement.to,
      state.schema.text(replacement.text, replacement.marks),
    );
  }

  return tr.docChanged ? tr.setMeta(INLINE_CODE_NORMALIZER_META, true) : null;
}

export function normalizeInlineCodeMarkers(editor: {
  prosemirrorView: EditorView;
}) {
  const view = editor.prosemirrorView;
  const replacements = collectInlineCodeMarkerReplacements(
    view.state,
    () => true,
  );
  const transaction = createInlineCodeMarkerNormalizationTransaction(
    view.state,
    replacements,
  );
  if (transaction) view.dispatch(transaction);
}

const inlineCodeNormalizerExtension = createExtension({
  key: "editor-inline-code-normalizer",
  prosemirrorPlugins: [
    new Plugin({
      appendTransaction(transactions, _oldState, newState) {
        if (!transactions.some((transaction) => transaction.docChanged)) {
          return null;
        }
        if (
          transactions.some((transaction) =>
            transaction.getMeta(INLINE_CODE_NORMALIZER_META),
          )
        ) {
          return null;
        }

        const scanWholeDocument = newState.doc.textContent.length <= 6000;
        const changedRanges: Array<{ from: number; to: number }> = [];
        if (!scanWholeDocument) {
          transactions.forEach((transaction, transactionIndex) => {
            transaction.mapping.maps.forEach((stepMap, stepMapIndex) => {
              stepMap.forEach((_oldFrom, _oldTo, newFrom, newTo) => {
                let from = newFrom;
                let to = newTo;

                // 把每一步的修改位置映射到 appendTransaction 接收到的最终文档。
                for (
                  let mapIndex = stepMapIndex + 1;
                  mapIndex < transaction.mapping.maps.length;
                  mapIndex += 1
                ) {
                  const laterMap = transaction.mapping.maps[mapIndex];
                  from = laterMap.map(from, -1);
                  to = laterMap.map(to, 1);
                }
                for (
                  let laterTransactionIndex = transactionIndex + 1;
                  laterTransactionIndex < transactions.length;
                  laterTransactionIndex += 1
                ) {
                  for (const laterMap of transactions[laterTransactionIndex]
                    .mapping.maps) {
                    from = laterMap.map(from, -1);
                    to = laterMap.map(to, 1);
                  }
                }

                changedRanges.push({
                  from: Math.max(0, Math.min(from, to) - 1),
                  to: Math.min(
                    newState.doc.content.size,
                    Math.max(from, to) + 1,
                  ),
                });
              });
            });
          });
        }

        const replacements = collectInlineCodeMarkerReplacements(
          newState,
          (position, nodeSize) =>
            scanWholeDocument ||
            changedRanges.some(
              (range) =>
                position <= range.to && position + nodeSize >= range.from,
            ),
        );

        // 某些输入路径不会触发 input rule，这里在事务尾部兜底清理 Markdown 反引号。
        return createInlineCodeMarkerNormalizationTransaction(
          newState,
          replacements,
        );
      },
    }),
  ],
});

function getInlineCodeLatinContentDecorations(state: EditorState) {
  const codeMark = state.schema.marks.code;
  if (!codeMark) return DecorationSet.empty;

  const decorations: Decoration[] = [];
  state.doc.descendants((node, position) => {
    if (
      !node.isText ||
      !node.text ||
      !node.marks.some((mark) => mark.type === codeMark)
    ) {
      return true;
    }

    for (const match of node.text.matchAll(inlineCodeLatinContentPattern)) {
      if (match.index === undefined) continue;

      // 仅补偿 ASCII 字符的等宽字体字重，避免同步加深中文回退字体。
      decorations.push(
        Decoration.inline(
          position + match.index,
          position + match.index + match[0].length,
          { class: INLINE_CODE_LATIN_CONTENT_CLASS },
        ),
      );
    }

    return true;
  });

  return decorations.length === 0
    ? DecorationSet.empty
    : DecorationSet.create(state.doc, decorations);
}

function findInlineCodeRange(
  state: EditorState,
  position: number,
  includeBoundaries = false,
) {
  const $position = state.doc.resolve(position);
  if ($position.parent.type.spec.code) return null;

  const codeMark = state.schema.marks.code;
  if (!codeMark) return null;

  const parentStart = $position.start();
  const codeRanges: Array<{ from: number; to: number }> = [];
  let currentRange: { from: number; to: number } | null = null;
  $position.parent.forEach((node, offset) => {
    const from = parentStart + offset;
    const to = from + node.nodeSize;
    const isInlineCodeText =
      node.isText && node.marks.some((mark) => mark.type === codeMark);
    if (isInlineCodeText) {
      // 大文档解析、输入法和叠加文字样式都可能拆分文本节点；连续 code mark 仍属于同一段行内代码。
      if (currentRange?.to === from) currentRange.to = to;
      else {
        currentRange = { from, to };
        codeRanges.push(currentRange);
      }
      return;
    }

    currentRange = null;
  });

  return (
    codeRanges.find((range) =>
      includeBoundaries
        ? position >= range.from && position <= range.to
        : position > range.from && position < range.to,
    ) ?? null
  );
}

function findTrailingInlineCodeAtPointer(
  view: EditorView,
  eventTarget: Element | null,
  event: MouseEvent,
) {
  const blockContent = eventTarget?.closest(".bn-block-content");
  const inlineContent =
    eventTarget?.closest(".bn-inline-content") ??
    blockContent?.querySelector(".bn-inline-content");
  const searchRoot = inlineContent ?? view.dom;

  let closestCode: Element | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const inlineCode of searchRoot.querySelectorAll(
    "code:not(.editor-code-block__content)",
  )) {
    const bounds = inlineCode.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) continue;
    const trailingDistance = event.clientX - bounds.right;
    if (
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom ||
      trailingDistance < 0 ||
      trailingDistance > INLINE_CODE_TRAILING_CLICK_SLOP ||
      trailingDistance >= closestDistance
    ) {
      continue;
    }
    let range = findInlineCodeRangeFromElement(view, inlineCode);
    if (!range) {
      const insidePosition = view.posAtCoords({
        left: Math.max(bounds.left, bounds.right - 1),
        top: Math.min(
          bounds.bottom - 1,
          Math.max(bounds.top + 1, event.clientY),
        ),
      })?.pos;
      range =
        insidePosition === undefined
          ? null
          : findInlineCodeRange(view.state, insidePosition, true);
    }
    if (!range) continue;

    closestCode = inlineCode;
    closestDistance = trailingDistance;
  }

  return closestCode;
}

function getInlineCodeFromPointerEvent(view: EditorView, event: MouseEvent) {
  const eventTarget =
    event.target instanceof Element
      ? event.target
      : ((event.target as { parentElement?: Element | null } | null)
          ?.parentElement ?? null);
  let inlineCode = eventTarget?.closest(
    "code:not(.editor-code-block__content)",
  );
  if (inlineCode) {
    const contentBounds = inlineCode.getBoundingClientRect();
    const hasMeasurableBounds =
      contentBounds.width > 0 && contentBounds.height > 0;
    const pointerIsInsideContent =
      event.clientX >= contentBounds.left &&
      event.clientX <= contentBounds.right &&
      event.clientY >= contentBounds.top &&
      event.clientY <= contentBounds.bottom;
    if (!hasMeasurableBounds || pointerIsInsideContent) return inlineCode;
  }

  // 行尾 code 的视觉末端允许少量命中余量，保证点击最后字符右缘也能落到 code 末尾。
  return findTrailingInlineCodeAtPointer(view, eventTarget, event);
}

function findInlineCodeRangeFromElement(view: EditorView, inlineCode: Element) {
  const domOffsets = [0, inlineCode.childNodes.length];
  for (const domOffset of domOffsets) {
    try {
      const position = view.posAtDOM(inlineCode, domOffset);
      const range = findInlineCodeRange(view.state, position, true);
      if (range) return range;
    } catch {
      // DOM 正在由 ProseMirror 重绘时可能暂时无法映射，继续回退到坐标位置。
    }
  }

  return null;
}

function findInlineCodeRangeForSelection(state: EditorState) {
  const { selection } = state;
  const range = findInlineCodeRange(state, selection.from, true);
  if (!range || selection.from < range.from || selection.to > range.to) {
    return null;
  }

  return range;
}

function getPureInlineCodeBlockRanges(state: EditorState) {
  const codeMark = state.schema.marks.code;
  if (!codeMark) return [];

  const blocks: Array<{
    range: { from: number; to: number } | null;
  }> = [];
  state.doc.descendants((node, position) => {
    if (node.type.name !== "blockContainer") return true;

    const blockContent = node.firstChild;
    let isPureInlineCode = blockContent?.inlineContent === true;
    let codeFrom: number | null = null;
    let codeTo: number | null = null;
    let codeEnded = false;
    blockContent?.forEach((child, offset) => {
      const isCodeText =
        child.isText && child.marks.some((mark) => mark.type === codeMark);
      if (isCodeText && !codeEnded) {
        codeFrom ??= position + 2 + offset;
        codeTo = position + 2 + offset + child.nodeSize;
        return;
      }
      if (child.isText && child.text?.trim() === "") {
        if (codeFrom !== null) codeEnded = true;
        return;
      }
      isPureInlineCode = false;
    });

    blocks.push({
      range:
        isPureInlineCode && codeFrom !== null && codeTo !== null
          ? { from: codeFrom, to: codeTo }
          : null,
    });
    return true;
  });

  return blocks;
}

function isInlineCodeEditingActive(state: EditorState) {
  const editingState =
    inlineCodeEditingPluginKey.getState(state) ??
    EMPTY_INLINE_CODE_EDITING_STATE;

  return (
    editingState.activeRange !== null ||
    (editingState.suppressedSelectionPosition !== state.selection.from &&
      findInlineCodeRange(state, state.selection.from) !== null)
  );
}

function movePureInlineCodeCaret(view: EditorView, direction: -1 | 1) {
  if (!view.state.selection.empty) return false;

  const editingState =
    inlineCodeEditingPluginKey.getState(view.state) ??
    EMPTY_INLINE_CODE_EDITING_STATE;
  if (editingState.suppressedSelectionPosition === view.state.selection.from) {
    return false;
  }
  const activeRange =
    editingState.activeRange ??
    findInlineCodeRange(view.state, view.state.selection.from, true);
  if (!activeRange) return false;

  const blocks = getPureInlineCodeBlockRanges(view.state);
  const currentIndex = blocks.findIndex(
    ({ range }) =>
      range?.from === activeRange.from && range.to === activeRange.to,
  );
  if (currentIndex < 0) return false;

  const targetRange = blocks[currentIndex + direction]?.range;
  if (!targetRange) return false;

  // 纯行内代码块之间纵向移动时保留字符列，避免原生选区落到块间隙后丢失编辑光标。
  const column = Math.min(
    view.state.selection.from - activeRange.from,
    targetRange.to - targetRange.from,
  );
  view.dispatch(
    view.state.tr
      .setSelection(
        TextSelection.create(view.state.doc, targetRange.from + column),
      )
      .setMeta(inlineCodeEditingPluginKey, {
        activeRange: targetRange,
        suppressedSelectionPosition: null,
      })
      .scrollIntoView(),
  );
  return true;
}

function getInlineCodeEditingDecorations(state: EditorState) {
  const { selection } = state;
  const editingState =
    inlineCodeEditingPluginKey.getState(state) ??
    EMPTY_INLINE_CODE_EDITING_STATE;
  if (editingState.suppressedSelectionPosition === selection.from) {
    return DecorationSet.empty;
  }

  const activeRange = editingState.activeRange;
  const selectionIsWithinActiveRange =
    activeRange !== null &&
    selection.from >= activeRange.from &&
    selection.to <= activeRange.to;
  const range = selectionIsWithinActiveRange
    ? findInlineCodeRange(state, selection.from, true)
    : selection.empty
      ? findInlineCodeRange(state, selection.from)
      : null;
  if (!range) return DecorationSet.empty;

  const decorations: Decoration[] = [
    Decoration.inline(range.from, range.to, {
      class: editingState.isComposing
        ? `${INLINE_CODE_EDITING_CONTENT_CLASS} ${INLINE_CODE_COMPOSING_CONTENT_CLASS}`
        : INLINE_CODE_EDITING_CONTENT_CLASS,
    }),
    Decoration.inline(range.from, Math.min(range.from + 1, range.to), {
      class: INLINE_CODE_EDITING_START_CLASS,
    }),
    Decoration.inline(Math.max(range.to - 1, range.from), range.to, {
      class: INLINE_CODE_EDITING_END_CLASS,
    }),
  ];
  if (!editingState.isComposing) {
    const createMarker = (boundary: "start" | "end") => {
      const marker = document.createElement("span");
      marker.className = `${INLINE_CODE_EDITING_MARKER_CLASS} ${INLINE_CODE_EDITING_MARKER_CLASS}--${boundary}`;
      marker.contentEditable = "false";
      marker.setAttribute("aria-hidden", "true");
      marker.textContent = "`";
      return marker;
    };
    decorations.push(
      Decoration.widget(range.from, () => createMarker("start"), {
        key: `inline-code-editing-marker-start-${range.from}`,
        side: -2,
      }),
      Decoration.widget(range.to, () => createMarker("end"), {
        key: `inline-code-editing-marker-end-${range.to}`,
        side: 2,
      }),
    );
  }
  if (selection.empty && !editingState.isComposing) {
    decorations.push(
      Decoration.widget(
        selection.from,
        () => {
          const caret = document.createElement("span");
          caret.className = INLINE_CODE_EDITING_CARET_CLASS;
          caret.contentEditable = "false";
          caret.setAttribute("aria-hidden", "true");
          return caret;
        },
        {
          key: `inline-code-editing-caret-${selection.from}`,
          // 行首从右侧继承 code mark，其他位置从左侧继承，确保光标始终留在胶囊内。
          side: selection.from === range.from ? 1 : -1,
        },
      ),
    );
  }

  return DecorationSet.create(state.doc, decorations);
}

export function clearInlineCodeEditingState(editor: {
  prosemirrorView: EditorView;
}) {
  const view = editor.prosemirrorView;
  view.dispatch(
    view.state.tr.setMeta(inlineCodeEditingPluginKey, {
      ...EMPTY_INLINE_CODE_EDITING_STATE,
      suppressedSelectionPosition: view.state.selection.from,
    }),
  );
}

const inlineCodeEditingExtension = createExtension(({ editor }) => ({
  key: "editor-inline-code-editing",
  runsBefore: ["default"],
  prosemirrorPlugins: [
    new Plugin<InlineCodeEditingState>({
      key: inlineCodeEditingPluginKey,
      state: {
        init: () => EMPTY_INLINE_CODE_EDITING_STATE,
        apply: (transaction, editingState, oldState, newState) => {
          const nextState = transaction.getMeta(inlineCodeEditingPluginKey) as
            | InlineCodeEditingState
            | undefined;
          if (nextState) {
            return {
              ...editingState,
              ...nextState,
            };
          }

          let mappedState = editingState;
          if (transaction.docChanged) {
            mappedState = editingState.activeRange
              ? {
                  activeRange: {
                    from: transaction.mapping.map(
                      editingState.activeRange.from,
                      -1,
                    ),
                    to: transaction.mapping.map(editingState.activeRange.to, 1),
                  },
                  isComposing: editingState.isComposing,
                  suppressedSelectionPosition: null,
                }
              : editingState.suppressedSelectionPosition !== null
                ? {
                    activeRange: null,
                    isComposing: editingState.isComposing,
                    suppressedSelectionPosition: transaction.mapping.map(
                      editingState.suppressedSelectionPosition,
                    ),
                  }
                : EMPTY_INLINE_CODE_EDITING_STATE;
          }
          const selectionChanged =
            transaction.selectionSet ||
            !oldState.selection.eq(newState.selection);
          if (!selectionChanged) return mappedState;

          const wasEditingInlineCode = isInlineCodeEditingActive(oldState);
          const preservedPosition =
            mappedState.activeRange?.from ??
            mappedState.suppressedSelectionPosition;
          if (
            preservedPosition !== null &&
            (mappedState.activeRange
              ? transaction.selection.from >= mappedState.activeRange.from &&
                transaction.selection.to <= mappedState.activeRange.to
              : transaction.selection.empty &&
                transaction.selection.from === preservedPosition)
          ) {
            return mappedState;
          }

          if (wasEditingInlineCode) {
            const nextRange = findInlineCodeRangeForSelection(newState);
            if (nextRange) {
              // 选区进入或完整落在行内代码时迁移编辑范围，保留反引号与原生选中效果。
              return {
                activeRange: nextRange,
                isComposing: mappedState.isComposing,
                suppressedSelectionPosition: null,
              };
            }
          }

          return EMPTY_INLINE_CODE_EDITING_STATE;
        },
      },
      view(editorView) {
        let inlineCodeSelectionDrag: {
          active: boolean;
          anchor: number;
          range: { from: number; to: number };
          startX: number;
          startY: number;
        } | null = null;
        let suppressNextInlineCodeClick = false;
        let compositionEndTimer: number | null = null;

        const resetInlineCodeSelectionDrag = () => {
          inlineCodeSelectionDrag = null;
        };
        const updateInlineCodeCompositionState = (isComposing: boolean) => {
          const editingState =
            inlineCodeEditingPluginKey.getState(editorView.state) ??
            EMPTY_INLINE_CODE_EDITING_STATE;
          if (editingState.isComposing === isComposing) return;

          editorView.dispatch(
            editorView.state.tr.setMeta(inlineCodeEditingPluginKey, {
              ...editingState,
              isComposing,
            }),
          );
        };
        const handleInlineCodeCompositionStart = () => {
          if (compositionEndTimer !== null) {
            window.clearTimeout(compositionEndTimer);
            compositionEndTimer = null;
          }

          // 输入法接管光标前移除 contenteditable=false 的自定义节点，避免 code mark 被拆开。
          updateInlineCodeCompositionState(true);
        };
        const handleInlineCodeCompositionEnd = () => {
          if (compositionEndTimer !== null) {
            window.clearTimeout(compositionEndTimer);
          }

          // ProseMirror 会在 compositionend 后延迟刷新 DOM，稍后再恢复自定义光标。
          compositionEndTimer = window.setTimeout(() => {
            compositionEndTimer = null;
            updateInlineCodeCompositionState(false);
          }, 30);
        };
        const handleInlineCodeMouseDown = (event: MouseEvent) => {
          suppressNextInlineCodeClick = false;
          if (event.button !== 0) {
            resetInlineCodeSelectionDrag();
            return;
          }

          const inlineCode = getInlineCodeFromPointerEvent(editorView, event);
          const coordinatePosition = inlineCode
            ? editorView.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              })?.pos
            : undefined;
          const range = inlineCode
            ? (findInlineCodeRangeFromElement(editorView, inlineCode) ??
              (coordinatePosition === undefined
                ? null
                : findInlineCodeRange(
                    editorView.state,
                    coordinatePosition,
                    true,
                  )))
            : null;
          if (!range || !inlineCode) {
            resetInlineCodeSelectionDrag();
            return;
          }
          const contentBounds = inlineCode.getBoundingClientRect();
          const pointerPosition =
            coordinatePosition ??
            (event.clientX <= (contentBounds.left + contentBounds.right) / 2
              ? range.from
              : range.to);

          inlineCodeSelectionDrag = {
            active: false,
            anchor: Math.min(range.to, Math.max(range.from, pointerPosition)),
            range,
            startX: event.clientX,
            startY: event.clientY,
          };

          // 行内代码的整次拖选统一由 ProseMirror 接管，避免浏览器偶发进入原生文本拖放。
          // 普通点击不在这里改写选区，仍交给 handleClick 在 mouseup 后准确落光标。
          event.preventDefault();
          event.stopImmediatePropagation();
          editorView.focus();
        };
        const updateInlineCodeSelectionDrag = (event: MouseEvent) => {
          const drag = inlineCodeSelectionDrag;
          if (!drag) return false;
          if (event.type !== "mouseup" && event.buttons !== 1) {
            resetInlineCodeSelectionDrag();
            return false;
          }

          if (
            !drag.active &&
            Math.abs(event.clientX - drag.startX) <= 4 &&
            Math.abs(event.clientY - drag.startY) <= 4
          ) {
            return false;
          }

          const head = editorView.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          })?.pos;
          if (head === undefined) return false;

          drag.active = true;
          const selection = TextSelection.create(
            editorView.state.doc,
            drag.anchor,
            head,
          );
          const selectionIsWithinInlineCode =
            selection.from >= drag.range.from && selection.to <= drag.range.to;
          if (!selection.eq(editorView.state.selection)) {
            editorView.dispatch(
              editorView.state.tr.setSelection(selection).setMeta(
                inlineCodeEditingPluginKey,
                selectionIsWithinInlineCode
                  ? {
                      activeRange: drag.range,
                      suppressedSelectionPosition: null,
                    }
                  : EMPTY_INLINE_CODE_EDITING_STATE,
              ),
            );
          }

          // 统一由 ProseMirror 更新选区，避免 Chromium 在已有选区上启动文本拖放。
          event.preventDefault();
          event.stopImmediatePropagation();
          return true;
        };
        const handleInlineCodeMouseMove = (event: MouseEvent) => {
          updateInlineCodeSelectionDrag(event);
        };
        const handleInlineCodeMouseUp = (event: MouseEvent) => {
          const drag = inlineCodeSelectionDrag;
          updateInlineCodeSelectionDrag(event);
          if (drag && !drag.active) {
            const pointerPosition = editorView.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            })?.pos;
            const cursorPosition = Math.min(
              drag.range.to,
              Math.max(drag.range.from, pointerPosition ?? drag.anchor),
            );

            // 普通点击由编辑器主动落光标；mousedown 已阻止原生选区，不能再依赖浏览器更新。
            editorView.dispatch(
              editorView.state.tr
                .setSelection(
                  TextSelection.create(editorView.state.doc, cursorPosition),
                )
                .setMeta(inlineCodeEditingPluginKey, {
                  activeRange: drag.range,
                  suppressedSelectionPosition: null,
                }),
            );
            // BlockNote 会在 pointerup 阶段基于旧选区重新打开格式菜单；光标落点完成后立即收起。
            editor
              .getExtension(FormattingToolbarExtension)
              ?.store.setState(false);
            event.preventDefault();
            event.stopImmediatePropagation();
          }

          // 点击和拖选都已经完成选区更新，屏蔽浏览器随后补发的 click。
          suppressNextInlineCodeClick = drag !== null;
          resetInlineCodeSelectionDrag();
        };
        const handleInlineCodeClick = (event: MouseEvent) => {
          if (!suppressNextInlineCodeClick) return;

          suppressNextInlineCodeClick = false;
          event.preventDefault();
          event.stopImmediatePropagation();
        };
        const handleInlineCodeDragStart = (event: DragEvent) => {
          if (!inlineCodeSelectionDrag) return;
          event.preventDefault();
        };
        const handleVerticalKeyDown = (event: KeyboardEvent) => {
          const direction =
            event.key === "ArrowUp" || event.key === "Up"
              ? -1
              : event.key === "ArrowDown" || event.key === "Down"
                ? 1
                : 0;
          if (
            direction === 0 ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey
          ) {
            return;
          }

          if (!movePureInlineCodeCaret(editorView, direction)) return;

          // 捕获阶段先于编辑器默认按键插件执行，防止选区被移动到两个块之间。
          event.preventDefault();
          event.stopImmediatePropagation();
        };

        document.addEventListener("mousedown", handleInlineCodeMouseDown, true);
        editorView.dom.addEventListener(
          "dragstart",
          handleInlineCodeDragStart,
          true,
        );
        editorView.dom.addEventListener("click", handleInlineCodeClick, true);
        editorView.dom.addEventListener(
          "compositionstart",
          handleInlineCodeCompositionStart,
          true,
        );
        editorView.dom.addEventListener(
          "compositionend",
          handleInlineCodeCompositionEnd,
          true,
        );
        editorView.dom.addEventListener("keydown", handleVerticalKeyDown, true);
        document.addEventListener("mousemove", handleInlineCodeMouseMove, true);
        document.addEventListener("mouseup", handleInlineCodeMouseUp, true);
        window.addEventListener("blur", resetInlineCodeSelectionDrag);
        return {
          destroy() {
            document.removeEventListener(
              "mousedown",
              handleInlineCodeMouseDown,
              true,
            );
            editorView.dom.removeEventListener(
              "dragstart",
              handleInlineCodeDragStart,
              true,
            );
            editorView.dom.removeEventListener(
              "click",
              handleInlineCodeClick,
              true,
            );
            editorView.dom.removeEventListener(
              "compositionstart",
              handleInlineCodeCompositionStart,
              true,
            );
            editorView.dom.removeEventListener(
              "compositionend",
              handleInlineCodeCompositionEnd,
              true,
            );
            editorView.dom.removeEventListener(
              "keydown",
              handleVerticalKeyDown,
              true,
            );
            document.removeEventListener(
              "mousemove",
              handleInlineCodeMouseMove,
              true,
            );
            document.removeEventListener(
              "mouseup",
              handleInlineCodeMouseUp,
              true,
            );
            window.removeEventListener("blur", resetInlineCodeSelectionDrag);
            if (compositionEndTimer !== null) {
              window.clearTimeout(compositionEndTimer);
            }
          },
        };
      },
      props: {
        decorations: getInlineCodeEditingDecorations,
        handleClick(view, position, event) {
          if (event.button !== 0) return false;

          const inlineCode = getInlineCodeFromPointerEvent(view, event);
          const activeRange = inlineCode
            ? (findInlineCodeRangeFromElement(view, inlineCode) ??
              findInlineCodeRange(view.state, position, true))
            : null;

          // 只记录真实点击目标，不改写浏览器已经确定的原生选区。
          view.dispatch(
            view.state.tr.setMeta(
              inlineCodeEditingPluginKey,
              activeRange
                ? {
                    activeRange,
                    suppressedSelectionPosition: null,
                  }
                : {
                    activeRange: null,
                    suppressedSelectionPosition: position,
                  },
            ),
          );

          return false;
        },
        handleDOMEvents: {
          blur(view) {
            view.dispatch(
              view.state.tr.setMeta(
                inlineCodeEditingPluginKey,
                EMPTY_INLINE_CODE_EDITING_STATE,
              ),
            );
            return false;
          },
        },
      },
    }),
  ],
}));

const inlineCodeLatinContentExtension = createExtension({
  key: "editor-inline-code-latin-content",
  prosemirrorPlugins: [
    new Plugin<DecorationSet>({
      key: inlineCodeLatinContentPluginKey,
      state: {
        init: (_config, state) => getInlineCodeLatinContentDecorations(state),
        apply: (transaction, decorations, _oldState, newState) =>
          transaction.docChanged
            ? getInlineCodeLatinContentDecorations(newState)
            : decorations,
      },
      props: {
        // 输入法组合期间同样保留 ASCII 字重补偿，避免中英文数字视觉颜色突然分叉。
        decorations: (state) =>
          inlineCodeLatinContentPluginKey.getState(state) ??
          DecorationSet.empty,
      },
    }),
  ],
});

const inlineCodeBackspaceExtension = createExtension({
  key: "editor-inline-code-backspace",
  runsBefore: ["default"],
  keyboardShortcuts: {
    Backspace: ({ editor }) =>
      editor.transact((tr) => {
        const { selection } = tr;
        const codeMark = tr.doc.type.schema.marks.code;
        const nodeBefore = selection.$from.nodeBefore;
        if (
          !selection.empty ||
          !nodeBefore?.isText ||
          !nodeBefore.text ||
          !nodeBefore.marks.some((mark) => mark.type === codeMark)
        ) {
          return false;
        }

        const previousCharacter = Array.from(nodeBefore.text).at(-1);
        if (!previousCharacter) return false;

        // 使用原生文档位置删除代码内容，不把反引号序列化回编辑器。
        tr.delete(
          selection.from - previousCharacter.length,
          selection.from,
        ).scrollIntoView();
        return true;
      }),
  },
});

const LIST_BLOCK_TYPES = new Set([
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
]);

const listHistoryBoundaryExtension = createExtension({
  key: "editor-list-history-boundary",
  runsBefore: ["default"],
  keyboardShortcuts: {
    Enter: ({ editor }) => {
      const { block } = editor.getTextCursorPosition();
      if (!LIST_BLOCK_TYPES.has(block.type)) return false;

      editor.transact((tr) => {
        // 当前列表项到此结束，下一项内容需要形成独立撤销单元。
        closeHistory(tr);
      });

      return false;
    },
  },
});

const fullDocumentClearExtension = createExtension({
  key: "editor-full-document-clear",
  runsBefore: ["default"],
  keyboardShortcuts: {
    Backspace: ({ editor }) => {
      if (!(editor.prosemirrorState.selection instanceof AllSelection)) {
        return false;
      }

      // 全文选中时统一替换为一个空段落，让光标回到折叠状态并隐藏格式工具栏。
      const { insertedBlocks } = editor.replaceBlocks(editor.document, [
        { type: "paragraph", content: "" },
      ]);
      editor.setTextCursorPosition(insertedBlocks[0].id, "start");
      return true;
    },
    Delete: ({ editor }) => {
      if (!(editor.prosemirrorState.selection instanceof AllSelection)) {
        return false;
      }

      // Delete 与 Backspace 保持一致，避免不同删除键留下不同的编辑器状态。
      const { insertedBlocks } = editor.replaceBlocks(editor.document, [
        { type: "paragraph", content: "" },
      ]);
      editor.setTextCursorPosition(insertedBlocks[0].id, "start");
      return true;
    },
  },
});

const baseCodeBlockSpec = createCodeBlockSpec(codeBlockOptions);

const editorCodeBlockExtensions = [
  ...(baseCodeBlockSpec.extensions?.filter(
    (extension) =>
      (extension as { key?: string }).key !== "code-block-highlighter",
  ) ?? []),
  createExtension({
    key: "editor-code-block-backspace",
    keyboardShortcuts: {
      Backspace: ({ editor }) => {
        return editor.transact((tr) => {
          const { block } = editor.getTextCursorPosition();
          if (block.type !== "codeBlock") return false;
          if (tr.selection.$from.parent.textContent) return false;

          // CodeMirror 没有接住事件时，外层仍需能删除空代码块，避免留下 ```language 的壳。
          editor.removeBlocks([block]);

          return true;
        });
      },
    },
  }),
];

const editorCodeBlockSpec = createBlockSpec(
  createCodeBlockConfig(codeBlockOptions),
  {
    ...baseCodeBlockSpec.implementation,
    meta: {
      ...baseCodeBlockSpec.implementation.meta,
    },
    render: createEditorCodeBlockNodeView,
    toExternalHTML: createEditorCodeBlockExternalHTML,
  },
  editorCodeBlockExtensions,
)();

function collectParagraphTextsFromPasteNode(node: Node, texts: string[]) {
  if (node.type.name === "blockContainer") {
    const blockContent = node.firstChild;
    if (blockContent?.type.name !== "paragraph") return false;

    texts.push(blockContent.textContent);
    return true;
  }

  if (node.type.name !== "blockGroup") return false;

  let isPlainParagraphGroup = true;
  node.forEach((child) => {
    if (!collectParagraphTextsFromPasteNode(child, texts)) {
      isPlainParagraphGroup = false;
    }
  });

  return isPlainParagraphGroup;
}

function getPlainParagraphTextsFromPasteSlice(slice: Slice): string[] | null {
  const texts: string[] = [];
  let isPlainParagraphSlice = true;

  slice.content.forEach((node) => {
    if (!collectParagraphTextsFromPasteNode(node, texts)) {
      isPlainParagraphSlice = false;
    }
  });

  return isPlainParagraphSlice ? texts : null;
}

function getQuoteListPasteContent(slice: Slice) {
  const paragraphTexts = getPlainParagraphTextsFromPasteSlice(slice);
  if (!paragraphTexts) return null;

  const nonEmptyLines = paragraphTexts
    .map((text) => text.trim())
    .filter(Boolean);
  const listStart = nonEmptyLines.findIndex((line) =>
    /^[-+*]\s+(.+)$/u.test(line),
  );
  if (listStart === -1) return null;

  const listLines = nonEmptyLines.slice(listStart);
  if (listLines.length < 2) return null;

  const blocks = listLines.map((line) => {
    const match = line.match(/^[-+*]\s+(.+)$/u);
    if (!match) return null;

    return {
      type: "bulletListItem" as const,
      content: match[1],
    };
  });

  if (!blocks.every((block) => block !== null)) return null;

  return {
    blocks,
    leadText: nonEmptyLines.slice(0, listStart).join("\n"),
  };
}

function getPlainBulletListPasteBlocks(slice: Slice) {
  const quoteContent = getQuoteListPasteContent(slice);
  if (!quoteContent || quoteContent.leadText) return null;
  return quoteContent.blocks;
}

const plainBulletListPasteExtension = createExtension(({ editor }) => ({
  key: "editor-plain-bullet-list-paste",
  prosemirrorPlugins: [
    new Plugin({
      props: {
        handlePaste(_view, event, slice) {
          const blocks = getPlainBulletListPasteBlocks(slice);
          if (!blocks) return false;

          const { block } = editor.getTextCursorPosition();
          const isEmptyInlineBlock = getInlineContentText(block.content) === "";

          // 纯文本粘贴的 Markdown 列表应进入块结构，避免 * 作为普通正文残留。
          if (isEmptyInlineBlock) {
            editor.replaceBlocks([block], blocks);
          } else {
            editor.insertBlocks(blocks, block, "after");
          }
          event.preventDefault();
          return true;
        },
      },
    }),
  ],
}));

function getInlineContentText(content: unknown) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const text = (item as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .join("");
}

function appendPlainTextToInlineContent(content: unknown, text: string) {
  if (!text) return content;
  if (!Array.isArray(content) || content.length === 0) return text;

  return [
    ...content,
    {
      type: "text" as const,
      text: `\n${text}`,
      styles: {},
    },
  ];
}

// 通过 >  输入规则创建出的空引用块，现在按 Backspace 会直接回退成空的普通段落，不再残留 > 触发文本
function isEmptyQuoteBackspaceContent(content: unknown) {
  const text = getInlineContentText(content).trim();

  return text === "" || text === ">";
}

const baseQuoteBlockSpec = createQuoteBlockSpec();

const editorQuoteBlockSpec = {
  ...baseQuoteBlockSpec,
  config: {
    ...baseQuoteBlockSpec.config,
    meta: {
      // 引用块内按 Enter 继续换行，保持光标留在同一个引用块中。
      hardBreakShortcut: "enter" as const,
    },
  },
  extensions: [
    ...(baseQuoteBlockSpec.extensions ?? []),
    createExtension(({ editor }) => ({
      key: "editor-quote-side-menu-parent",
      mount() {
        const sideMenu = editor.getExtension(SideMenuExtension);
        const store = sideMenu?.store;
        if (!store) return;

        return store.subscribe(({ currentVal }) => {
          if (!currentVal) return;

          let parent = editor.getParentBlock(currentVal.block);
          while (parent && parent.type !== "quote") {
            parent = editor.getParentBlock(parent);
          }
          if (!parent || parent.id === currentVal.block.id) return;

          // 引用子块命中 SideMenu 时统一提升到外层引用，确保显示位置和拖拽对象一致。
          store.setState({ ...currentVal, block: parent });
        });
      },
    }))(),
    createExtension({
      key: "editor-quote-enter",
      runsBefore: ["default"],
      keyboardShortcuts: {
        Backspace: ({ editor }) => {
          const { block } = editor.getTextCursorPosition();
          const { selection } = editor.prosemirrorState;

          if (block.type !== "quote") return false;
          if (!selection.empty) return false;
          if (!isEmptyQuoteBackspaceContent(block.content)) return false;

          // 空引用块回退为普通段落，同时丢弃输入规则残留的 > 触发文本。
          editor.updateBlock(block, {
            type: "paragraph",
            content: "",
            props: {},
          });

          return true;
        },
        Enter: ({ editor }) => {
          return editor.transact((tr) => {
            const { block } = editor.getTextCursorPosition();
            const { selection } = tr;
            const nodeBefore = selection.$from.nodeBefore;

            if (block.type !== "quote") return false;
            if (!selection.empty) return false;
            if (
              selection.$from.parentOffset !==
              selection.$from.parent.content.size
            ) {
              return false;
            }
            if (nodeBefore?.type.name !== "hardBreak") return false;

            // 空引用行上再次按 Enter 时，移除末尾换行并切到引用块后的普通段落。
            tr.delete(selection.from - nodeBefore.nodeSize, selection.from);
            const [insertedBlock] = insertBlocks(
              tr,
              [{ type: "paragraph", content: "" }],
              block,
              "after",
            );
            const insertedNode = getNodeById(insertedBlock.id, tr.doc);
            if (insertedNode) {
              const insertedInfo = getBlockInfo(insertedNode);
              if (insertedInfo.isBlockContainer) {
                tr.setSelection(
                  TextSelection.create(
                    tr.doc,
                    insertedInfo.blockContent.beforePos + 1,
                  ),
                );
              }
            }
            tr.scrollIntoView();

            return true;
          });
        },
      },
    }),
    createExtension(({ editor }) => ({
      key: "editor-quote-list-input",
      runsBefore: ["default", "bullet-list-item-shortcuts"],
      inputRules: [
        {
          find: /(?:^|\ufffc)\s?[-+*]\s$/,
          replace() {
            const { block } = editor.getTextCursorPosition();
            if (block.type !== "quote") return;

            // 与默认列表规则在同一输入规则链中抢先命中，直接把列表项放进引用子块。
            return {
              type: "quote",
              props: block.props,
              children: [
                ...block.children,
                { type: "bulletListItem", content: "" },
              ],
            };
          },
        },
      ],
      prosemirrorPlugins: [
        new Plugin({
          props: {
            handlePaste(_view, event, slice) {
              const pasteContent = getQuoteListPasteContent(slice);
              if (!pasteContent) return false;

              const { block } = editor.getTextCursorPosition();
              if (block.type !== "quote") return false;

              // 引用内粘贴的列表保持为引用子块，避免被默认粘贴逻辑拆成同级块。
              editor.replaceBlocks(
                [block],
                [
                  {
                    id: block.id,
                    type: "quote",
                    content: appendPlainTextToInlineContent(
                      block.content,
                      pasteContent.leadText,
                    ) as typeof block.content,
                    props: block.props,
                    children: [...block.children, ...pasteContent.blocks],
                  },
                ],
              );
              event.preventDefault();

              return true;
            },
            handleTextInput(view, from, to, text) {
              if (text !== " " || from !== to) return false;

              const { block } = editor.getTextCursorPosition();
              const { selection } = view.state;
              if (block.type !== "quote") return false;
              if (
                selection.$from.parentOffset !==
                selection.$from.parent.content.size
              ) {
                return false;
              }

              const marker = getInlineContentText(block.content).match(
                /(?:^|\n)[-+*]$/u,
              )?.[0];
              if (!marker) return false;

              const tr = view.state.tr.delete(from - marker.length, from);
              const quoteNode = getNodeById(block.id, tr.doc);
              if (!quoteNode) return false;
              const quote = nodeToBlock(quoteNode.node, tr.doc.type.schema);

              // Chromium 的文本输入路径可能先经过独立插件；默认规则被拦截后在这里完成同样的子块转换。
              updateBlockTr(tr, quoteNode.posBeforeNode, {
                children: [
                  ...quote.children,
                  { type: "bulletListItem", content: "" },
                ],
              });

              const updatedQuoteNode = getNodeById(block.id, tr.doc);
              if (!updatedQuoteNode) return false;
              const updatedQuote = nodeToBlock(
                updatedQuoteNode.node,
                tr.doc.type.schema,
              );
              const child = updatedQuote.children.at(-1);
              const childNode = child && getNodeById(child.id, tr.doc);
              if (childNode) {
                const childInfo = getBlockInfo(childNode);
                if (childInfo.isBlockContainer) {
                  tr.setSelection(
                    TextSelection.create(
                      tr.doc,
                      childInfo.blockContent.beforePos + 1,
                    ),
                  );
                }
              }

              view.dispatch(tr.scrollIntoView());
              return true;
            },
          },
          appendTransaction(transactions, oldState, newState) {
            if (!transactions.some((transaction) => transaction.docChanged)) {
              return null;
            }

            let insertedChildId: string | null = null;
            oldState.doc.descendants((node, position) => {
              if (node.type.name !== "blockContainer") return true;

              const oldInfo = getBlockInfo({
                node,
                posBeforeNode: position,
              });
              if (!oldInfo.isBlockContainer) return true;
              if (oldInfo.blockNoteType !== "quote") return true;

              const id = node.attrs.id;
              if (typeof id !== "string") return true;
              const nextNode = getNodeById(id, newState.doc);
              if (!nextNode) return true;

              const oldQuote = nodeToBlock(node, oldState.doc.type.schema);
              const nextQuote = nodeToBlock(
                nextNode.node,
                newState.doc.type.schema,
              );
              if (nextQuote.type !== "quote") return true;
              if (nextQuote.children.length !== oldQuote.children.length + 1) {
                return true;
              }

              const child = nextQuote.children.at(-1);
              if (child?.type !== "bulletListItem") return true;
              insertedChildId = child.id;
              return false;
            });
            if (!insertedChildId) return null;

            const tr = newState.tr;
            const childNode = getNodeById(insertedChildId, tr.doc);
            if (childNode) {
              const childInfo = getBlockInfo(childNode);
              if (childInfo.isBlockContainer) {
                tr.setSelection(
                  TextSelection.create(
                    tr.doc,
                    childInfo.blockContent.beforePos + 1,
                  ),
                );
              }
            }

            return tr;
          },
        }),
      ],
    }))(),
  ],
};

const quoteAwareBulletListItemExtensions = (
  defaultBlockSpecs.bulletListItem.extensions ?? []
).map((extensionFactory) =>
  createExtension(({ editor }) => {
    const extension = extensionFactory({ editor });
    if (extension.key !== "bullet-list-item-shortcuts") return extension;

    return {
      ...extension,
      inputRules: extension.inputRules?.map((inputRule) => ({
        ...inputRule,
        replace(props) {
          if (props.editor.getTextCursorPosition().block.type === "quote") {
            return;
          }
          return inputRule.replace(props);
        },
      })),
    };
  })(),
);

const editorBulletListItemSpec = {
  ...defaultBlockSpecs.bulletListItem,
  extensions: [
    ...quoteAwareBulletListItemExtensions,
    listHistoryBoundaryExtension(),
    plainBulletListPasteExtension(),
  ],
};

const editorParagraphSpec = {
  ...defaultBlockSpecs.paragraph,
  extensions: [
    ...(defaultBlockSpecs.paragraph.extensions ?? []),
    fullDocumentClearExtension(),
    inlineCodeBackspaceExtension(),
    inlineCodeEditingExtension(),
    inlineCodeLatinContentExtension(),
    inlineCodeNormalizerExtension(),
  ],
};

export const editorBlockSpecs = {
  ...defaultBlockSpecs,
  bulletListItem: editorBulletListItemSpec,
  codeBlock: editorCodeBlockSpec,
  paragraph: editorParagraphSpec,
  quote: editorQuoteBlockSpec,
};

export const editorStyleSpecs = {
  ...defaultStyleSpecs,
  code: editorInlineCodeStyleSpec,
};

export const editorSchema = BlockNoteSchema.create({
  blockSpecs: editorBlockSpecs,
  styleSpecs: editorStyleSpecs,
});
