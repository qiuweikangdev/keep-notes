import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
} from "react";
import {
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
  SideMenu,
  SideMenuController,
  useBlockNoteEditor,
  useEditorState,
  useEditorChange,
  useComponentsContext,
  useExtensionState,
  type FormattingToolbarProps,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { EditorView as CodeMirrorView } from "@codemirror/view";
import { CodeXml } from "lucide-react";
import {
  BlockNoteEditor as CoreBlockNoteEditor,
  getNodeById,
  selectedFragmentToHTML,
  type Block,
  type InlineContent,
  type PartialBlock,
} from "@blocknote/core";
import { SideMenuExtension } from "@blocknote/core/extensions";
import {
  AllSelection,
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type Selection,
  type Transaction,
} from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import {
  Fragment,
  Slice,
  type Node as ProseMirrorNode,
} from "@tiptap/pm/model";
import { __parseFromClipboard } from "@tiptap/pm/view";

import { useTheme } from "@/hooks/use-theme";
import { useEditorStore, type EditorState } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import { editorCache, richPaneViewStateRegistry } from "../lib/editor-runtime";
import {
  getDraggedFilePath,
  isEditorFileDrag,
  isSupportedEditorFilePath,
} from "../lib/editor-drag-session";
import {
  isUntitledDocumentPath,
  matchesEditorDocumentPath,
} from "../lib/editor-document-path";
import {
  getEditorSerializationQuietPeriodForLength,
  scheduleEditorIdleTask,
} from "../lib/editor-large-document";
import type { RichDocumentRuntime } from "../lib/rich-document-session-manager";
import type { RichPreviewAnchor } from "../lib/rich-preview-anchor";
import { RichPreviewCache } from "../lib/rich-preview-cache";
import { measureEditorOperation } from "../lib/editor-performance";
import {
  richEditorOwnerRegistry,
  type RichEditorOwnerEntry,
} from "../lib/rich-editor-owner-registry";
import {
  RichPaneScrollIdleWriter,
  type RichPaneKey,
  type RichPaneScrollOwner,
  type RichPaneSelection,
  type RichPaneViewState,
  toRichPaneKey,
} from "../lib/rich-pane-view-state";
import { normalizeRichDocumentPath } from "../lib/rich-document-surface-registry";
import {
  ensureEditableBlocks,
  markdownEquals,
  parseMarkdown,
  preserveMarkdownSource,
  repairMarkdownSourceBeforeParse,
  resolveEditorImageUrl,
  serializeMarkdown,
} from "../lib/markdown";
import { EditorChangeGate } from "../lib/editor-change-gate";
import {
  createEditorCodeLineTarget,
  readEditorCodeViewportAnchor,
} from "../lib/editor-code-viewport";
import { EDITOR_EMPTY_PLACEHOLDER } from "../lib/editor-placeholder";
import {
  chooseCapturedEditorViewport,
  chooseRestoredEditorScrollTop,
  completeEditorViewportPreservation,
  readEditorViewportAnchor,
  readEditorViewportPreservation,
  readEditorScrollTop,
  resolveEditorViewportTargetOffset,
  restoreEditorScrollTop,
  scheduleStableEditorBlockScroll,
  type EditorViewportSnapshot,
} from "../lib/editor-viewport";
import { flushPendingEditorOutlineNavigation } from "../lib/editor-outline-navigation";
import { createParseFallback } from "../lib/editor-parse-fallback";
import {
  moveCursorAfterUploadedImage,
  readImageFileAsArrayBuffer,
  readImageFileAsDataUrl,
} from "../lib/editor-image";
import {
  clearInlineCodeEditingState,
  editorSchema,
  normalizeInlineCodeMarkers,
  preserveInlineCodeEditingState,
} from "../lib/blocknote-schema";
import { getSupportedCodeBlockLanguageId } from "../lib/editor-code-block-languages";
import {
  configureRichTextUndoHistory,
  runWithoutRichTextUndoHistory,
} from "../lib/editor-undo-history";
import { selectCodeBlockContent } from "./editor-code-block";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "@/styles/blocknote-overrides.css";

export { moveCursorAfterUploadedImage } from "../lib/editor-image";

function findCodeMirrorView(root: ParentNode | null) {
  const editorElement = root?.querySelector<HTMLElement>(
    ".editor-code-block__codemirror .cm-editor",
  );
  if (!editorElement) return null;

  return CodeMirrorView.findFromDOM(editorElement);
}

function findSelectedCodeMirrorView(editor: CoreBlockNoteEditor) {
  try {
    const currentBlock = editor.getTextCursorPosition().block;
    if (currentBlock.type !== "codeBlock") return null;

    const blockRoot = editor.prosemirrorView.dom.querySelector<HTMLElement>(
      createBlockIdSelector(currentBlock.id),
    );

    return findCodeMirrorView(blockRoot);
  } catch {
    return null;
  }
}

function isCodeMirrorPasteTarget(
  editor: CoreBlockNoteEditor,
  event: ClipboardEvent,
): boolean {
  const target = getElementFromEventTarget(event.target);
  if (
    target?.closest(".editor-code-block__codemirror, .cm-editor, .cm-content")
  ) {
    return true;
  }

  try {
    return editor.getTextCursorPosition().block.type === "codeBlock";
  } catch {
    return false;
  }
}

function shouldSuppressStaleTableMouseMove(
  editor: CoreBlockNoteEditor,
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) return false;

  const tableWrapper = target.closest(".tableWrapper");
  if (!tableWrapper) return false;

  const tableContent = tableWrapper.closest<HTMLElement>(
    '[data-content-type="table"]',
  );
  const blockRoot = tableContent?.closest<HTMLElement>("[data-id]");
  const blockId = blockRoot?.dataset.id;
  // BlockNote 0.51 的表格句柄在表格删除后仍可能收到 mousemove；失效 DOM 不应再交给句柄插件处理。
  return !blockId || editor.getBlock(blockId)?.type !== "table";
}

interface TableHandlesRuntimeView {
  mouseMoveHandler?: (event: MouseEvent) => unknown;
  state?: { block?: unknown };
}

interface TableHandlesRuntimeExtension {
  getCellSelection?: () => unknown;
}

const patchedTableHandlesViews = new WeakSet<object>();
const patchedTableHandlesExtensions = new WeakSet<object>();

function isInvalidTableCellSelectionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "RangeError" &&
    "message" in error &&
    typeof error.message === "string" &&
    /Position -\d+ out of range/u.test(error.message)
  );
}

export function patchTableHandlesCellSelection(
  editor: CoreBlockNoteEditor,
): boolean {
  let tableHandlesExtension: TableHandlesRuntimeExtension | undefined;
  try {
    tableHandlesExtension = editor.getExtension("tableHandles") as
      | TableHandlesRuntimeExtension
      | undefined;
  } catch {
    return false;
  }

  if (
    !tableHandlesExtension ||
    typeof tableHandlesExtension.getCellSelection !== "function" ||
    patchedTableHandlesExtensions.has(tableHandlesExtension)
  ) {
    return false;
  }

  const originalGetCellSelection = tableHandlesExtension.getCellSelection;
  tableHandlesExtension.getCellSelection = () => {
    try {
      return originalGetCellSelection.call(tableHandlesExtension);
    } catch (error) {
      // BlockNote 0.51 在表格首单元格或文档重载的失效选区上会 resolve(-1)，此时视为无单元格选区。
      if (isInvalidTableCellSelectionError(error)) return undefined;
      throw error;
    }
  };
  patchedTableHandlesExtensions.add(tableHandlesExtension);
  return true;
}

function patchTableHandlesMouseMoveHandler(
  editor: CoreBlockNoteEditor,
): boolean {
  let prosemirrorView: {
    dom: HTMLElement;
    pluginViews?: unknown[];
  };
  let pluginViews: unknown[];

  try {
    // 编辑器实例创建时 ProseMirror 视图还未挂载，访问该属性会直接抛错。
    prosemirrorView = editor.prosemirrorView as unknown as {
      dom: HTMLElement;
      pluginViews?: unknown[];
    };
    pluginViews = prosemirrorView.pluginViews ?? [];
  } catch {
    return false;
  }

  let patched = false;
  for (const candidate of pluginViews) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      patchedTableHandlesViews.has(candidate)
    ) {
      continue;
    }

    const tableHandlesView = candidate as TableHandlesRuntimeView;
    const originalHandler = tableHandlesView.mouseMoveHandler;
    if (!originalHandler) continue;

    const safeHandler = (event: MouseEvent) => {
      // BlockNote 0.51 在表格删除后会保留无 block 的句柄状态，随后 mousemove 会读取 undefined.id。
      if (tableHandlesView.state && !tableHandlesView.state.block) {
        return;
      }
      return originalHandler(event);
    };

    prosemirrorView.dom.removeEventListener("mousemove", originalHandler);
    prosemirrorView.dom.addEventListener("mousemove", safeHandler);
    tableHandlesView.mouseMoveHandler = safeHandler;
    patchedTableHandlesViews.add(candidate);
    patched = true;
  }

  return patched;
}

function getPastedTableCellContent(
  editor: CoreBlockNoteEditor,
  cell: HTMLTableCellElement,
): string | InlineContent[] {
  const inlineBlocks = editor
    .tryParseHTMLToBlocks(cell.innerHTML)
    .map((block) => block.content)
    .filter((content): content is InlineContent[] => Array.isArray(content))
    .filter((content) =>
      content.some((item) => {
        if (!item || typeof item !== "object") return false;
        const inline = item as { text?: unknown };
        return typeof inline.text === "string"
          ? inline.text.trim().length > 0
          : true;
      }),
    );

  if (inlineBlocks.length === 0) return cell.textContent ?? "";

  return inlineBlocks.flatMap((content, index) =>
    index === 0
      ? content
      : [
          {
            type: "text" as const,
            text: "\n",
            styles: {},
          },
          ...content,
        ],
  );
}

function getPastedTableHeaderRowCount(
  table: HTMLTableElement,
  rows: HTMLTableRowElement[],
): number {
  if (table.tHead) return table.tHead.rows.length;

  return rows.findIndex((row) =>
    Array.from(row.cells).some((cell) => cell.tagName !== "TH"),
  );
}

function getPastedTableHeaderColumnCount(
  rows: HTMLTableRowElement[],
  headerRows: number,
): number {
  const bodyRows = rows.slice(headerRows);
  if (bodyRows.length === 0) return 0;

  return Math.min(
    ...bodyRows.map((row) => {
      const cells = Array.from(row.cells);
      const firstDataCell = cells.findIndex((cell) => cell.tagName !== "TH");
      return firstDataCell === -1 ? cells.length : firstDataCell;
    }),
  );
}

function parsePastedHTMLTable(
  editor: CoreBlockNoteEditor,
  table: HTMLTableElement,
): PartialBlock | null {
  const rows = Array.from(table.rows).filter((row) => row.cells.length > 0);
  if (rows.length === 0) return null;

  const detectedHeaderRows = getPastedTableHeaderRowCount(table, rows);
  // GFM 表格必须有表头；外部全 td 表格若保留为 0，保存时会生成一行空表头并在重开后错位。
  const headerRows =
    detectedHeaderRows === -1 ? rows.length : Math.max(1, detectedHeaderRows);
  const headerCols = getPastedTableHeaderColumnCount(rows, headerRows);

  return {
    type: "table",
    content: {
      type: "tableContent",
      headerRows,
      headerCols,
      rows: rows.map((row) => ({
        cells: Array.from(row.cells).map((cell) => ({
          type: "tableCell" as const,
          props: {
            colspan: cell.colSpan,
            rowspan: cell.rowSpan,
          },
          content: getPastedTableCellContent(editor, cell),
        })),
      })),
    },
  };
}

function getPastedInlineContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const inline = item as { content?: unknown; text?: unknown };
      if (typeof inline.text === "string") return inline.text;
      return getPastedInlineContentText(inline.content);
    })
    .join("");
}

function getPastedCodeBlockLanguage(
  pre: HTMLElement,
  code: HTMLElement | null,
): string {
  const explicitLanguage =
    code?.dataset.language ??
    pre.dataset.language ??
    [code, pre]
      .flatMap((element) => Array.from(element?.classList ?? []))
      .find(
        (className) =>
          className.startsWith("language-") || className.startsWith("lang-"),
      )
      ?.replace(/^(?:language|lang)-/, "");

  return getSupportedCodeBlockLanguageId(explicitLanguage ?? "text");
}

function parsePastedHTMLCodeBlock(pre: HTMLPreElement): PartialBlock {
  const code = pre.querySelector<HTMLElement>("code");

  return {
    type: "codeBlock",
    props: {
      language: getPastedCodeBlockLanguage(pre, code),
    },
    content: code?.textContent ?? pre.textContent ?? "",
  };
}

function parsePastedInternalHTMLCodeBlock(
  blockContent: HTMLElement,
): PartialBlock {
  return {
    type: "codeBlock",
    props: {
      language: getPastedCodeBlockLanguage(blockContent, null),
    },
    // 内部 HTML 的代码块不是 pre/code，必须在空白预处理前读取原始 textContent。
    content:
      blockContent.querySelector<HTMLElement>(".bn-inline-content")
        ?.textContent ??
      blockContent.textContent ??
      "",
  };
}

interface PastedBlockPlaceholder {
  block: PartialBlock;
  marker: string;
  visibleMarker?: string;
}

interface PastedHTMLFragment {
  hasExplicitBoundaries: boolean;
  html: string;
}

type PastedInlineSegment =
  | { content: InlineContent[]; type: "content" }
  | { placeholder: PastedBlockPlaceholder; type: "placeholder" };

function getPastedHTMLFragment(source: string): PastedHTMLFragment {
  const startMatch = /<!--\s*StartFragment\s*-->/iu.exec(source);
  const endMatch = /<!--\s*EndFragment\s*-->/iu.exec(source);
  if (
    !startMatch ||
    !endMatch ||
    startMatch.index + startMatch[0].length > endMatch.index
  ) {
    return { hasExplicitBoundaries: false, html: source };
  }

  return {
    hasExplicitBoundaries: true,
    html: source.slice(startMatch.index + startMatch[0].length, endMatch.index),
  };
}

function normalizePastedPlainText(source: string): string {
  return source.replace(/\r\n?/gu, "\n").replace(/\n$/u, "");
}

function getPastedTablePlainText(container: ParentNode): string | null {
  const table = container.querySelector("table");
  if (!table) return null;

  const rows = Array.from(table.rows)
    .filter((row) => row.cells.length > 0)
    .map((row) =>
      Array.from(row.cells)
        .map((cell) => cell.textContent ?? "")
        .join("\t"),
    );
  return rows.length > 0 ? rows.join("\n") : null;
}

function insertPastedTextContent(
  editor: CoreBlockNoteEditor,
  html: string,
  plainText: string,
  options: { forcePlainText?: boolean } = {},
): boolean {
  if (!options.forcePlainText) {
    const parsedBlocks = editor.tryParseHTMLToBlocks(html);
    const inlineContent =
      parsedBlocks.length === 1 && Array.isArray(parsedBlocks[0].content)
        ? parsedBlocks[0].content
        : null;
    if (inlineContent) {
      editor.insertInlineContent(inlineContent);
      return true;
    }
  }

  const container = document.createElement("div");
  container.innerHTML = html;
  const source = normalizePastedPlainText(
    getPastedTablePlainText(container) ?? plainText,
  );
  if (!source) return false;

  editor.insertInlineContent(source);
  return true;
}

function splitPastedInlineContentByPlaceholders(
  content: unknown,
  placeholders: readonly PastedBlockPlaceholder[],
): PastedInlineSegment[] | null {
  if (!Array.isArray(content)) return null;

  const segments: PastedInlineSegment[] = [];
  let currentContent: InlineContent[] = [];
  let didFindPlaceholder = false;
  const flushContent = () => {
    if (currentContent.length === 0) return;
    segments.push({ content: currentContent, type: "content" });
    currentContent = [];
  };

  for (const item of content) {
    if (
      !item ||
      typeof item !== "object" ||
      !("text" in item) ||
      typeof item.text !== "string"
    ) {
      currentContent.push(item as InlineContent);
      continue;
    }

    const textItem = item as InlineContent & { text: string };
    let offset = 0;
    while (offset < textItem.text.length) {
      let markerIndex = -1;
      let markerLength = 0;
      let matchedPlaceholder: PastedBlockPlaceholder | null = null;
      for (const placeholder of placeholders) {
        for (const candidate of [
          placeholder.marker,
          placeholder.visibleMarker,
        ]) {
          if (!candidate) continue;
          const index = textItem.text.indexOf(candidate, offset);
          if (
            index !== -1 &&
            (markerIndex === -1 ||
              index < markerIndex ||
              (index === markerIndex && candidate.length > markerLength))
          ) {
            markerIndex = index;
            markerLength = candidate.length;
            matchedPlaceholder = placeholder;
          }
        }
      }

      if (!matchedPlaceholder || markerIndex === -1) {
        currentContent.push({
          ...textItem,
          text: textItem.text.slice(offset),
        });
        break;
      }

      if (markerIndex > offset) {
        currentContent.push({
          ...textItem,
          text: textItem.text.slice(offset, markerIndex),
        });
      }
      flushContent();
      segments.push({
        placeholder: matchedPlaceholder,
        type: "placeholder",
      });
      didFindPlaceholder = true;
      offset = markerIndex + markerLength;
    }
  }
  flushContent();

  return didFindPlaceholder ? segments : null;
}

function replacePastedBlockPlaceholders(
  blocks: readonly PartialBlock[],
  placeholders: readonly PastedBlockPlaceholder[],
): { blocks: PartialBlock[]; replacementCount: number } {
  let replacementCount = 0;
  const replacedBlocks = blocks.flatMap((block): PartialBlock[] => {
    const text = getPastedInlineContentText(block.content).trim();
    const placeholder = placeholders.find(
      (entry) => entry.marker === text || entry.visibleMarker === text,
    );
    if (placeholder) {
      replacementCount += 1;
      return [placeholder.block];
    }

    const replacedChildren = replacePastedBlockPlaceholders(
      block.children ?? [],
      placeholders,
    );
    replacementCount += replacedChildren.replacementCount;

    return [
      replacedChildren.replacementCount === 0
        ? block
        : { ...block, children: replacedChildren.blocks },
    ];
  });

  return { blocks: replacedBlocks, replacementCount };
}

function replaceCodeBlocksForSafePaste(
  blocks: readonly PartialBlock[],
  placeholders: PastedBlockPlaceholder[],
): PartialBlock[] {
  return blocks.map((block) => {
    if (block.type === "codeBlock") {
      const visibleMarker = `keep-notes-insert-code-${pastedCodeMarkerSessionId}-${nextPastedCodeMarkerId++}`;
      const marker = `\uE000${visibleMarker}\uE001`;
      placeholders.push({ block, marker, visibleMarker });
      return { type: "paragraph", content: marker };
    }

    const children = replaceCodeBlocksForSafePaste(
      block.children ?? [],
      placeholders,
    );
    return children.length > 0 ? { ...block, children } : block;
  });
}

function replaceCodeBlockPlaceholdersInPasteHTML(
  html: string,
  placeholders: readonly PastedBlockPlaceholder[],
): string {
  if (placeholders.length === 0) return html;

  const container = document.createElement("div");
  container.innerHTML = html;
  const placeholderByText = new Map<string, PastedBlockPlaceholder>();
  for (const placeholder of placeholders) {
    placeholderByText.set(placeholder.marker, placeholder);
    if (placeholder.visibleMarker) {
      placeholderByText.set(placeholder.visibleMarker, placeholder);
    }
  }

  const placeholderContainers = [
    ...Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-content-type="paragraph"]',
      ),
    ),
    ...Array.from(container.querySelectorAll("p")),
  ];
  for (const paragraph of placeholderContainers) {
    const placeholder = placeholderByText.get(
      paragraph.textContent?.trim() ?? "",
    );
    if (!placeholder) continue;

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    const props = placeholder.block.props;
    const language =
      props && typeof props === "object" && "language" in props
        ? String(props.language)
        : "text";
    code.dataset.language = language;
    code.textContent = getPastedInlineContentText(placeholder.block.content);
    pre.append(code);
    paragraph.replaceWith(pre);
  }

  return container.innerHTML;
}

// 标记带当前渲染进程会话 ID，允许恢复阶段安全扫描整篇文档而不会命中历史正文。
const pastedCodeMarkerSessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
let nextPastedCodeMarkerId = 0;

function restorePastedCodeBlocks(
  editor: CoreBlockNoteEditor,
  placeholders: readonly PastedBlockPlaceholder[],
): Set<string> {
  const replacements: Array<{ block: Block; depth: number }> = [];
  const walk = (blocks: readonly Block[], depth: number) => {
    for (const block of blocks) {
      if (splitPastedInlineContentByPlaceholders(block.content, placeholders)) {
        replacements.push({ block, depth });
      }
      walk(block.children, depth + 1);
    }
  };
  walk(editor.document, 0);

  const restoredMarkers = new Set<string>();
  replacements.sort((left, right) => right.depth - left.depth);

  for (const { block } of replacements) {
    const currentBlock = editor.getBlock(block.id);
    if (!currentBlock) continue;
    const segments = splitPastedInlineContentByPlaceholders(
      currentBlock.content,
      placeholders,
    );
    if (!segments) continue;

    const blockMarkers = new Set<string>();
    const replacementBlocks = segments.flatMap((segment): PartialBlock[] => {
      if (segment.type === "placeholder") {
        blockMarkers.add(segment.placeholder.marker);
        return [segment.placeholder.block];
      }
      if (getPastedInlineContentText(segment.content).length === 0) return [];

      return [
        {
          type: currentBlock.type,
          props: currentBlock.props,
          content: segment.content,
        } as PartialBlock,
      ];
    });
    if (replacementBlocks.length === 0) continue;

    const lastReplacement = replacementBlocks.at(-1)!;
    if (currentBlock.children.length > 0) {
      lastReplacement.children = currentBlock.children;
    }
    editor.replaceBlocks([currentBlock], replacementBlocks);
    for (const marker of blockMarkers) restoredMarkers.add(marker);
  }

  return restoredMarkers;
}

function replaceUnresolvedCodePlaceholdersAsText(
  editor: CoreBlockNoteEditor,
  placeholders: readonly PastedBlockPlaceholder[],
) {
  const walk = (blocks: readonly Block[]) => {
    for (const block of blocks) {
      const source = getPastedInlineContentText(block.content);
      let fallbackContent = source;
      for (const placeholder of placeholders) {
        const fallbackText = getPastedInlineContentText(
          placeholder.block.content,
        );
        fallbackContent = fallbackContent
          .replaceAll(placeholder.marker, fallbackText)
          .replaceAll(
            placeholder.visibleMarker ?? placeholder.marker,
            fallbackText,
          );
      }

      if (fallbackContent !== source) {
        editor.updateBlock(block, { content: fallbackContent });
      }
      walk(block.children);
    }
  };
  walk(editor.document);
}

function dispatchRichPaste(editor: CoreBlockNoteEditor, html: string): boolean {
  const view = editor.prosemirrorView;
  const slice = __parseFromClipboard(
    view,
    "",
    html,
    false,
    view.state.selection.$from,
  );
  if (!slice) return false;

  let pasteSlice = slice;
  const singleNode =
    slice.content.childCount === 1 ? slice.content.firstChild : null;
  if (singleNode?.type.name === "codeBlock") {
    // 单一代码块会被 ProseMirror 视为 replaceSelectionWith 的候选；增加临时兄弟块后再在同一事务删除，
    // 强制它作为当前块的同级节点插入，同时不产生额外撤销记录。
    const schema = view.state.schema;
    const codeContainerType = schema.nodes.blockContainer;
    const paragraphType = schema.nodes.paragraph;
    if (!codeContainerType || !paragraphType) return false;

    const boundaryId = `keep-notes-paste-boundary-${pastedCodeMarkerSessionId}-${nextPastedCodeMarkerId++}`;
    const codeContainer = codeContainerType.create(
      { id: `keep-notes-paste-code-${boundaryId}` },
      singleNode,
    );
    const boundaryContainer = codeContainerType.create(
      { id: boundaryId },
      paragraphType.create(),
    );
    pasteSlice = new Slice(
      Fragment.fromArray([codeContainer, boundaryContainer]),
      0,
      0,
    );

    const transaction = view.state.tr.replaceSelection(pasteSlice);
    let boundaryPos: number | null = null;
    transaction.doc.descendants((node, position) => {
      if (node.type.name === "blockContainer" && node.attrs.id === boundaryId) {
        boundaryPos = position;
        return false;
      }
      return true;
    });
    if (boundaryPos !== null) {
      transaction.delete(boundaryPos, boundaryPos + boundaryContainer.nodeSize);
    }
    view.dispatch(
      transaction
        .scrollIntoView()
        .setMeta("paste", true)
        .setMeta("uiEvent", "paste"),
    );
    return true;
  }

  view.dispatch(
    view.state.tr
      .replaceSelection(pasteSlice)
      .scrollIntoView()
      .setMeta("paste", true)
      .setMeta("uiEvent", "paste"),
  );
  return true;
}

function pasteParsedRichBlocks(
  editor: CoreBlockNoteEditor,
  blocks: readonly PartialBlock[],
) {
  const codePlaceholders: PastedBlockPlaceholder[] = [];
  const safeBlocks = replaceCodeBlocksForSafePaste(blocks, codePlaceholders);
  const safeHTML = replaceCodeBlockPlaceholdersInPasteHTML(
    // 外部 HTML 序列化会为代码块生成标准 pre/code，避免自定义 CodeMirror 节点视图的壳进入解析器。
    editor.blocksToHTMLLossy(safeBlocks),
    codePlaceholders,
  );
  // 关闭切片边界并直接替换选区，避免单一代码块被 ProseMirror 嵌套到当前段落的 children 中。
  if (
    !dispatchRichPaste(editor, `<div data-pm-slice="0 0 []">${safeHTML}</div>`)
  ) {
    // 解析失败时仍粘贴可见内容；safeHTML 已移除所有内部占位符，不会泄漏异常文案。
    editor.pasteHTML(safeHTML, true);
  }
  let pendingPlaceholders = [...codePlaceholders];
  const restorePendingPlaceholders = () => {
    if (pendingPlaceholders.length === 0) return;
    const restoredMarkers = runWithoutRichTextUndoHistory(editor, () =>
      restorePastedCodeBlocks(editor, pendingPlaceholders),
    );
    pendingPlaceholders = pendingPlaceholders.filter(
      (placeholder) => !restoredMarkers.has(placeholder.marker),
    );
  };

  try {
    restorePendingPlaceholders();
  } catch {
    // 粘贴事务仍可能持有当前块；延迟阶段会重新读取最新文档并完成恢复。
  }
  if (pendingPlaceholders.length === 0) return;

  // Electron 中自定义块的文档快照可能晚于粘贴事务更新，下一微任务再按本次唯一标记恢复。
  queueMicrotask(() => {
    try {
      restorePendingPlaceholders();
      if (pendingPlaceholders.length === 0) return;

      // 最终失败时写回用户可见的代码原文，任何分支都不能把内部占位符留在正文中。
      runWithoutRichTextUndoHistory(editor, () =>
        replaceUnresolvedCodePlaceholdersAsText(editor, pendingPlaceholders),
      );
    } catch {
      try {
        runWithoutRichTextUndoHistory(editor, () =>
          replaceUnresolvedCodePlaceholdersAsText(editor, pendingPlaceholders),
        );
      } catch {
        // 编辑器已卸载时无法再写回文档，但不能阻塞原生粘贴流程。
      }
    }
  });
}

function parseMixedPastedHTML(
  editor: CoreBlockNoteEditor,
  container: HTMLDivElement,
  tables: HTMLTableElement[],
): PartialBlock[] | null {
  const codeBlocks = Array.from(container.querySelectorAll("pre")).filter(
    (pre) => !pre.parentElement?.closest("table"),
  );
  const tablePlaceholders = tables.map((table, index) => {
    const block = parsePastedHTMLTable(editor, table);
    if (!block) return null;

    const marker = `\uE000keep-notes-table-${index}\uE001`;
    const placeholder = document.createElement("p");
    placeholder.textContent = marker;
    table.replaceWith(placeholder);
    return { block, marker };
  });
  if (tablePlaceholders.some((entry) => entry === null)) return null;

  const codePlaceholders = codeBlocks.map((pre, index) => {
    const marker = `\uE000keep-notes-code-${index}\uE001`;
    const placeholder = document.createElement("p");
    placeholder.textContent = marker;
    const block = parsePastedHTMLCodeBlock(pre);
    pre.replaceWith(placeholder);
    return { block, marker };
  });
  const placeholders = [
    ...(tablePlaceholders as PastedBlockPlaceholder[]),
    ...codePlaceholders,
  ];
  const parsedBlocks = editor.tryParseHTMLToBlocks(container.innerHTML);
  const replaced = replacePastedBlockPlaceholders(parsedBlocks, placeholders);

  return replaced.replacementCount === placeholders.length
    ? replaced.blocks
    : null;
}

function parseInternalHTMLWithCodeBlocks(
  editor: CoreBlockNoteEditor,
  container: HTMLDivElement,
): PartialBlock[] | null {
  const codeBlocks = Array.from(
    container.querySelectorAll<HTMLElement>('[data-content-type="codeBlock"]'),
  ).filter(
    (blockContent) =>
      !blockContent.parentElement?.closest('[data-content-type="codeBlock"]'),
  );
  if (codeBlocks.length === 0) {
    return editor.tryParseHTMLToBlocks(container.innerHTML);
  }

  const placeholders = codeBlocks.map((blockContent, index) => {
    const marker = `\uE000keep-notes-internal-code-${index}\uE001`;
    const placeholder = document.createElement("p");
    placeholder.textContent = marker;
    const block = parsePastedInternalHTMLCodeBlock(blockContent);
    blockContent.replaceWith(placeholder);
    return { block, marker };
  });
  const parsedBlocks = editor.tryParseHTMLToBlocks(container.innerHTML);
  const replaced = replacePastedBlockPlaceholders(parsedBlocks, placeholders);

  return replaced.replacementCount === placeholders.length
    ? replaced.blocks
    : null;
}

export function pasteExternalHTMLTables(
  editor: CoreBlockNoteEditor,
  event: ClipboardEvent,
): boolean {
  const clipboardData = event.clipboardData;
  if (!clipboardData) {
    return false;
  }

  if (isCodeMirrorPasteTarget(editor, event)) {
    // 代码块内的粘贴必须交给 CodeMirror，避免外部 HTML 先被转换成新的 BlockNote 块。
    return false;
  }

  if (clipboardData.types.includes("blocknote/html")) {
    const internalHTML = clipboardData.getData("blocknote/html");
    const externalHTML = clipboardData.getData("text/html");
    const plainText = clipboardData.getData("text/plain");
    if (!internalHTML || !externalHTML) return false;

    const internalContainer = document.createElement("div");
    internalContainer.innerHTML = internalHTML;
    const hasInternalCodeBlocks = Boolean(
      internalContainer.querySelector('[data-content-type="codeBlock"]'),
    );
    const slice = internalContainer
      .querySelector("[data-pm-slice]")
      ?.getAttribute("data-pm-slice");
    const internalContentType = internalContainer
      .querySelector("[data-content-type]")
      ?.getAttribute("data-content-type");
    const externalContainer = document.createElement("div");
    externalContainer.innerHTML = externalHTML;
    const isQuoteTarget = editor.getTextCursorPosition().block.type === "quote";
    const hasInternalTableBlock = Boolean(
      internalContainer.querySelector('[data-content-type="table"]'),
    );
    const hasInternalTableFragment = Boolean(
      internalContainer.querySelector("table"),
    );

    // 局部单元格选区会把 table/tableCell 放进 data-pm-slice 的开放祖先上下文；
    // 完整表格块则直接存在于切片内容中，不应降级成文本。
    const isTableTextSelection =
      (slice?.includes('"table"') &&
        (slice.includes('"tableCell"') || slice.includes('"tableHeader"'))) ||
      (hasInternalTableFragment && !hasInternalTableBlock);
    // 代码块内的文字选区同样携带 codeBlock 祖先，不能按完整代码块走占位恢复流程。
    const isCodeTextSelection =
      (slice?.includes('"codeBlock"') ?? false) ||
      (hasInternalCodeBlocks && !externalContainer.querySelector("pre"));
    // 列表项内的文字选区会被标记成列表块，粘贴到引用块时必须按行内内容处理。
    const isListTextSelection =
      ["bulletListItem", "numberedListItem", "checkListItem"].includes(
        internalContentType ?? "",
      ) && !externalContainer.querySelector("ul, ol, li");
    const isInlineQuotePaste =
      isQuoteTarget &&
      !externalContainer.querySelector("table, ul, ol, li, pre, blockquote");

    if (
      isTableTextSelection ||
      isCodeTextSelection ||
      isListTextSelection ||
      isInlineQuotePaste
    ) {
      // 结构化局部选区可能仍导出 table/pre 外壳，此时使用纯文本；普通行内选区则保留粗体等样式。
      return insertPastedTextContent(editor, externalHTML, plainText, {
        forcePlainText: isTableTextSelection || isCodeTextSelection,
      });
    }

    const parsedInternalBlocks = hasInternalCodeBlocks
      ? parseInternalHTMLWithCodeBlocks(editor, internalContainer)
      : null;

    // 新建标签页会先放置一个空段落作为编辑占位；整段富文本粘贴到这里时必须替换它，
    // 否则 BlockNote 默认按“在当前块后插入”处理，首个真实块前就会多出一行。
    if (
      editor.document.length === 1 &&
      isEmptyRichEditorParagraph(editor.document[0])
    ) {
      const parsedBlocks = hasInternalCodeBlocks
        ? parsedInternalBlocks
        : editor.tryParseHTMLToBlocks(
            hasInternalTableBlock ? internalHTML : externalHTML,
          );
      if (parsedBlocks && parsedBlocks.length > 0) {
        editor.replaceBlocks(editor.document, parsedBlocks);
        // 整段粘贴会替换占位段落；清掉旧选区映射，避免新文档中的行内代码继承旧编辑范围。
        clearInlineCodeEditingState(editor);
        return true;
      }
    }

    if (hasInternalCodeBlocks) {
      if (!parsedInternalBlocks || parsedInternalBlocks.length === 0) {
        return false;
      }

      // 内部 HTML 的代码块先用普通段落占位，插入后再恢复，避免 BlockNote 的默认 HTML 空白规则压平换行。
      pasteParsedRichBlocks(editor, parsedInternalBlocks);
      clearInlineCodeEditingState(editor);
      return true;
    }

    // 整表或单元格选区保留原生 MIME，由 BlockNote 还原表格结构和光标语义。
    return false;
  }

  if (!clipboardData.types.includes("text/html")) {
    return false;
  }

  const externalHTML = clipboardData.getData("text/html");
  const fragment = getPastedHTMLFragment(externalHTML);
  const normalizedExternalHTML = normalizePastedTableFragmentHtml(externalHTML);
  const normalizedFragmentHTML = normalizePastedTableFragmentHtml(
    fragment.html,
  );
  const completeContainer = document.createElement("div");
  completeContainer.innerHTML = normalizedExternalHTML;
  const container = document.createElement("div");
  container.innerHTML = normalizedFragmentHTML;
  const completeHasStructuredBlock = Boolean(
    completeContainer.querySelector("table, pre"),
  );
  const fragmentHasStructuredBlock = Boolean(
    container.querySelector("table, pre"),
  );
  if (
    fragment.hasExplicitBoundaries &&
    completeHasStructuredBlock &&
    !fragmentHasStructuredBlock
  ) {
    // Chromium/Office 会保留完整祖先 HTML，但 StartFragment/EndFragment 才是用户真正选择的单元格或代码文字。
    return insertPastedTextContent(
      editor,
      normalizedFragmentHTML,
      clipboardData.getData("text/plain"),
    );
  }
  const tables = Array.from(container.querySelectorAll("table")).filter(
    (table) => !table.parentElement?.closest("table"),
  );
  const codeBlocks = Array.from(container.querySelectorAll("pre")).filter(
    (pre) => !pre.parentElement?.closest("table"),
  );
  if (tables.length === 0 && codeBlocks.length === 0) {
    const plainText = clipboardData.getData("text/plain");
    const isRichClipboard = externalHTML !== plainText;
    if (
      isRichClipboard &&
      editor.document.length === 1 &&
      isEmptyRichEditorParagraph(editor.document[0])
    ) {
      const parsedBlocks = editor.tryParseHTMLToBlocks(container.innerHTML);
      if (parsedBlocks.length > 0) {
        // 没有 blocknote/html 时，空标签页也要直接按标准 HTML 替换占位段落，保留标题、列表和行内样式。
        editor.replaceBlocks(editor.document, parsedBlocks);
        clearInlineCodeEditingState(editor);
        return true;
      }
    }
    return false;
  }

  const mixedBlocks = parseMixedPastedHTML(editor, container, tables);
  if (!mixedBlocks) return false;

  if (
    editor.document.length === 1 &&
    isEmptyRichEditorParagraph(editor.document[0])
  ) {
    // 空白占位段落直接替换，避免单一代码块被当作占位段落的子块插入。
    editor.replaceBlocks(editor.document, mixedBlocks);
    clearInlineCodeEditingState(editor);
    return true;
  }

  // 整段富文本统一转换为 BlockNote 块，保留表格前后的标题、段落和列表顺序。
  pasteParsedRichBlocks(editor, mixedBlocks);
  return true;
}

export function pasteMarkupAsPlainText(
  editor: CoreBlockNoteEditor,
  event: ClipboardEvent,
): boolean {
  const target = event.target instanceof Element ? event.target : null;
  if (
    target?.closest(".editor-code-block__codemirror, .cm-editor, .cm-content")
  ) {
    // 代码块必须由 CodeMirror 原生处理粘贴，才能完整保留多行文本与缩进。
    return false;
  }

  const source = event.clipboardData?.getData("text/plain");
  if (!source) return false;

  const codeMirrorView =
    findCodeMirrorView(target?.closest(".editor-code-block-shell") ?? null) ??
    findSelectedCodeMirrorView(editor);
  if (codeMirrorView) {
    // 新建代码块后焦点仍可能停在富文本根节点，普通多行文本也必须直接写入 CodeMirror，避免换行被 ProseMirror 压平。
    event.preventDefault();
    event.stopImmediatePropagation();
    const selection = codeMirrorView.state.selection.main;
    codeMirrorView.focus();
    codeMirrorView.dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert: source,
      },
      selection: {
        anchor: selection.from + source.length,
      },
      scrollIntoView: true,
    });
    return true;
  }

  const externalHTML = event.clipboardData?.types.includes("text/html")
    ? event.clipboardData.getData("text/html")
    : "";
  if (externalHTML && externalHTML !== source) {
    // HTML 与纯文本不一致时说明剪贴板包含真正的富文本，不能按源码文本拦截。
    return false;
  }

  if (!/<\/?[A-Za-z][^>]*>/.test(source)) return false;

  // 源码标签按普通文案写入同一段落，避免每个源码行被序列化成独立 Markdown 段落。
  event.preventDefault();
  event.stopImmediatePropagation();
  // 直接调用编辑命令而不重入 handlePaste，防止同一份剪贴板内容被插入两次。
  editor.insertInlineContent(source);
  return true;
}

function findSelectionTableDepth(position: Selection["$from"]): number | null {
  for (let depth = position.depth; depth > 0; depth -= 1) {
    const node = position.node(depth);
    if (node.type.name === "table" || node.type.spec.tableRole === "table") {
      return depth;
    }
  }
  return null;
}

function getSharedSelectionTable(selection: Selection): {
  blockId: string | null;
  node: ProseMirrorNode;
  start: number;
} | null {
  const fromDepth = findSelectionTableDepth(selection.$from);
  const toDepth = findSelectionTableDepth(selection.$to);
  if (fromDepth === null || toDepth === null) return null;

  const fromStart = selection.$from.before(fromDepth);
  const toStart = selection.$to.before(toDepth);
  const fromTable = selection.$from.node(fromDepth);
  if (fromStart !== toStart || fromTable !== selection.$to.node(toDepth)) {
    return null;
  }

  let blockId: string | null = null;
  for (let depth = fromDepth - 1; depth > 0; depth -= 1) {
    const node = selection.$from.node(depth);
    if (
      node.type.name === "blockContainer" &&
      typeof node.attrs.id === "string"
    ) {
      blockId = node.attrs.id;
      break;
    }
  }
  return { blockId, node: fromTable, start: fromStart };
}

function getCompleteTableSelectionBlock(
  editor: CoreBlockNoteEditor,
  selection: Selection,
): Block | null {
  const table = getSharedSelectionTable(selection);
  if (!table) return null;

  let totalCellCount = 0;
  let firstTextPosition: number | null = null;
  let lastTextPosition: number | null = null;
  table.node.descendants((node, position) => {
    if (
      node.type.name === "tableCell" ||
      node.type.name === "tableHeader" ||
      node.type.spec.tableRole === "cell" ||
      node.type.spec.tableRole === "header_cell"
    ) {
      totalCellCount += 1;
    }
    if (!node.isText) return true;

    const absolutePosition = table.start + 1 + position;
    firstTextPosition ??= absolutePosition;
    lastTextPosition = absolutePosition + node.nodeSize;
    return true;
  });
  if (totalCellCount === 0) return null;

  let isComplete = false;
  if (selection instanceof CellSelection) {
    let selectedCellCount = 0;
    selection.forEachCell(() => {
      selectedCellCount += 1;
    });
    isComplete = selectedCellCount === totalCellCount;
  } else {
    isComplete =
      firstTextPosition !== null &&
      lastTextPosition !== null &&
      selection.from <= firstTextPosition &&
      selection.to >= lastTextPosition;
  }
  if (!isComplete || !table.blockId) return null;

  const block = editor.getBlock(table.blockId);
  return block?.type === "table" ? block : null;
}

function getCodeBlockDepth(position: Selection["$from"]): number | null {
  for (let depth = position.depth; depth > 0; depth -= 1) {
    const node = position.node(depth);
    if (node.type.name === "codeBlock") return depth;
  }
  return null;
}

function isSelectionInsideSingleCodeBlock(selection: Selection): boolean {
  const fromDepth = getCodeBlockDepth(selection.$from);
  const toDepth = getCodeBlockDepth(selection.$to);
  if (fromDepth === null || toDepth === null) return false;

  return (
    selection.$from.before(fromDepth) === selection.$to.before(toDepth) &&
    selection.$from.node(fromDepth) === selection.$to.node(toDepth)
  );
}

function selectionContainsCodeBlock(selection: Selection): boolean {
  let containsCodeBlock = false;
  selection.$from.doc.nodesBetween(selection.from, selection.to, (node) => {
    if (node.type.name === "codeBlock") {
      containsCodeBlock = true;
      return false;
    }
    return !containsCodeBlock;
  });
  return containsCodeBlock;
}

function getNativeRichTextSelection(
  editor: CoreBlockNoteEditor,
): { html: string; text: string } | null {
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const editorElement = editor.prosemirrorView.dom;
  const anchorElement = getElementFromEventTarget(selection.anchorNode);
  const focusElement = getElementFromEventTarget(selection.focusNode);
  const anchorCodeMirror = anchorElement?.closest(
    ".editor-code-block__codemirror, .cm-editor, .cm-content",
  );
  const focusCodeMirror = focusElement?.closest(
    ".editor-code-block__codemirror, .cm-editor, .cm-content",
  );
  if (
    !selection.anchorNode ||
    !selection.focusNode ||
    !editorElement.contains(selection.anchorNode) ||
    !editorElement.contains(selection.focusNode) ||
    (anchorCodeMirror &&
      focusCodeMirror &&
      anchorCodeMirror === focusCodeMirror)
  ) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!editorElement.contains(range.commonAncestorContainer)) return null;

  const container = document.createElement("div");
  container.append(range.cloneContents());
  const html = normalizeNativeRichTextSelectionHtml(
    selection,
    range,
    container,
  );
  const text = selection.toString();
  return html && text ? { html, text } : null;
}

function normalizeTableFragmentHtml(container: HTMLElement): string | null {
  if (container.querySelector("table")) return container.innerHTML;

  const rows = Array.from(container.querySelectorAll("tr"));
  if (rows.length > 0) {
    const table = document.createElement("table");
    table.innerHTML = container.innerHTML;
    return table.outerHTML;
  }

  const cells = Array.from(container.querySelectorAll("td, th"));
  if (cells.length === 0) return null;

  const table = document.createElement("table");
  const row = document.createElement("tr");
  row.append(...cells);
  table.append(row);
  return table.outerHTML;
}

function normalizePastedTableFragmentHtml(source: string): string {
  const container = document.createElement("div");
  container.innerHTML = source;
  return normalizeTableFragmentHtml(container) ?? source;
}

function normalizeNativeCodeMirrorFragments(container: HTMLDivElement): void {
  const codeMirrorContents = Array.from(
    container.querySelectorAll<HTMLElement>(".cm-content"),
  );
  for (const content of codeMirrorContents) {
    const shell = content.closest<HTMLElement>(".editor-code-block-shell");
    const codeMirrorRoot =
      shell ??
      content.closest<HTMLElement>(
        ".editor-code-block__codemirror, .cm-editor",
      ) ??
      content;
    const lines = Array.from(content.querySelectorAll<HTMLElement>(".cm-line"));
    const codeText = (
      lines.length > 0
        ? lines.map((line) => line.textContent ?? "")
        : [content.textContent ?? ""]
    ).join("\n");
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    const language = shell?.dataset.language;
    if (language) code.dataset.language = language;
    code.textContent = codeText;
    pre.append(code);
    codeMirrorRoot.replaceWith(pre);
  }
}

function normalizeNativeRichTextSelectionHtml(
  selection: globalThis.Selection,
  range: Range,
  container: HTMLDivElement,
): string {
  // CodeMirror 的 DOM 不是 BlockNote 的标准 HTML，先转换为外部可解析的 pre/code。
  normalizeNativeCodeMirrorFragments(container);
  return normalizeNativeTableSelectionHtml(selection, range, container);
}

function normalizeNativeTableSelectionHtml(
  selection: globalThis.Selection,
  range: Range,
  container: HTMLDivElement,
): string {
  const anchorTable = getElementFromEventTarget(selection.anchorNode)?.closest(
    "table",
  );
  const focusTable = getElementFromEventTarget(selection.focusNode)?.closest(
    "table",
  );
  if (!anchorTable || anchorTable !== focusTable) return container.innerHTML;

  if (
    normalizeNativeSelectionText(range.toString()) ===
    normalizeNativeSelectionText(anchorTable.textContent ?? "")
  ) {
    // 浏览器从表格首个单元格拖到末尾时，cloneContents 只会返回 tr；完整表格复制应补回 table 外壳。
    return anchorTable.outerHTML;
  }

  // 部分表格选区也可能只返回 tr/td 片段，补一个合法 table 祖先，避免粘贴解析器把它降级成普通文本。
  return normalizeTableFragmentHtml(container) ?? container.innerHTML;
}

function normalizeNativeSelectionText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function getCurrentEditorTextLength(editor: CoreBlockNoteEditor): number {
  try {
    // 读取当前 ProseMirror 文档而不是旧 Markdown 快照，确保“空标签页粘贴长文档”也进入大文档降频策略。
    return editor.prosemirrorView.state.doc.textContent.length;
  } catch {
    return 0;
  }
}

export function copyMarkupSelectionAsPlainText(
  editor: CoreBlockNoteEditor,
  event: ClipboardEvent,
): boolean {
  const selection = editor.prosemirrorView.state.selection;
  const target = getElementFromEventTarget(event.target);
  const isCodeMirrorTarget = Boolean(
    target?.closest(".editor-code-block__codemirror, .cm-editor, .cm-content"),
  );
  if (!event.clipboardData) return false;
  const hasRichClipboard = Array.from(event.clipboardData.types ?? []).some(
    (type) => type === "blocknote/html" || type === "text/html",
  );
  if (
    !selection.empty &&
    selectionContainsCodeBlock(selection) &&
    !isSelectionInsideSingleCodeBlock(selection) &&
    (isCodeMirrorTarget || !hasRichClipboard)
  ) {
    // 代码块 NodeView 设置了 contenteditable=false，BlockNote 会跳过这类 copy 事件。
    // 跨块选区仍应使用 ProseMirror 逻辑选区导出完整的标题、列表、表格和代码块格式。
    const { clipboardHTML, externalHTML, markdown } = selectedFragmentToHTML(
      editor.prosemirrorView,
      editor,
    );
    event.preventDefault();
    event.clipboardData.clearData();
    event.clipboardData.setData("blocknote/html", clipboardHTML);
    event.clipboardData.setData("text/html", externalHTML);
    event.clipboardData.setData("text/plain", markdown);
    return true;
  }
  if (isCodeMirrorTarget && isSelectionInsideSingleCodeBlock(selection)) {
    // 代码块由 CodeMirror 负责复制，避免富文本编辑器覆盖它的纯文本内容。
    return false;
  }

  if (selection.empty) {
    const nativeSelection = getNativeRichTextSelection(editor);
    if (!nativeSelection) return false;

    // 逻辑选区为空时 BlockNote 会让浏览器处理复制；这里把真实 DOM 选区补写为标准富文本 MIME。
    event.preventDefault();
    event.clipboardData.clearData();
    event.clipboardData.setData("text/html", nativeSelection.html);
    event.clipboardData.setData("text/plain", nativeSelection.text);
    return true;
  }

  const completeTableBlock = getCompleteTableSelectionBlock(editor, selection);
  if (completeTableBlock) {
    // BlockNote 无法导出跨越全部单元格文字的选区；改为重新序列化整张表，并移除失效的内部切片 MIME。
    event.preventDefault();
    event.clipboardData.clearData();
    event.clipboardData.setData(
      "text/html",
      editor.blocksToHTMLLossy([completeTableBlock]),
    );
    event.clipboardData.setData(
      "text/plain",
      editor.blocksToMarkdownLossy([completeTableBlock]),
    );
    return true;
  }

  const source = editor.prosemirrorView.state.doc.textBetween(
    selection.from,
    selection.to,
    "\n",
    "\n",
  );
  const containsMarkup = /<\/?[A-Za-z][^>]*>/.test(source);
  const containsBracedSource = source.includes("{") && source.includes("}");
  if (!source.includes("\n") || (!containsMarkup && !containsBracedSource)) {
    return false;
  }

  // 复制事件在冒泡阶段处理，BlockNote 已先写入 blocknote/html 和 text/html；这里只修正纯文本，保留富文本 MIME。
  event.clipboardData.setData("text/plain", source);
  return true;
}

interface RichEditorSelectionTarget {
  prosemirrorView?: {
    state: {
      doc: ProseMirrorNode;
      tr: {
        setSelection: (selection: AllSelection) => {
          scrollIntoView?: () => unknown;
        };
      };
    };
    dispatch: (transaction: unknown) => void;
    focus?: () => void;
  };
}

interface RichEditorSelectAllEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
  target: EventTarget | null;
}

interface RichEditorHeadingShortcutEvent {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  preventDefault: () => void;
  shiftKey?: boolean;
  stopPropagation: () => void;
}

interface OutlineNavigationCursorEditor {
  getBlock: (blockId: string) => unknown;
  focus: () => void;
  setTextCursorPosition: (blockId: string, placement: "start") => void;
}

interface EditorOutlineSnapshot {
  headings: Array<{ id: string; text: string; level: number }>;
  activeHeadingIdByBlockId: ReadonlyMap<string, string | null>;
}

interface PendingOutlineScrollActivation {
  owner: RichPaneScrollOwner;
}

interface SerializeChangeOptions {
  reconcileSource?: boolean;
}

const EMPTY_EDITOR_OUTLINE_SNAPSHOT: EditorOutlineSnapshot = {
  headings: [],
  activeHeadingIdByBlockId: new Map(),
};

interface UploadedImageAttachmentContext {
  getWorkspaceRootPath: () => string | null;
  getMarkdownFilePath: () => string | null;
  saveImageAttachment: typeof window.electronAPI.saveImageAttachment;
  moveCursorAfterUpload: () => void;
}

export interface RichEditorBinding {
  groupId: string;
  tabId: string;
  paneKey: RichPaneKey;
  path: string;
}

export interface RichBlockNoteRuntime extends RichDocumentRuntime {
  editor: CoreBlockNoteEditor;
  previewCache: RichPreviewCache;
  focusAt: (anchor: RichPreviewAnchor | null) => void;
  readViewState: () => Pick<
    RichPaneViewState,
    | "scrollTop"
    | "selection"
    | "topCodeLine"
    | "topCodeLineOffset"
    | "topBlockId"
    | "topBlockOffset"
    | "topBlockRatio"
  >;
  restoreViewState: (state: RichPaneViewState) => void;
  scrollToBlock: (blockId: string) => boolean;
}

export interface RichEditorSessionController {
  path: string;
  getActiveBinding: () => RichEditorBinding | null;
  getBoundTabIds: () => string[];
  onFileDrop: (
    filePath: string,
    binding: RichEditorBinding,
  ) => Promise<void> | void;
  onMarkdownChange: (content: string) => void;
  onWordCountChange: (count: number) => void;
  onParseStateChange: (message: string | null) => void;
  onRuntimeReady: (runtime: RichBlockNoteRuntime) => () => void;
}

interface BlockNoteEditorInnerProps {
  controller: RichEditorSessionController;
  content: string;
  editorOwnerKey: string;
  path: string | null;
  reloadKey: number;
  surface?: HTMLElement;
}

interface MountedBlockNoteEditorProps extends Omit<
  BlockNoteEditorInnerProps,
  "editorOwnerKey"
> {
  editor: CoreBlockNoteEditor;
}

interface BlockNoteEditorSessionProps {
  controller: RichEditorSessionController;
  content: string;
  reloadKey: number;
  surface: HTMLElement;
}

function toScrollOwner(binding: RichEditorBinding): RichPaneScrollOwner {
  return {
    groupId: binding.groupId,
    tabId: binding.tabId,
    paneKey: binding.paneKey,
    path: normalizeRichDocumentPath(binding.path),
  };
}

function getActiveScrollOwner(
  path: string | null,
  state: EditorState,
): RichPaneScrollOwner | null {
  if (!path) return null;

  const normalizedPath = normalizeRichDocumentPath(path);
  const group = state.panelGroups.find(
    (candidate) => candidate.id === state.activeGroupId,
  );
  const tab = group?.tabs.find(
    (candidate) => candidate.id === group.activeTabId,
  );
  if (
    !group ||
    tab?.mode !== "rich" ||
    !matchesEditorDocumentPath(tab, normalizedPath)
  ) {
    return null;
  }

  return {
    groupId: group.id,
    tabId: tab.id,
    paneKey: toRichPaneKey(group.id, tab.id),
    path: normalizedPath,
  };
}

function persistRichPaneScroll(
  owner: RichPaneScrollOwner,
  scrollTop: number,
): void {
  const store = useEditorStore.getState();
  const tab = store.panelGroups
    .find((group) => group.id === owner.groupId)
    ?.tabs.find((candidate) => candidate.id === owner.tabId);
  if (!tab) {
    // close 通知发生在 store mutation 后；仍执行一次 no-op-safe flush 以取消旧 timer。
    store.setTabScrollTop(owner.groupId, owner.tabId, scrollTop);
    return;
  }
  if (!matchesEditorDocumentPath(tab, owner.path)) {
    return;
  }

  store.setTabScrollTop(owner.groupId, owner.tabId, scrollTop);
}

const MARKDOWN_PARSER_VERSION = "blocknote-v11";

export function getMarkdownParserCacheVersion(reloadKey: number) {
  return `${MARKDOWN_PARSER_VERSION}:${reloadKey}`;
}

export function resolveSerializedMarkdownChange(
  source: string,
  baseline: string,
  serialized: string,
): string | null {
  const markdown = preserveMarkdownSource(source, baseline, serialized);
  return markdownEquals(markdown, source) ? null : markdown;
}

const INLINE_CODE_LABEL = "Inline code (persists in markdown)";
const INLINE_CODE_MARKDOWN_EXAMPLE = "`code`";
const INLINE_CODE_MARKDOWN_SELECTION = /^`([^`\n]+)`$/;

export const richEditorDefaultUIProps = {
  sideMenu: false,
} as const;

function EditorSideMenu(props: ComponentProps<typeof SideMenu>) {
  const editor = useBlockNoteEditor();
  const sideMenu = editor.getExtension(SideMenuExtension);
  const block = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state) => state?.block,
  });
  const quoteHasChildren = block?.type === "quote" && block.children.length > 0;

  return (
    <div
      className="editor-side-menu"
      data-quote-has-children={quoteHasChildren ? "true" : undefined}
      onMouseEnter={() => {
        // 鼠标跨过引用线与菜单之间的安全间距时，保持菜单绑定在父引用上。
        if (quoteHasChildren) sideMenu?.freezeMenu();
      }}
      onMouseLeave={(event) => {
        if (!quoteHasChildren) return;
        const nextTarget = event.relatedTarget;
        if (
          nextTarget instanceof Element &&
          nextTarget.closest('[role="menu"]')
        ) {
          return;
        }
        sideMenu?.unfreezeMenu();
      }}
    >
      <SideMenu {...props} />
    </div>
  );
}

export interface RichEditorSelectionDragBounds {
  bottom: number;
  left: number;
  top: number;
}

export interface RichEditorSelectionDragPointer {
  buttons: number;
  clientX: number;
  clientY: number;
}

export const RICH_EDITOR_SELECTION_DRAG_LOCK_CLASS =
  "rich-editor-selection-drag-locked";

export function shouldPreventRichEditorGutterSelectionDrag(
  buttons: number,
  clientX: number,
  clientY: number,
  bounds: RichEditorSelectionDragBounds | null,
) {
  return Boolean(
    buttons === 1 &&
    bounds &&
    clientX < bounds.left &&
    clientY >= bounds.top &&
    clientY <= bounds.bottom,
  );
}

export function getRichEditorInlineContentFromTarget(
  target: EventTarget | null,
) {
  const targetElement = getElementFromEventTarget(target);
  const blockContent = targetElement?.closest(".bn-block-content");
  const inlineContent =
    targetElement?.closest(".bn-inline-content") ??
    blockContent?.querySelector(".bn-inline-content");

  return inlineContent instanceof HTMLElement ? inlineContent : null;
}

export function isSelectionStartingAtRichEditorTextStart(
  selection: Selection,
  doc: ProseMirrorNode,
) {
  if (selection.empty) return false;

  const selectedText = doc.textBetween(
    selection.from,
    selection.to,
    "\n",
    "\n",
  );
  if (!selectedText) return false;

  return doc.textBetween(0, selection.from, "", "\n").length === 0;
}

export function shouldRejectRichEditorGutterSelectionTransaction(
  transaction: Pick<
    Transaction,
    "doc" | "docChanged" | "selection" | "selectionSet"
  >,
  pointer: RichEditorSelectionDragPointer | null,
  bounds: RichEditorSelectionDragBounds | null,
) {
  return Boolean(
    transaction.selectionSet &&
    !transaction.docChanged &&
    isSelectionStartingAtRichEditorTextStart(
      transaction.selection,
      transaction.doc,
    ) &&
    pointer &&
    shouldPreventRichEditorGutterSelectionDrag(
      pointer.buttons,
      pointer.clientX,
      pointer.clientY,
      bounds,
    ),
  );
}

export function createRichEditorSelectionDragGuardPlugin(
  readDragState: () => {
    bounds: RichEditorSelectionDragBounds | null;
    pointer: RichEditorSelectionDragPointer | null;
  },
) {
  const key = new PluginKey("keepNotesRichEditorSelectionDragGuard");
  const plugin = new Plugin({
    key,
    filterTransaction: (transaction) => {
      const { bounds, pointer } = readDragState();
      return !shouldRejectRichEditorGutterSelectionTransaction(
        transaction,
        pointer,
        bounds,
      );
    },
  });

  return plugin;
}

export function unregisterRichEditorSelectionDragGuardPlugin(
  editor: CoreBlockNoteEditor,
  plugin: Plugin,
) {
  const view = editor.prosemirrorView;
  const plugins = view.state.plugins.filter(
    (registeredPlugin) =>
      registeredPlugin !== plugin && registeredPlugin.key !== plugin.key,
  );
  if (plugins.length === view.state.plugins.length) return;

  // 按插件实例与完整 key 精确重配，避免热更新或 StrictMode 清理后重复注册。
  view.updateState(view.state.reconfigure({ plugins }));
}

export function registerRichEditorSelectionDragGuardPlugin(
  editor: CoreBlockNoteEditor,
  plugin: Plugin,
) {
  const view = editor.prosemirrorView;
  view.updateState(
    view.state.reconfigure({ plugins: [...view.state.plugins, plugin] }),
  );
}

export function EditorSideMenuController() {
  return <SideMenuController sideMenu={EditorSideMenu} />;
}

function applyInlineCodeStyle(editor: CoreBlockNoteEditor) {
  const view = editor.prosemirrorView;
  const { state, dispatch } = view;
  const { from, to, empty } = state.selection;

  if (!empty) {
    const selectedText = state.doc.textBetween(from, to, "\n", "\n");
    const match = selectedText.match(INLINE_CODE_MARKDOWN_SELECTION);
    const codeMark = state.schema.marks.code;

    if (match && codeMark) {
      const codeText = match[1] ?? "";

      // 选区是 Markdown 行内代码语法时，去掉反引号后再写入 code mark。
      dispatch(
        state.tr
          .replaceWith(
            from,
            to,
            state.schema.text(codeText, [codeMark.create()]),
          )
          .scrollIntoView(),
      );
      editor.focus();
      return;
    }
  }

  editor.focus();
  editor.toggleStyles({ code: true });
}

function InlineCodeStyleButton() {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor();
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (
        !currentEditor.isEditable ||
        !("code" in currentEditor.schema.styleSchema) ||
        !(
          currentEditor.getSelection()?.blocks ?? [
            currentEditor.getTextCursorPosition().block,
          ]
        ).find((block) => block.content !== undefined)
      ) {
        return undefined;
      }

      return { active: "code" in currentEditor.getActiveStyles() };
    },
  });

  if (state === undefined) {
    return null;
  }

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      data-test="code"
      icon={<CodeXml size={18} strokeWidth={2} />}
      isSelected={state.active}
      label={INLINE_CODE_LABEL}
      mainTooltip={INLINE_CODE_LABEL}
      secondaryTooltip={INLINE_CODE_MARKDOWN_EXAMPLE}
      onClick={() => applyInlineCodeStyle(editor)}
    />
  );
}

function EditorFormattingToolbarContent(props: FormattingToolbarProps) {
  const items = getFormattingToolbarItems(props.blockTypeSelectItems);
  const strikeIndex = items.findIndex(
    (item) => item.key === "strikeStyleButton",
  );
  const inlineCodeButton = <InlineCodeStyleButton key="codeStyleButton" />;

  if (strikeIndex === -1) {
    return (
      <FormattingToolbar {...props}>
        {items}
        {inlineCodeButton}
      </FormattingToolbar>
    );
  }

  return (
    <FormattingToolbar {...props}>
      {items.slice(0, strikeIndex + 1)}
      {inlineCodeButton}
      {items.slice(strikeIndex + 1)}
    </FormattingToolbar>
  );
}

function isFormattingToolbarSelectionSafe(selection: Selection) {
  return !(
    selection instanceof TextSelection &&
    (!selection.$from.parent.inlineContent ||
      !selection.$to.parent.inlineContent)
  );
}

export function EditorFormattingToolbar() {
  const editor = useBlockNoteEditor();
  const selectionIsSafe = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) =>
      isFormattingToolbarSelectionSafe(
        currentEditor.prosemirrorState.selection,
      ),
  });

  // BlockNote 0.51 的表格按钮会把 blockGroup 边界再减一并 resolve，异常选区期间不渲染工具栏。
  if (!selectionIsSafe) return null;

  return (
    <FormattingToolbarController
      formattingToolbar={EditorFormattingToolbarContent}
    />
  );
}

function isSelectAllShortcut(event: RichEditorSelectAllEvent) {
  return (
    event.key.toLowerCase() === "a" &&
    (event.metaKey || event.ctrlKey) &&
    !event.altKey
  );
}

function getHeadingShortcutLevel(event: RichEditorHeadingShortcutEvent) {
  if (event.altKey || event.shiftKey) return null;
  if (!event.metaKey && !event.ctrlKey) return null;

  const level = Number(event.key);
  if (!Number.isInteger(level) || level < 1 || level > 6) return null;

  return level;
}

function getElementFromEventTarget(target: EventTarget | null) {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function getCodeElementFromSelectionRoot(root: Element | null) {
  const selection = window.getSelection?.();
  const anchorNode = selection?.anchorNode;
  const anchorElement =
    anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;

  return (
    root?.querySelector<HTMLElement>(".editor-code-block__content") ??
    anchorElement
      ?.closest(".editor-code-block-shell")
      ?.querySelector<HTMLElement>(".editor-code-block__content") ??
    null
  );
}

function createBlockIdSelector(blockId: string) {
  const escapedBlockId = blockId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `[data-node-type="blockOuter"][data-id="${escapedBlockId}"]`;
}

const LIVE_EDITOR_BLOCK_SELECTOR = '[data-node-type="blockOuter"][data-id]';
const OUTLINE_ACTIVATION_VIEWPORT_RATIO = 0.25;
const OUTLINE_ACTIVATION_MIN_OFFSET = 24;

function isEmptyRichEditorParagraph(block: Block | undefined) {
  return (
    block?.type === "paragraph" &&
    Array.isArray(block.content) &&
    block.content.length === 0 &&
    block.children.length === 0
  );
}

export function readRichEditorDraggedBlockIds(
  editor: CoreBlockNoteEditor,
): string[] {
  const selection = editor.prosemirrorState.selection;
  if ("node" in selection) {
    const blockId = selection.node.attrs.id;
    return typeof blockId === "string" ? [blockId] : [];
  }

  const selectedBlocks = editor.getSelection()?.blocks;
  if (selectedBlocks?.length) {
    return selectedBlocks.map((block) => block.id);
  }

  return [];
}

export function moveRichEditorBlocksToDocumentEnd(
  editor: CoreBlockNoteEditor,
  draggedBlockIds: string[],
) {
  const draggedBlockIdSet = new Set(draggedBlockIds);
  const draggedBlocks = draggedBlockIds
    .map((blockId) => editor.getBlock(blockId))
    .filter((block): block is Block => block !== undefined);
  if (draggedBlocks.length === 0) return false;

  const documentBeforeMove = editor.document;
  const lastDraggedBlockIndex = documentBeforeMove.findLastIndex((block) =>
    draggedBlockIdSet.has(block.id),
  );
  const draggedBlocksAlreadyAtEnd = documentBeforeMove
    .slice(lastDraggedBlockIndex + 1)
    .every(
      (block) =>
        draggedBlockIdSet.has(block.id) || isEmptyRichEditorParagraph(block),
    );

  editor.transact((transaction) => {
    const trailingParagraphs: Block[] = [];
    for (let index = editor.document.length - 1; index >= 0; index -= 1) {
      const block = editor.document[index];
      if (
        draggedBlockIdSet.has(block.id) ||
        !isEmptyRichEditorParagraph(block)
      ) {
        break;
      }
      trailingParagraphs.unshift(block);
    }
    if (trailingParagraphs.length > 0) {
      editor.removeBlocks(trailingParagraphs);
    }

    const referenceBlock = editor.document.findLast(
      (block) => !draggedBlockIdSet.has(block.id),
    );
    let movedBlocks = draggedBlocks;
    if (referenceBlock) {
      // 末尾 drop 由应用独占处理，原块先删除再插入，避免 ProseMirror 再粘贴一份拖拽切片。
      editor.removeBlocks(draggedBlocks);
      movedBlocks = editor.insertBlocks(draggedBlocks, referenceBlock, "after");
    }

    if (draggedBlocksAlreadyAtEnd) {
      const firstMovedBlock = movedBlocks[0] ?? editor.document.at(-1);
      if (firstMovedBlock) {
        // 以硬换行落实虚拟末尾块，既让块真实下移，也让源码用 <br> 保留该位置供重新打开。
        editor.insertBlocks(
          [{ type: "paragraph", content: "\n" }],
          firstMovedBlock,
          "before",
        );
      }
    }

    const lastMovedBlock = movedBlocks.at(-1);
    if (lastMovedBlock) {
      const movedBlockPosition = getNodeById(
        lastMovedBlock.id,
        transaction.doc,
      )?.posBeforeNode;
      if (movedBlockPosition !== undefined) {
        transaction.setSelection(
          NodeSelection.create(transaction.doc, movedBlockPosition),
        );
      }
    }
  });

  return true;
}

function isRichEditorDocumentEndDrag(
  editor: CoreBlockNoteEditor,
  event: React.DragEvent,
) {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest(".bn-trailing-block")) return true;

  const lastBlock = editor.document.at(-1);
  if (!lastBlock) return false;

  const lastBlockElement = findEditorBlockElement(
    editor.prosemirrorView.dom,
    lastBlock.id,
  );
  const bounds = lastBlockElement?.getBoundingClientRect();
  return Boolean(bounds && bounds.height > 0 && event.clientY >= bounds.bottom);
}

function createEditorOutlineSnapshot(blocks: Block[]): EditorOutlineSnapshot {
  const headings: EditorOutlineSnapshot["headings"] = [];
  const activeHeadingIdByBlockId = new Map<string, string | null>();
  let activeHeadingId: string | null = null;

  const walk = (children: Block[]) => {
    for (const block of children) {
      if (block.type === "heading") {
        activeHeadingId = block.id;
        const text =
          (block.content as InlineContent[])
            ?.map((content) => (content.type === "text" ? content.text : ""))
            .join("") ?? "";
        headings.push({
          id: block.id,
          text,
          level: block.props.level ?? 1,
        });
      }

      // 滚动时只需按定位块 ID 做 O(1) 查询，不再遍历标题或读取额外布局。
      activeHeadingIdByBlockId.set(block.id, activeHeadingId);
      if (block.children?.length) walk(block.children);
    }
  };

  walk(blocks);
  return { activeHeadingIdByBlockId, headings };
}

function updateActiveEditorOutline(
  editor: CoreBlockNoteEditor,
  controller: RichEditorSessionController,
): void {
  if (!controller.getActiveBinding()) return;

  // 粘贴会同步替换编辑器文档；在粘贴处理器返回前写入大纲，避免等待空闲任务或切换标签页才刷新。
  const { headings } = createEditorOutlineSnapshot(editor.document);
  useEditorStore
    .getState()
    .setOutlineHeadingsForPath(controller.path, headings);
}

function isSameOutlineScrollOwner(
  first: RichPaneScrollOwner,
  second: RichPaneScrollOwner,
): boolean {
  return (
    first.groupId === second.groupId &&
    first.tabId === second.tabId &&
    first.paneKey === second.paneKey &&
    first.path === second.path
  );
}

function findEditorBlockElement(root: Element | null, blockId: string) {
  return (
    root?.querySelector<HTMLElement>(createBlockIdSelector(blockId)) ?? null
  );
}

function readLiveEditorViewportAnchor(
  container: HTMLElement,
  root: HTMLElement | null,
) {
  const ownerDocument = container.ownerDocument;
  if (root && typeof ownerDocument.elementFromPoint === "function") {
    const containerBounds = container.getBoundingClientRect();
    const rootBounds = root.getBoundingClientRect();
    const contentLeft = Math.max(containerBounds.left, rootBounds.left);
    const contentRight = Math.min(containerBounds.right, rootBounds.right);
    // 探测点必须落在正文内部；左侧边缘是 BlockNote 拖拽栏，命中那里会退回到很高的父级列表块。
    const x = contentLeft + Math.max(1, (contentRight - contentLeft) / 2);
    for (const offset of [24, 48, 8, 1]) {
      const y = Math.min(
        containerBounds.bottom - 1,
        containerBounds.top + offset,
      );
      const candidate = ownerDocument
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>(LIVE_EDITOR_BLOCK_SELECTOR);
      if (!candidate || !root.contains(candidate)) continue;
      const candidateBounds = candidate.getBoundingClientRect();
      const codeAnchor = readEditorCodeViewportAnchor(candidate, container, {
        x,
        y,
      });
      return {
        ...codeAnchor,
        topBlockId: candidate.dataset.id ?? null,
        topBlockOffset: containerBounds.top - candidateBounds.top,
        topBlockRatio:
          Number.isFinite(candidateBounds.height) && candidateBounds.height > 0
            ? Math.min(
                Math.max(
                  (containerBounds.top - candidateBounds.top) /
                    candidateBounds.height,
                  0,
                ),
                1,
              )
            : null,
      };
    }
  }

  return readEditorViewportAnchor(
    container,
    root?.querySelectorAll<HTMLElement>(LIVE_EDITOR_BLOCK_SELECTOR) ?? [],
    (block) => block.dataset.id ?? null,
  );
}

function readLiveEditorOutlineBlockId(
  container: HTMLElement,
  root: HTMLElement | null,
) {
  const blocks =
    root?.querySelectorAll<HTMLElement>(LIVE_EDITOR_BLOCK_SELECTOR) ?? [];
  const ownerDocument = container.ownerDocument;
  if (root && typeof ownerDocument.elementFromPoint === "function") {
    const containerBounds = container.getBoundingClientRect();
    const rootBounds = root.getBoundingClientRect();
    const contentLeft = Math.max(containerBounds.left, rootBounds.left);
    const contentRight = Math.min(containerBounds.right, rootBounds.right);
    const viewportHeight = Math.max(
      0,
      containerBounds.bottom - containerBounds.top,
    );
    const activationOffset = Math.max(
      OUTLINE_ACTIVATION_MIN_OFFSET,
      viewportHeight * OUTLINE_ACTIVATION_VIEWPORT_RATIO,
    );
    const rootBottom =
      rootBounds.bottom > containerBounds.top
        ? rootBounds.bottom
        : containerBounds.bottom;
    const maxY = Math.min(containerBounds.bottom, rootBottom) - 1;
    const x = contentLeft + Math.max(1, (contentRight - contentLeft) / 2);

    // 标题越过视口四分之一处即激活，避免上一章节只剩少量正文时大纲仍停留在旧标题。
    if (contentRight > contentLeft && maxY > containerBounds.top) {
      for (const adjustment of [0, 16, -16]) {
        const y = Math.min(
          maxY,
          Math.max(
            containerBounds.top + 1,
            containerBounds.top + activationOffset + adjustment,
          ),
        );
        const candidate = ownerDocument
          .elementFromPoint(x, y)
          ?.closest<HTMLElement>(LIVE_EDITOR_BLOCK_SELECTOR);
        if (candidate && root.contains(candidate)) {
          return candidate.dataset.id ?? null;
        }
      }
    }
  }

  return readEditorViewportAnchor(
    container,
    blocks,
    (block) => block.dataset.id ?? null,
  ).topBlockId;
}

function findEditorBlockFromDomPoint(node: Node): HTMLElement | null {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest<HTMLElement>("[data-id]") ?? null;
}

function readBlockTextOffset(block: HTMLElement, node: Node, offset: number) {
  try {
    const range = block.ownerDocument.createRange();
    range.selectNodeContents(block);
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return 0;
  }
}

function readEditorSelectionPoint(
  editor: CoreBlockNoteEditor,
  position: number,
): { blockId: string; textOffset: number } | null {
  const view = editor.prosemirrorView;
  try {
    const point = view.domAtPos(position);
    const block = findEditorBlockFromDomPoint(point.node);
    const blockId = block?.dataset.id;
    if (!block || !blockId) return null;

    return {
      blockId,
      textOffset: readBlockTextOffset(block, point.node, point.offset),
    };
  } catch {
    return null;
  }
}

export interface RichEditorTextPositionRequest {
  blockId: string;
  textOffset: number;
}

interface IndexedTextPositionRequest extends RichEditorTextPositionRequest {
  index: number;
  targetOffset: number;
}

function normalizeEditorTextOffset(textOffset: number) {
  return Number.isFinite(textOffset) ? Math.max(0, Math.trunc(textOffset)) : 0;
}

function walkNodeChildren(
  parent: ProseMirrorNode,
  parentStart: number,
  visit: (node: ProseMirrorNode, position: number) => boolean,
): boolean {
  let childOffset = 0;
  for (let index = 0; index < parent.childCount; index += 1) {
    const child = parent.child(index);
    const childPosition = parentStart + 1 + childOffset;
    if (visit(child, childPosition)) return true;
    childOffset += child.nodeSize;
  }
  return false;
}

function resolveBlockTextPositions(
  doc: ProseMirrorNode,
  blockContainer: ProseMirrorNode,
  blockContainerStart: number,
  requests: IndexedTextPositionRequest[],
  positions: Array<number | null>,
) {
  const unresolved = requests.toSorted(
    (left, right) => left.targetOffset - right.targetOffset,
  );
  let consumedText = 0;
  let firstInlineContentPosition: number | null = null;
  let lastTextEndPosition: number | null = null;

  const walkBlockContent = (
    parent: ProseMirrorNode,
    parentStart: number,
  ): boolean =>
    walkNodeChildren(parent, parentStart, (node, position) => {
      // 子块属于独立的 BlockNote block，父块的文本偏移不能跨入子块内容。
      if (node.type.name === "blockContainer") return false;
      if (firstInlineContentPosition === null && node.inlineContent) {
        firstInlineContentPosition = position + 1;
      }
      if (node.isText) {
        const length = node.text?.length ?? 0;
        const textEnd = consumedText + length;
        while (unresolved.length > 0 && unresolved[0].targetOffset <= textEnd) {
          const request = unresolved.shift()!;
          positions[request.index] =
            position + (request.targetOffset - consumedText);
        }
        consumedText = textEnd;
        lastTextEndPosition = position + length;
      }
      if (unresolved.length === 0) return true;
      return node.childCount > 0 && walkBlockContent(node, position);
    });

  walkBlockContent(blockContainer, blockContainerStart);
  if (unresolved.length === 0) return;

  const fallbackPosition = lastTextEndPosition ?? firstInlineContentPosition;
  if (fallbackPosition === null) return;
  try {
    if (!doc.resolve(fallbackPosition).parent.inlineContent) return;
  } catch {
    return;
  }
  for (const request of unresolved) {
    positions[request.index] = fallbackPosition;
  }
}

function resolveDocumentTextPositions(
  doc: ProseMirrorNode,
  requests: readonly RichEditorTextPositionRequest[],
) {
  const positions = Array<number | null>(requests.length).fill(null);
  const requestsByBlockId = new Map<string, IndexedTextPositionRequest[]>();
  requests.forEach((request, index) => {
    const indexedRequest = {
      ...request,
      index,
      targetOffset: normalizeEditorTextOffset(request.textOffset),
    };
    const blockRequests = requestsByBlockId.get(request.blockId);
    if (blockRequests) blockRequests.push(indexedRequest);
    else requestsByBlockId.set(request.blockId, [indexedRequest]);
  });
  if (requestsByBlockId.size === 0) return positions;

  const walkDocument = (
    parent: ProseMirrorNode,
    parentStart: number,
  ): boolean =>
    walkNodeChildren(parent, parentStart, (node, position) => {
      if (node.type.name === "blockContainer") {
        const blockId = node.attrs.id;
        const blockRequests =
          typeof blockId === "string"
            ? requestsByBlockId.get(blockId)
            : undefined;
        if (blockRequests) {
          resolveBlockTextPositions(
            doc,
            node,
            position,
            blockRequests,
            positions,
          );
          requestsByBlockId.delete(blockId);
          if (requestsByBlockId.size === 0) return true;
        }
      }
      return node.childCount > 0 && walkDocument(node, position);
    });

  // ProseMirror 根节点的直接子节点从位置 0 开始，因此根起点使用 -1。
  walkDocument(doc, -1);
  return positions;
}

export function resolveEditorTextPositions(
  editor: CoreBlockNoteEditor,
  requests: readonly RichEditorTextPositionRequest[],
): Array<number | null> {
  return resolveDocumentTextPositions(
    editor.prosemirrorView.state.doc,
    requests,
  );
}

export function resolveEditorTextPosition(
  editor: CoreBlockNoteEditor,
  blockId: string,
  textOffset: number,
): number | null {
  return resolveEditorTextPositions(editor, [{ blockId, textOffset }])[0];
}

function safelyFocusEditorWithoutScroll(editor: CoreBlockNoteEditor) {
  try {
    editor.prosemirrorView.dom.focus({ preventScroll: true });
  } catch {
    // 窗格切换期间节点可能已脱离布局；此时保持选择状态即可，不能回退到可能滚动的 focus。
  }
}

function focusEditorAtBlockStart(
  editor: CoreBlockNoteEditor,
  _blockId: string,
) {
  // 块可能已被并发删除；此时保留当前 selection，禁止 BlockNote cursor API 隐式滚动。
  safelyFocusEditorWithoutScroll(editor);
}

export function focusEditorAtPreviewAnchor(
  editor: CoreBlockNoteEditor,
  anchor: RichPreviewAnchor | null,
): void {
  if (!anchor) {
    // 空白预览激活不得沿用上一窗格的大纲选择并触发浏览器自动滚动。
    safelyFocusEditorWithoutScroll(editor);
    return;
  }

  const view = editor.prosemirrorView;
  const position = resolveDocumentTextPositions(view.state.doc, [anchor])[0];
  if (position === null) {
    focusEditorAtBlockStart(editor, anchor.blockId);
    return;
  }

  try {
    const resolvedPosition = view.state.doc.resolve(position);
    const selection = resolvedPosition.parent.inlineContent
      ? TextSelection.create(view.state.doc, position)
      : TextSelection.near(resolvedPosition, 1);
    // pane 激活只放置光标；目标 pane 的 viewport 已由 session manager 恢复。
    view.dispatch(view.state.tr.setSelection(selection));
  } catch {
    focusEditorAtBlockStart(editor, anchor.blockId);
    return;
  }
  safelyFocusEditorWithoutScroll(editor);
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

export function focusEditorOutlineBlock(
  editor: OutlineNavigationCursorEditor,
  blockId: string,
) {
  if (!editor.getBlock(blockId)) return false;
  const hasProseMirrorView = "prosemirrorView" in editor;

  try {
    const coreEditor = editor as unknown as CoreBlockNoteEditor;
    const view = coreEditor.prosemirrorView;
    const position = resolveEditorTextPosition(coreEditor, blockId, 0);
    if (position === null) return false;
    const resolvedPosition = view.state.doc.resolve(position);
    const selection = resolvedPosition.parent.inlineContent
      ? TextSelection.create(view.state.doc, position)
      : TextSelection.near(resolvedPosition, 1);
    // 大纲只更新选择，不使用 ProseMirror scrollIntoView；滚动统一交给可按 pane 取消的容器定位。
    view.dispatch(view.state.tr.setSelection(selection));
    view.dom.focus({ preventScroll: true });
    return true;
  } catch {
    if (hasProseMirrorView) return false;
    try {
      // 仅为不含 ProseMirror view 的轻量编辑器替身保留兼容回退。
      editor.setTextCursorPosition(blockId, "start");
      return true;
    } catch {
      return false;
    }
  }
}

function selectCodeMirrorCodeBlockContent(root: Element | null) {
  const editorElement = root?.querySelector<HTMLElement>(
    ".editor-code-block__codemirror .cm-editor",
  );
  if (!editorElement) return false;

  const view = CodeMirrorView.findFromDOM(editorElement);
  if (!view) return false;

  view.focus();
  view.dispatch({
    selection: {
      anchor: 0,
      head: view.state.doc.length,
    },
    scrollIntoView: true,
  });

  return true;
}

export function shouldMarkRichEditorPointerIntent(target: EventTarget | null) {
  const targetElement = getElementFromEventTarget(target);
  if (!targetElement) return true;

  // CodeMirror 折叠 gutter 只是展示/控制层，不应触发保存/缩进链路的用户编辑意图。
  return !targetElement.closest(
    [".cm-gutters", ".cm-foldGutter", ".cm-lineNumbers"].join(", "),
  );
}

export function shouldMarkRichEditorFloatingDragIntent(
  target: EventTarget | null,
) {
  const targetElement = getElementFromEventTarget(target);
  if (!targetElement) return false;

  return Boolean(targetElement.closest(".bn-side-menu"));
}

export function shouldLetCodeMirrorHandleKeyboardEvent(
  target: EventTarget | null,
) {
  const targetElement = getElementFromEventTarget(target);

  return Boolean(targetElement?.closest(".editor-code-block__codemirror"));
}

export function selectEntireRichEditorContent(
  editor: RichEditorSelectionTarget,
): boolean {
  const view = editor.prosemirrorView;
  if (!view) return false;

  const transaction = view.state.tr.setSelection(
    new AllSelection(view.state.doc),
  );
  view.dispatch(transaction.scrollIntoView?.() ?? transaction);
  try {
    view.focus?.();
  } catch {
    // 未挂载的测试/初始化阶段没有可聚焦 view；selection dispatch 已经完成即可。
  }

  return true;
}

export function handleRichEditorSelectAllShortcut(
  event: RichEditorSelectAllEvent,
  editor: RichEditorSelectionTarget,
): boolean {
  if (!isSelectAllShortcut(event)) return false;
  if (shouldLetCodeMirrorHandleKeyboardEvent(event.target)) return false;

  const targetElement = getElementFromEventTarget(event.target);
  const codeBlockRoot =
    targetElement?.closest(".editor-code-block-shell") ?? null;
  const codeElement = getCodeElementFromSelectionRoot(codeBlockRoot);

  event.preventDefault();
  event.stopPropagation();

  if (selectCodeMirrorCodeBlockContent(codeBlockRoot)) {
    return true;
  }

  if (codeElement) {
    return selectCodeBlockContent(codeElement, editor.prosemirrorView);
  }

  return selectEntireRichEditorContent(editor);
}

export function handleRichEditorHeadingShortcut(
  event: RichEditorHeadingShortcutEvent,
  editor: CoreBlockNoteEditor,
): boolean {
  const level = getHeadingShortcutLevel(event);
  if (level === null) return false;

  const cursorPosition = editor.getTextCursorPosition();
  if (
    editor.schema.blockSchema[cursorPosition.block.type].content !== "inline"
  ) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  // 复用 BlockNote 的块更新能力，仅把当前光标所在块切换为指定级别标题。
  editor.updateBlock(cursorPosition.block, {
    type: "heading",
    props: { level },
  });

  return true;
}

export async function uploadEditorImageFileAsAttachment(
  file: File,
  context: UploadedImageAttachmentContext,
): Promise<string> {
  const workspaceRootPath = context.getWorkspaceRootPath();
  const markdownFilePath = context.getMarkdownFilePath();

  if (workspaceRootPath && markdownFilePath) {
    const imageBuffer = await readImageFileAsArrayBuffer(file);
    if (imageBuffer) {
      try {
        const result = await context.saveImageAttachment({
          workspaceRootPath,
          markdownFilePath,
          fileName: file.name || "image.png",
          mimeType: file.type || "image/png",
          data: imageBuffer,
        });

        if (result.data?.url) {
          context.moveCursorAfterUpload();
          return result.data.url;
        }
      } catch {
        // 附件写盘失败时回退到 data URL，保证粘贴动作本身不会丢图。
      }
    }
  }

  const dataUrl = await readImageFileAsDataUrl(file);
  if (!dataUrl) {
    throw new Error("Only image files can be uploaded from the editor");
  }

  context.moveCursorAfterUpload();
  return dataUrl;
}

function BlockNoteEditorInner(props: BlockNoteEditorInnerProps) {
  const { editorOwnerKey, path } = props;
  const storedFilePath = path && !isUntitledDocumentPath(path) ? path : null;
  const workspaceRootPath = useTreeStore(
    (state) => state.treeRoot?.key ?? null,
  );
  const editorClaimKey = useId();
  const ownerEditorRef = useRef<CoreBlockNoteEditor | null>(null);
  const [mountedOwner, setMountedOwner] = useState<RichEditorOwnerEntry | null>(
    null,
  );
  const loadEditorImageUrl = useCallback(async (url: string) => {
    try {
      return (await window.electronAPI.loadImageAsDataUrl(url)) ?? url;
    } catch {
      return url;
    }
  }, []);
  const uploadEditorImageFile = useCallback(
    async (file: File, blockId?: string) =>
      uploadEditorImageFileAsAttachment(file, {
        getWorkspaceRootPath: () => workspaceRootPath,
        getMarkdownFilePath: () => storedFilePath,
        saveImageAttachment: window.electronAPI.saveImageAttachment,
        moveCursorAfterUpload: () => {
          window.setTimeout(() => {
            moveCursorAfterUploadedImage(ownerEditorRef.current, blockId);
          }, 0);
        },
      }),
    [storedFilePath, workspaceRootPath],
  );
  const resolveEditorFileUrl = useCallback(
    (url: string) =>
      loadEditorImageUrl(resolveEditorImageUrl(url, storedFilePath)),
    [loadEditorImageUrl, storedFilePath],
  );

  useLayoutEffect(() => {
    // Core editor 只能在 commit phase 创建；被丢弃或 suspended 的 render 不产生任何重型实例。
    const mounted = richEditorOwnerRegistry.mount(
      editorOwnerKey,
      editorClaimKey,
      {
        resolveFileUrl: resolveEditorFileUrl,
        uploadFile: uploadEditorImageFile,
      },
      (proxies) =>
        CoreBlockNoteEditor.create({
          initialContent: undefined,
          placeholders: { default: EDITOR_EMPTY_PLACEHOLDER },
          pasteHandler: ({ event, editor, defaultPasteHandler }) => {
            const handled = pasteExternalHTMLTables(editor, event);
            if (!handled) return defaultPasteHandler();

            updateActiveEditorOutline(editor, controller);
            return true;
          },
          resolveFileUrl: proxies.resolveFileUrl,
          schema: editorSchema,
          uploadFile: proxies.uploadFile,
        }),
    );
    patchTableHandlesCellSelection(mounted.entry.editor);
    ownerEditorRef.current = mounted.entry.editor;
    setMountedOwner((current) =>
      current === mounted.entry ? current : mounted.entry,
    );

    return () => {
      if (ownerEditorRef.current === mounted.entry.editor) {
        ownerEditorRef.current = null;
      }
      mounted.release();
    };
  }, [
    editorClaimKey,
    editorOwnerKey,
    resolveEditorFileUrl,
    uploadEditorImageFile,
  ]);

  if (!mountedOwner || mountedOwner.ownerKey !== editorOwnerKey) return null;
  return (
    <MountedBlockNoteEditor
      content={props.content}
      controller={props.controller}
      editor={mountedOwner.editor}
      path={props.path}
      reloadKey={props.reloadKey}
      surface={props.surface}
    />
  );
}

function MountedBlockNoteEditor({
  controller,
  content,
  editor,
  path,
  reloadKey,
  surface,
}: MountedBlockNoteEditorProps) {
  const appearance = useEditorStore((state) => state.appearance);
  const isActiveEditor = useEditorStore(() => {
    const binding = controller.getActiveBinding();
    const state = useEditorStore.getState();
    const activeGroup = binding
      ? state.panelGroups.find((group) => group.id === state.activeGroupId)
      : null;
    return (
      binding !== null &&
      state.activeGroupId === binding.groupId &&
      activeGroup?.activeTabId === binding.tabId
    );
  });
  const { isDark } = useTheme();
  const suppressChangeRef = useRef(false);
  const changeGateRef = useRef(new EditorChangeGate());
  const contentRef = useRef(content);
  const controllerRef = useRef(controller);
  controllerRef.current = controller;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const suppressProgrammaticScrollUntilRef = useRef(0);
  const programmaticOutlineScrollRef = useRef(false);
  const pendingViewportRestoreRef = useRef<EditorViewportSnapshot | null>(null);
  const scrollWriterRef = useRef<RichPaneScrollIdleWriter | null>(null);
  if (!scrollWriterRef.current) {
    scrollWriterRef.current = new RichPaneScrollIdleWriter({
      states: richPaneViewStateRegistry,
      persist: persistRichPaneScroll,
    });
  }
  const appliedPathRef = useRef<string | null>(null);
  const appliedSourceRef = useRef(content);
  const serializedBaselineRef = useRef<string | null>(null);
  const baselineSerializationRef = useRef<Promise<string | null> | null>(null);
  const serializationCancelRef = useRef<(() => void) | null>(null);
  const serializationInFlightRef = useRef<Promise<void> | null>(null);
  const serializationQueuedRef = useRef(false);
  const serializeChangeRef = useRef<
    (options?: SerializeChangeOptions) => Promise<void>
  >(async () => {});
  const outlineUpdateCancelRef = useRef<(() => void) | null>(null);
  const outlineScrollTokenRef = useRef(0);
  const outlineSnapshotRef = useRef(EMPTY_EDITOR_OUTLINE_SNAPSHOT);
  const outlineScrollFrameRef = useRef<number | null>(null);
  const pendingOutlineScrollActivationRef =
    useRef<PendingOutlineScrollActivation | null>(null);
  const isActiveEditorRef = useRef(isActiveEditor);
  const selectionDragBoundsRef = useRef<RichEditorSelectionDragBounds | null>(
    null,
  );
  const selectionDragPointerRef = useRef<RichEditorSelectionDragPointer | null>(
    null,
  );
  const selectionDragAnchorRef = useRef<number | null>(null);
  const draggedBlockIdsRef = useRef<string[] | null>(null);
  const documentEndDropActiveRef = useRef(false);
  const applyTokenRef = useRef(0);
  const lifecycleGenerationRef = useRef(0);
  const lifecycleActiveRef = useRef(true);
  const editorRef = useRef<CoreBlockNoteEditor | null>(null);
  const runtimeRegistrationCleanupRef = useRef<(() => void) | null>(null);
  const runtimeRef = useRef<RichBlockNoteRuntime | null>(null);
  const previewCacheRef = useRef<RichPreviewCache | null>(null);
  const previewTransactionCleanupRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const opacity = `${appearance.opacity / 100}`;
    surface.dataset.richSurfaceOpacity = opacity;
    if (surface.style.visibility === "visible") {
      surface.style.opacity = opacity;
    }
  }, [appearance.opacity, surface]);

  editorRef.current = editor;

  useLayoutEffect(() => {
    // BlockNote 挂载后替换默认的 100 步历史栈，避免长时间编辑时丢弃早期撤销记录。
    configureRichTextUndoHistory(editor);
    patchTableHandlesCellSelection(editor);
  }, [editor]);

  useEffect(() => {
    let cancelled = false;
    let retryCount = 0;
    let retryTimer: number | null = null;

    const patchWhenMounted = () => {
      patchTableHandlesCellSelection(editor);
      if (cancelled || patchTableHandlesMouseMoveHandler(editor)) return;
      if (retryCount >= 10) return;

      retryCount += 1;
      retryTimer = window.setTimeout(patchWhenMounted, 0);
    };

    patchWhenMounted();
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [editor]);

  // 获取 store 中的方法
  const setOutlineHeadingsForPath = useEditorStore(
    (state) => state.setOutlineHeadingsForPath,
  );

  // 更新大纲标题列表到 store
  const updateOutlineHeadings = useCallback(() => {
    const snapshot = createEditorOutlineSnapshot(editor.document);
    outlineSnapshotRef.current = snapshot;
    if (isActiveEditorRef.current) {
      setOutlineHeadingsForPath(controller.path, snapshot.headings);
    }
    return snapshot.headings;
  }, [controller.path, editor, setOutlineHeadingsForPath]);

  const cancelPendingOutlineScrollActivation = useCallback(() => {
    if (outlineScrollFrameRef.current !== null) {
      cancelAnimationFrame(outlineScrollFrameRef.current);
      outlineScrollFrameRef.current = null;
    }
    pendingOutlineScrollActivationRef.current = null;
  }, []);

  useEffect(() => {
    isActiveEditorRef.current = isActiveEditor;
    if (!isActiveEditor) return;

    updateOutlineHeadings();
  }, [isActiveEditor, updateOutlineHeadings]);

  // 跳转到指定块的函数
  const scrollToBlock = useCallback(
    (blockId: string) => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return false;

      const scrollToken = outlineScrollTokenRef.current + 1;
      outlineScrollTokenRef.current = scrollToken;
      // 大纲跳转期间滚动事件来自程序对齐，不能让视口判定覆盖用户刚点击的标题。
      programmaticOutlineScrollRef.current = true;

      if (!focusEditorOutlineBlock(editor, blockId)) {
        programmaticOutlineScrollRef.current = false;
        return false;
      }

      const getTarget = () =>
        findEditorBlockElement(editor.domElement, blockId);
      if (!getTarget()) {
        programmaticOutlineScrollRef.current = false;
        return false;
      }

      scheduleStableEditorBlockScroll({
        container: scrollContainer,
        getTarget,
        shouldContinue: () => outlineScrollTokenRef.current === scrollToken,
      });

      return true;
    },
    [editor],
  );

  const cancelPendingViewportRestore = useCallback(() => {
    // 从预览层激活时真实编辑器收不到 pointerdown，聚焦前必须主动终止旧窗格的跨帧校正。
    outlineScrollTokenRef.current += 1;
    programmaticOutlineScrollRef.current = false;
    suppressProgrammaticScrollUntilRef.current = 0;
    pendingViewportRestoreRef.current = null;
  }, []);

  const focusAt = useCallback(
    (anchor: RichPreviewAnchor | null) => {
      cancelPendingViewportRestore();
      focusEditorAtPreviewAnchor(editor, anchor);
    },
    [cancelPendingViewportRestore, editor],
  );

  const readViewState = useCallback(() => {
    const selection = editor.prosemirrorView.state.selection;
    const anchor = readEditorSelectionPoint(editor, selection.anchor);
    const head = readEditorSelectionPoint(editor, selection.head);
    const richSelection: RichPaneSelection | null =
      anchor && head
        ? {
            anchorBlockId: anchor.blockId,
            anchorOffset: anchor.textOffset,
            headBlockId: head.blockId,
            headOffset: head.textOffset,
          }
        : null;
    const scrollContainer = scrollContainerRef.current;
    const viewportAnchor = scrollContainer
      ? readLiveEditorViewportAnchor(scrollContainer, editor.domElement)
      : {
          topBlockId: null,
          topBlockOffset: 0,
          topBlockRatio: null,
          topCodeLine: null,
          topCodeLineOffset: 0,
        };
    const viewport = chooseCapturedEditorViewport({
      live: {
        scrollTop: readEditorScrollTop(scrollContainerRef.current),
        ...viewportAnchor,
      },
      now: performance.now(),
      pending: pendingViewportRestoreRef.current,
      suppressUntil: suppressProgrammaticScrollUntilRef.current,
    });
    return { ...viewport, selection: richSelection };
  }, [editor]);

  const restoreViewState = useCallback(
    (state: RichPaneViewState) => {
      // 旧会话可能缓存过未规范化的反引号文本；激活窗格时一次性升级为真正的 code mark。
      normalizeInlineCodeMarkers(editor);
      // 切换窗格时终止旧窗格尚未完成的跨帧大纲定位，防止后续帧滚动新窗格。
      cancelPendingOutlineScrollActivation();
      const scrollToken = outlineScrollTokenRef.current + 1;
      outlineScrollTokenRef.current = scrollToken;
      programmaticOutlineScrollRef.current = false;
      pendingViewportRestoreRef.current = {
        scrollTop: state.scrollTop,
        topBlockId: state.topBlockId,
        topBlockOffset: state.topBlockOffset,
        topBlockRatio: state.topBlockRatio,
        topCodeLine: state.topCodeLine,
        topCodeLineOffset: state.topCodeLineOffset,
      };
      suppressProgrammaticScrollUntilRef.current = performance.now() + 250;
      if (scrollContainerRef.current) {
        const activePaneKey = surface.dataset.activePaneKey as
          | RichPaneKey
          | undefined;
        let targetIsCodeLine = false;
        const getTarget = () => {
          const block = state.topBlockId
            ? findEditorBlockElement(editor.domElement, state.topBlockId)
            : null;
          const codeLineTarget =
            block && state.topCodeLine !== null
              ? createEditorCodeLineTarget(block, state.topCodeLine)
              : null;
          targetIsCodeLine = Boolean(codeLineTarget);
          return codeLineTarget ?? block;
        };
        const target = getTarget();
        if (target) {
          scheduleStableEditorBlockScroll({
            container: scrollContainerRef.current,
            getTarget,
            getTargetOffset: (candidate) =>
              targetIsCodeLine
                ? state.topCodeLineOffset
                : resolveEditorViewportTargetOffset(candidate, state),
            shouldContinue: () =>
              outlineScrollTokenRef.current === scrollToken &&
              surface.dataset.activePaneKey === activePaneKey,
          });
        } else {
          scrollContainerRef.current.scrollTop = Math.max(0, state.scrollTop);
        }
      }
      if (!state.selection) {
        const firstBlock = editor.document[0];
        const position = firstBlock
          ? resolveEditorTextPosition(editor, firstBlock.id, 0)
          : null;
        if (position === null) return;
        const view = editor.prosemirrorView;
        const resolvedPosition = view.state.doc.resolve(position);
        const selection = resolvedPosition.parent.inlineContent
          ? TextSelection.create(view.state.doc, position)
          : TextSelection.near(resolvedPosition, 1);
        // 新 pane 没有自己的选择时安装顶部选择，但不请求浏览器滚动，避免继承上一 pane 光标。
        view.dispatch(view.state.tr.setSelection(selection));
        clearInlineCodeEditingState(editor);
        return;
      }

      const [anchor, head] = resolveEditorTextPositions(editor, [
        {
          blockId: state.selection.anchorBlockId,
          textOffset: state.selection.anchorOffset,
        },
        {
          blockId: state.selection.headBlockId,
          textOffset: state.selection.headOffset,
        },
      ]);
      if (anchor === null || head === null) return;
      const view = editor.prosemirrorView;
      try {
        view.dispatch(
          view.state.tr.setSelection(
            TextSelection.create(view.state.doc, anchor, head),
          ),
        );
        // 恢复的是后台视图状态，不等同于用户重新点击；保持行内代码富文本态直到真实交互。
        clearInlineCodeEditingState(editor);
      } catch {
        // 选择在异步内容更新中失效时保留已恢复的滚动位置。
      }
    },
    [cancelPendingOutlineScrollActivation, editor, surface],
  );

  const cancelPendingEditorWork = useCallback(() => {
    serializationCancelRef.current?.();
    serializationCancelRef.current = null;
    outlineUpdateCancelRef.current?.();
    outlineUpdateCancelRef.current = null;
    serializationQueuedRef.current = false;
    // 稳定滚动通过 token 自行退出；取消会话工作时同步使所有旧滚动回调失效。
    outlineScrollTokenRef.current += 1;
    cancelPendingOutlineScrollActivation();
  }, [cancelPendingOutlineScrollActivation]);

  const invalidateEditorLifecycle = useCallback(() => {
    lifecycleActiveRef.current = false;
    lifecycleGenerationRef.current += 1;
    applyTokenRef.current += 1;
    cancelPendingEditorWork();
  }, [cancelPendingEditorWork]);

  const ensureRichRuntime = useCallback(
    (blocks: Block[]) => {
      if (!surface || !path) return;

      let previewCache = previewCacheRef.current;
      if (!previewCache) {
        previewCache = new RichPreviewCache(editor);
        previewCacheRef.current = previewCache;
        previewTransactionCleanupRef.current = editor.onBeforeChange(
          ({ tr }) => {
            if (!import.meta.env.DEV) {
              previewCache?.handleTransaction(tr);
              return;
            }
            measureEditorOperation("editor:transaction", () =>
              previewCache?.handleTransaction(tr),
            );
          },
        );
      }
      // 初次应用及显式重载都以实际编辑器文档重新播种，避免预览观察到半应用状态。
      previewCache.seed(blocks);
      if (runtimeRef.current) return;

      const runtimePath = controller.path;
      const normalizedRuntimePath = normalizeRichDocumentPath(runtimePath);
      lifecycleActiveRef.current = true;
      lifecycleGenerationRef.current += 1;
      let destroyed = false;
      const runtime: RichBlockNoteRuntime = {
        path: runtimePath,
        surface,
        editor,
        previewCache,
        captureVisualSnapshot: () => {
          if (
            pendingViewportRestoreRef.current &&
            performance.now() <= suppressProgrammaticScrollUntilRef.current
          ) {
            // CodeMirror 跨窗格测量未稳定时可能只挂载虚拟行，不能把瞬时 gap 写入旧窗格快照。
            return;
          }
          previewCache.captureVisualSnapshot(surface);
        },
        focusAt,
        readViewState,
        restoreViewState,
        scrollToBlock,
        serializePendingChange: async (options) => {
          serializationCancelRef.current?.();
          serializationCancelRef.current = null;
          await serializeChangeRef.current(options);
        },
        discardPendingChange: () => {
          // 源码模式接管后使已在途的旧序列化失效；保留 runtime 供同文件的其他可见窗格继续重载。
          lifecycleGenerationRef.current += 1;
          cancelPendingEditorWork();
          changeGateRef.current.resetAfterProgrammaticChange();
        },
        cancelPendingWork: cancelPendingEditorWork,
        destroy: () => {
          if (destroyed) return;
          destroyed = true;
          // runtime 释放前同步落盘所有窗格的最后滚动位置，不能把旧 timer 留给后续 binding。
          scrollWriterRef.current?.flushAll();
          invalidateEditorLifecycle();
          previewTransactionCleanupRef.current?.();
          previewTransactionCleanupRef.current = null;
          previewCache.destroy();
          if (previewCacheRef.current === previewCache) {
            previewCacheRef.current = null;
          }
          if (runtimeRef.current === runtime) runtimeRef.current = null;
        },
        isDirty: () =>
          useEditorStore
            .getState()
            .panelGroups.some((group) =>
              group.tabs.some(
                (tab) =>
                  matchesEditorDocumentPath(tab, normalizedRuntimePath) &&
                  tab.isDirty,
              ),
            ),
        isSaving: () =>
          useEditorStore
            .getState()
            .panelGroups.some((group) =>
              group.tabs.some(
                (tab) =>
                  matchesEditorDocumentPath(tab, normalizedRuntimePath) &&
                  tab.saveStatus === "saving",
              ),
            ),
        isReloading: () =>
          useEditorStore
            .getState()
            .panelGroups.some((group) =>
              group.tabs.some(
                (tab) =>
                  matchesEditorDocumentPath(tab, normalizedRuntimePath) &&
                  tab.loadStatus === "loading",
              ),
            ),
      };
      runtimeRef.current = runtime;
      runtimeRegistrationCleanupRef.current =
        controllerRef.current.onRuntimeReady(runtime);
    },
    [
      cancelPendingEditorWork,
      controller.path,
      editor,
      focusAt,
      invalidateEditorLifecycle,
      path,
      readViewState,
      restoreViewState,
      scrollToBlock,
      surface,
    ],
  );

  // 同步最新内容引用，避免异步保存读取到旧 props。
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    const flushAtBindingBoundary = () => {
      scrollWriterRef.current?.flushInactive(
        getActiveScrollOwner(path, useEditorStore.getState()),
      );
    };

    flushAtBindingBoundary();
    const unsubscribe = useEditorStore.subscribe(flushAtBindingBoundary);
    return () => {
      unsubscribe();
      // StrictMode effect replay 也只 flush，不永久销毁 writer，真实挂载仍可继续记录滚动。
      scrollWriterRef.current?.flushAll();
    };
  }, [path]);

  useLayoutEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    if (readEditorViewportPreservation(path) !== null) return;
    // 文件切换或重载开始时立即回到顶部，不等待 Markdown 解析和 BlockNote 替换完成。
    scrollContainer.scrollTop = 0;
  }, [path, reloadKey]);

  const cacheAppliedDocument = useCallback(() => {
    const appliedPath = appliedPathRef.current;
    if (!appliedPath) return;

    const parserCacheVersion = getMarkdownParserCacheVersion(reloadKey);
    editorCache.setContent(appliedPath, appliedSourceRef.current);
    editorCache.setBlocks(
      appliedPath,
      appliedSourceRef.current,
      editor.document,
      parserCacheVersion,
      serializedBaselineRef.current ?? undefined,
    );
  }, [editor, reloadKey]);

  const serializeChange = useCallback(
    async (options?: SerializeChangeOptions) => {
      const reconcileSource = options?.reconcileSource === true;
      const lifecycleGeneration = lifecycleGenerationRef.current;
      const isCurrentLifecycle = () =>
        lifecycleActiveRef.current &&
        lifecycleGenerationRef.current === lifecycleGeneration;
      if (!isCurrentLifecycle() || suppressChangeRef.current) return;
      // 待保存 revision 在窗口失焦后仍需排空，否则最后一次输入不会进入自动保存写盘链路。
      if (serializationInFlightRef.current) {
        serializationQueuedRef.current = true;
        await serializationInFlightRef.current;
        if (!isCurrentLifecycle()) return;
        if (
          changeGateRef.current.capturePendingRevision() === null &&
          !reconcileSource
        ) {
          return;
        }

        // 显式 flush 可能与旧版本序列化重叠；等待后必须继续排空新 revision，
        // 否则切换模式/文件会取消 finally 安排的 idle 任务并留下旧列表快照。
        serializationCancelRef.current?.();
        serializationCancelRef.current = null;
        await serializeChangeRef.current(options);
        return;
      }

      const pendingRevision = changeGateRef.current.capturePendingRevision();
      if (pendingRevision === null && !reconcileSource) return;

      const runSerialization = (async () => {
        if (baselineSerializationRef.current) {
          await baselineSerializationRef.current;
          if (!isCurrentLifecycle()) return;
        }
        // 同一次序列化和缓存必须使用同一棵不可变块快照；输入可能在异步导出期间继续更新。
        const serializedBlocks = editor.document;
        const serialized = await serializeMarkdown(editor, serializedBlocks);
        if (!isCurrentLifecycle()) return;
        const baseline = serializedBaselineRef.current;
        if (baseline === null) {
          if (!isCurrentLifecycle()) return;
          serializedBaselineRef.current = serialized;
          if (path) {
            const parserCacheVersion = getMarkdownParserCacheVersion(reloadKey);
            if (!isCurrentLifecycle()) return;
            editorCache.setBlocks(
              path,
              contentRef.current,
              serializedBlocks,
              parserCacheVersion,
              serialized,
            );
          }
          if (!isCurrentLifecycle()) return;
          if (pendingRevision !== null) {
            changeGateRef.current.markSerialized(pendingRevision);
          }
          return;
        }
        // 在序列化和源码保留之间让出主线程，确保用户交互（弹窗/菜单点击）不被阻塞。
        await yieldToMain();
        if (!isCurrentLifecycle()) return;
        const markdown = resolveSerializedMarkdownChange(
          contentRef.current,
          baseline,
          serialized,
        );
        if (!isCurrentLifecycle()) return;
        serializedBaselineRef.current = serialized;
        if (markdown === null) {
          if (!isCurrentLifecycle()) return;
          if (pendingRevision !== null) {
            changeGateRef.current.markSerialized(pendingRevision);
          }
          return;
        }

        // 只有当前文档真正序列化成功后，才推进解析缓存对应的源码快照。
        contentRef.current = markdown;
        appliedSourceRef.current = markdown;
        if (path) {
          const parserCacheVersion = getMarkdownParserCacheVersion(reloadKey);
          if (!isCurrentLifecycle()) return;
          editorCache.setContent(path, markdown);
          if (!isCurrentLifecycle()) return;
          editorCache.setBlocks(
            path,
            markdown,
            serializedBlocks,
            parserCacheVersion,
            serialized,
          );
        }
        if (!isCurrentLifecycle()) return;
        controllerRef.current.onWordCountChange(markdown.length);
        if (!isCurrentLifecycle()) return;
        controllerRef.current.onMarkdownChange(markdown);
        if (!isCurrentLifecycle()) return;
        if (pendingRevision !== null) {
          changeGateRef.current.markSerialized(pendingRevision);
        }
      })();

      serializationInFlightRef.current = runSerialization;
      try {
        await runSerialization;
      } finally {
        if (serializationInFlightRef.current === runSerialization) {
          serializationInFlightRef.current = null;
        }
        if (
          isCurrentLifecycle() &&
          serializationQueuedRef.current &&
          changeGateRef.current.capturePendingRevision() !== null
        ) {
          serializationQueuedRef.current = false;
          if (serializationCancelRef.current) {
            serializationCancelRef.current();
          }
          serializationCancelRef.current = scheduleEditorIdleTask(
            () => {
              serializationCancelRef.current = null;
              void serializeChangeRef.current();
            },
            1200,
            getEditorSerializationQuietPeriodForLength(
              getCurrentEditorTextLength(editor),
            ),
          );
        } else {
          serializationQueuedRef.current = false;
        }
      }
    },
    [editor, path, reloadKey],
  );
  serializeChangeRef.current = serializeChange;

  useEditorChange(() => {
    if (changeGateRef.current.capturePendingRevision() === null) return;
    if (serializationCancelRef.current) {
      serializationCancelRef.current();
    }
    // 大文档序列化会占用主线程；后台保存让位给弹窗、菜单等即时交互。
    const docLength = getCurrentEditorTextLength(editor);
    const idleTimeout =
      docLength > 20000
        ? 15000
        : docLength > 12000
          ? 9000
          : docLength > 6000
            ? 3000
            : 1800;
    serializationCancelRef.current = scheduleEditorIdleTask(
      () => {
        serializationCancelRef.current = null;
        void serializeChange();
      },
      idleTimeout,
      getEditorSerializationQuietPeriodForLength(docLength),
    );

    // 大纲提取同样会遍历整棵文档树，大文档下延后执行，避免抢占点击反馈。
    if (outlineUpdateCancelRef.current) {
      outlineUpdateCancelRef.current();
    }
    const outlineIdleTimeout =
      docLength > 20000 ? 12000 : docLength > 12000 ? 7000 : 1500;
    outlineUpdateCancelRef.current = scheduleEditorIdleTask(
      () => {
        outlineUpdateCancelRef.current = null;
        if (!isActiveEditorRef.current) return;
        if (serializationInFlightRef.current) return;

        updateOutlineHeadings();
      },
      outlineIdleTimeout,
      getEditorSerializationQuietPeriodForLength(docLength),
    );
  }, editor);

  useEffect(() => {
    lifecycleActiveRef.current = true;
    const applyToken = ++applyTokenRef.current;
    const viewportPreservationVersion = readEditorViewportPreservation(path);
    baselineSerializationRef.current = null;
    cacheAppliedDocument();
    suppressChangeRef.current = true;
    changeGateRef.current.resetAfterProgrammaticChange();

    const applyContent = async () => {
      try {
        const rawSource = contentRef.current;
        const source = repairMarkdownSourceBeforeParse(rawSource);
        const sourceWasRepaired = !markdownEquals(source, rawSource);
        if (sourceWasRepaired) {
          // 打开历史异常文件时先修复列表源码，避免富文本和源码继续分叉。
          contentRef.current = source;
        }
        const currentPath = appliedPathRef.current;
        const currentScrollTop = readEditorScrollTop(
          scrollContainerRef.current,
        );
        // 解析规则升级后不能复用旧块缓存，否则会继续显示错误的列表或代码块结构。
        const parserCacheVersion = getMarkdownParserCacheVersion(reloadKey);
        const cached = path
          ? editorCache.getBlocks(path, source, parserCacheVersion)
          : null;
        const parsedBlocks =
          cached?.blocks ?? (await parseMarkdown(editor, source || ""));
        const blocks = ensureEditableBlocks(parsedBlocks, () => {
          return { type: "paragraph", content: [] } as Block;
        });
        // Markdown 解析可能晚于下一次切换完成，旧结果不得再写入编辑器。
        if (applyToken !== applyTokenRef.current) return;
        if (sourceWasRepaired) {
          controllerRef.current.onWordCountChange(source.length);
          controllerRef.current.onMarkdownChange(source);
        }
        window.getSelection()?.removeAllRanges();
        if (currentPath === null) {
          runWithoutRichTextUndoHistory(editor, () =>
            editor.replaceBlocks(editor.document, blocks),
          );
        } else {
          editor.replaceBlocks(editor.document, blocks);
        }
        normalizeInlineCodeMarkers(editor);
        // 整篇加载后清掉上一文件映射过来的编辑范围，并抑制新文件初始选区自动展开反引号。
        clearInlineCodeEditingState(editor);
        // 规范化可能把旧缓存中的反引号文本升级为 code mark；后续缓存和基线必须使用升级后的文档。
        const normalizedBlocks = editor.document;
        appliedPathRef.current = path;
        appliedSourceRef.current = source;
        const restoredScrollTop = chooseRestoredEditorScrollTop({
          currentPath,
          nextPath: path,
          currentScrollTop,
          cachedScrollTop: undefined,
          preserveCurrentScroll: viewportPreservationVersion !== null,
        });
        serializedBaselineRef.current = cached?.serializedBaseline ?? null;
        if (path) {
          editorCache.setContent(path, source);
          editorCache.setBlocks(
            path,
            source,
            normalizedBlocks,
            parserCacheVersion,
            cached?.serializedBaseline,
          );
        }
        ensureRichRuntime(normalizedBlocks);
        restoreEditorScrollTop(scrollContainerRef.current, restoredScrollTop);
        controllerRef.current.onParseStateChange(null);

        if (serializedBaselineRef.current === null) {
          const baselinePath = path;
          const baselineSource = source;
          const baselineBlocks = normalizedBlocks;
          const baselineParserCacheVersion = parserCacheVersion;
          const baselinePromise = (async () => {
            // 先让新面板完成一次绘制，再序列化大文档基线，避免拆分时出现空白闪烁。
            await waitForNextPaint();
            if (applyToken !== applyTokenRef.current) return null;
            const serializedBaseline = await serializeMarkdown(
              editor,
              baselineBlocks,
            );
            if (applyToken !== applyTokenRef.current) return null;
            serializedBaselineRef.current = serializedBaseline;
            if (baselinePath) {
              editorCache.setBlocks(
                baselinePath,
                baselineSource,
                baselineBlocks,
                baselineParserCacheVersion,
                serializedBaseline,
              );
            }
            return serializedBaseline;
          })();
          baselineSerializationRef.current = baselinePromise;
          void baselinePromise.finally(() => {
            if (baselineSerializationRef.current === baselinePromise) {
              baselineSerializationRef.current = null;
            }
          });
        }

        // 内容加载完成后更新大纲标题列表
        if (isActiveEditorRef.current) {
          updateOutlineHeadings();
          const binding = controllerRef.current.getActiveBinding();
          if (binding) {
            flushPendingEditorOutlineNavigation(binding.groupId, binding.tabId);
          }
        }
      } catch (error) {
        if (applyToken !== applyTokenRef.current) return;
        const fallback = createParseFallback(error);
        controllerRef.current.onParseStateChange(fallback.message);
      } finally {
        if (applyToken === applyTokenRef.current) {
          if (viewportPreservationVersion !== null) {
            completeEditorViewportPreservation(
              path,
              viewportPreservationVersion,
            );
          }
          queueMicrotask(() => {
            suppressChangeRef.current = false;
          });
        }
      }
    };

    void applyContent();
    return () => {
      applyTokenRef.current += 1;
      lifecycleGenerationRef.current += 1;
      cancelPendingEditorWork();
      baselineSerializationRef.current = null;
    };
    // 普通输入只更新 contentRef；仅文件切换或显式重载时替换整篇文档。
  }, [
    cacheAppliedDocument,
    cancelPendingEditorWork,
    editor,
    ensureRichRuntime,
    path,
    reloadKey,
  ]);

  useEffect(
    () => () => {
      invalidateEditorLifecycle();
      cacheAppliedDocument();
    },
    [cacheAppliedDocument, invalidateEditorLifecycle],
  );

  useEffect(
    () => () => {
      runtimeRegistrationCleanupRef.current?.();
      runtimeRegistrationCleanupRef.current = null;
      runtimeRef.current?.destroy();
      runtimeRef.current = null;
      previewTransactionCleanupRef.current?.();
      previewTransactionCleanupRef.current = null;
      previewCacheRef.current?.destroy();
      previewCacheRef.current = null;
    },
    [],
  );

  const editorStyle = {
    backgroundColor: "var(--bg-primary)",
    contain: "layout style paint",
    isolation: "isolate",
    "--editor-font-size": `${appearance.fontSize}px`,
    "--editor-line-height": appearance.lineHeight,
    "--editor-padding": `${appearance.padding}px`,
  } as CSSProperties;

  const blockExternalFileDrop = useCallback((event: React.DragEvent) => {
    const types = event.dataTransfer?.types;
    // 部分浏览器在内部块拖拽结束时会派发没有 dataTransfer 的 dragleave，不能阻断编辑器清理流程。
    if (
      !types ||
      types.includes("blocknote/html") ||
      !isEditorFileDrag(types)
    ) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    return true;
  }, []);

  const setDocumentEndDropActive = useCallback((active: boolean) => {
    if (documentEndDropActiveRef.current === active) return;

    documentEndDropActiveRef.current = active;
    scrollContainerRef.current?.toggleAttribute(
      "data-block-drop-at-document-end",
      active,
    );
  }, []);

  const handleStaleTableMouseMoveCapture = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // 首次进入表格时插件视图可能才刚完成挂载，此处再尝试一次兼容补丁，确保事件到达插件前已完成替换。
      patchTableHandlesCellSelection(editor);
      patchTableHandlesMouseMoveHandler(editor);
      if (shouldSuppressStaleTableMouseMove(editor, event.target)) {
        event.stopPropagation();
      }
    },
    [editor],
  );

  const handleFileDragOverCapture = useCallback(
    (event: React.DragEvent) => {
      if (event.dataTransfer?.types.includes("blocknote/html")) {
        // dragover 期间只记录原块和落点，不修改文档，避免原生 drop 同时插入拖拽切片。
        draggedBlockIdsRef.current ??= readRichEditorDraggedBlockIds(editor);
        const isDocumentEndDrop = Boolean(
          draggedBlockIdsRef.current.length > 0 &&
          isRichEditorDocumentEndDrag(editor, event),
        );
        setDocumentEndDropActive(isDocumentEndDrop);
        if (isDocumentEndDrop) {
          // 末尾空白区域本身不是可编辑节点，必须显式允许 drop，并保持移动语义。
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
        return;
      }
      if (!blockExternalFileDrop(event)) return;

      const binding = controllerRef.current.getActiveBinding();
      if (!binding) return;
      useEditorStore.getState().setFileDragTargetGroupId(binding.groupId);
    },
    [blockExternalFileDrop, editor, setDocumentEndDropActive],
  );

  const handleFileDragLeaveCapture = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (event.dataTransfer?.types.includes("blocknote/html")) {
        const nextTarget = event.relatedTarget;
        if (
          nextTarget instanceof Node &&
          event.currentTarget.contains(nextTarget)
        ) {
          return;
        }
        setDocumentEndDropActive(false);
        return;
      }

      if (!blockExternalFileDrop(event)) return;

      const nextTarget = event.relatedTarget;
      if (
        nextTarget instanceof Node &&
        event.currentTarget.contains(nextTarget)
      ) {
        return;
      }

      const binding = controllerRef.current.getActiveBinding();
      useEditorStore.getState().clearFileDragTargetGroupId(binding?.groupId);
    },
    [blockExternalFileDrop, setDocumentEndDropActive],
  );

  const markUserIntent = useCallback(() => {
    changeGateRef.current.markUserIntent();
  }, []);

  const handleBlockDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer.types.includes("blocknote/html")) return;

      // BlockNote 会先在拖拽手柄的 target 阶段选中原块并写入 dataTransfer；
      // 必须在随后冒泡到容器时记录，capture/dragover 阶段读取会拿到旧光标或空选择。
      draggedBlockIdsRef.current = readRichEditorDraggedBlockIds(editor);
    },
    [editor],
  );

  const handlePasteCapture = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      markUserIntent();
      const handledExternalPaste = pasteExternalHTMLTables(
        editor,
        event.nativeEvent,
      );
      const handledMarkupPaste =
        !handledExternalPaste &&
        pasteMarkupAsPlainText(editor, event.nativeEvent);
      if (!handledExternalPaste && !handledMarkupPaste) {
        return;
      }

      if (handledExternalPaste) updateOutlineHeadings();

      // 容器捕获阶段优先于编辑器实例处理，热更新后也能覆盖旧实例的粘贴规则。
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
    },
    [editor, markUserIntent],
  );

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    // 编辑器表面通过 React Portal 挂到 body；直接监听实际 DOM，确保复制兜底不受 Portal 事件委托影响。
    const handleNativeCopy = (event: ClipboardEvent) => {
      copyMarkupSelectionAsPlainText(editor, event);
    };
    scrollContainer.addEventListener("copy", handleNativeCopy);
    return () => scrollContainer.removeEventListener("copy", handleNativeCopy);
  }, [editor]);

  const handleDropCapture = useCallback(
    (event: React.DragEvent) => {
      const draggedBlockIds = draggedBlockIdsRef.current;
      setDocumentEndDropActive(false);
      if (
        draggedBlockIds?.length &&
        isRichEditorDocumentEndDrag(editor, event)
      ) {
        draggedBlockIdsRef.current = null;
        event.preventDefault();
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        event.dataTransfer.dropEffect = "move";
        moveRichEditorBlocksToDocumentEnd(editor, draggedBlockIds);
        editor.prosemirrorView.dragging = null;
        markUserIntent();
        return;
      }

      if (!blockExternalFileDrop(event)) {
        markUserIntent();
        return;
      }

      useEditorStore.getState().clearFileDragTargetGroupId();

      const filePath = getDraggedFilePath(event.dataTransfer);
      if (!filePath || !isSupportedEditorFilePath(filePath)) return;

      const binding = controllerRef.current.getActiveBinding();
      if (!binding) return;

      // Portal 中的富文本事件不会稳定经过所属面板，直接按当前绑定转交文件打开。
      void controllerRef.current.onFileDrop(filePath, binding);
    },
    [blockExternalFileDrop, editor, markUserIntent, setDocumentEndDropActive],
  );

  const handleDragEndCapture = useCallback(() => {
    draggedBlockIdsRef.current = null;
    setDocumentEndDropActive(false);
  }, [setDocumentEndDropActive]);

  const handleFocus = useCallback(() => {
    const binding = controllerRef.current.getActiveBinding();
    if (!binding) return;
    // 焦点事件发生时再读取 binding，表面移动后不会把操作写回旧面板。
    const store = useEditorStore.getState();
    store.setActiveGroupId(binding.groupId);
    store.setActiveTab(binding.groupId, binding.tabId);
  }, []);

  const readCurrentScrollOwner = useCallback((): RichPaneScrollOwner | null => {
    const binding = controllerRef.current.getActiveBinding();
    if (!binding) return null;
    if (surface.dataset.activePaneKey !== binding.paneKey) return null;

    const owner = toScrollOwner(binding);
    return path && owner.path === normalizeRichDocumentPath(path)
      ? owner
      : null;
  }, [path, surface]);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const owner = readCurrentScrollOwner();
      if (!owner) return;
      if (programmaticOutlineScrollRef.current) return;
      if (
        suppressProgrammaticScrollUntilRef.current > 0 &&
        performance.now() <= suppressProgrammaticScrollUntilRef.current
      ) {
        return;
      }

      const scrollContainer = event.currentTarget;
      const viewportAnchor = readLiveEditorViewportAnchor(
        scrollContainer,
        editor.domElement,
      );

      // 高频滚动只更新 ref/registry；Zustand 在 150ms idle 或生命周期边界才写入。
      scrollWriterRef.current?.record(
        owner,
        scrollContainer.scrollTop,
        viewportAnchor,
      );

      pendingOutlineScrollActivationRef.current = {
        owner,
      };
      if (outlineScrollFrameRef.current !== null) return;

      outlineScrollFrameRef.current = requestAnimationFrame(() => {
        outlineScrollFrameRef.current = null;
        const pending = pendingOutlineScrollActivationRef.current;
        pendingOutlineScrollActivationRef.current = null;
        if (!pending || !isActiveEditorRef.current) return;
        if (programmaticOutlineScrollRef.current) return;

        // 面板可能在滚动帧提交前已切换；旧 owner 不能覆盖新面板的大纲状态。
        const currentOwner = readCurrentScrollOwner();
        if (
          !currentOwner ||
          !isSameOutlineScrollOwner(currentOwner, pending.owner)
        ) {
          return;
        }

        const outlineBlockId = readLiveEditorOutlineBlockId(
          scrollContainer,
          editor.domElement,
        );
        const activeHeadingId = outlineBlockId
          ? (outlineSnapshotRef.current.activeHeadingIdByBlockId.get(
              outlineBlockId,
            ) ?? null)
          : null;
        useEditorStore
          .getState()
          .setActiveHeadingIdForPane(pending.owner.paneKey, activeHeadingId);
      });
    },
    [editor, readCurrentScrollOwner],
  );

  const handleBlur = useCallback(() => {
    const owner = readCurrentScrollOwner();
    if (owner) scrollWriterRef.current?.flushOwner(owner);
    else scrollWriterRef.current?.flushAll();
  }, [readCurrentScrollOwner]);

  const handleBlurCapture = useCallback(() => {
    preserveInlineCodeEditingState(editor);
  }, [editor]);

  const handlePointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      cancelPendingViewportRestore();
      selectionDragPointerRef.current = {
        buttons: event.buttons,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      const inlineContent = getRichEditorInlineContentFromTarget(event.target);
      if (event.button === 0 && inlineContent) {
        const rect = inlineContent.getBoundingClientRect();
        selectionDragBoundsRef.current = {
          bottom: rect.bottom,
          left: rect.left,
          top: rect.top,
        };
        selectionDragAnchorRef.current =
          editor.prosemirrorView.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          })?.pos ?? null;
      } else {
        selectionDragBoundsRef.current = null;
        selectionDragAnchorRef.current = null;
      }
      if (shouldMarkRichEditorPointerIntent(event.target)) {
        markUserIntent();
      }
    },
    [cancelPendingViewportRestore, editor, markUserIntent],
  );

  const handleKeyDownCapture = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      cancelPendingViewportRestore();
      markUserIntent();
      if (shouldLetCodeMirrorHandleKeyboardEvent(event.target)) return;
      if (handleRichEditorHeadingShortcut(event, editor)) return;
      handleRichEditorSelectAllShortcut(event, editor);
    },
    [cancelPendingViewportRestore, editor, markUserIntent],
  );

  useEffect(() => {
    const selectionGuardPlugin = createRichEditorSelectionDragGuardPlugin(
      () => ({
        bounds: isActiveEditorRef.current
          ? selectionDragBoundsRef.current
          : null,
        pointer: selectionDragPointerRef.current,
      }),
    );
    registerRichEditorSelectionDragGuardPlugin(editor, selectionGuardPlugin);
    let isSelectionDragLocked = false;

    const setSelectionDragLocked = (locked: boolean) => {
      if (isSelectionDragLocked === locked) return;
      isSelectionDragLocked = locked;
      document.documentElement.classList.toggle(
        RICH_EDITOR_SELECTION_DRAG_LOCK_CLASS,
        locked,
      );
    };

    const handleFloatingControlPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        !target.closest(
          ".bn-toolbar, .bn-menu-dropdown, .bn-side-menu, .bn-suggestion-menu, .bn-popover-content, .bn-table-handle-menu",
        )
      ) {
        return;
      }

      const selectionAnchor = document.getSelection()?.anchorNode;
      if (
        selectionAnchor &&
        scrollContainerRef.current?.contains(selectionAnchor)
      ) {
        // BlockNote 浮层通过 Portal 渲染在编辑器外，需要单独记录其格式化操作。
        markUserIntent();
      }
    };
    const handleSelectionDragMouseMove = (event: MouseEvent) => {
      if (event.buttons !== 1) {
        resetSelectionDrag();
        return;
      }
      if (!isActiveEditorRef.current) {
        setSelectionDragLocked(false);
        return;
      }
      selectionDragPointerRef.current = {
        buttons: event.buttons,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      const bounds = selectionDragBoundsRef.current;
      const isSameLineGutter = shouldPreventRichEditorGutterSelectionDrag(
        event.buttons,
        event.clientX,
        event.clientY,
        bounds,
      );

      if (!isSelectionDragLocked && isSameLineGutter) {
        selectionDragAnchorRef.current ??=
          editor.prosemirrorView.state.selection.anchor;
        setSelectionDragLocked(true);
      }
      if (!isSelectionDragLocked || !bounds) return;

      const view = editor.prosemirrorView;
      const anchor = selectionDragAnchorRef.current;
      const position = view.posAtCoords({
        // 同行向左越界时钳制在正文起点；进入其他行后仍按真实坐标更新，保留正常跨行拖选。
        left: isSameLineGutter ? bounds.left + 1 : event.clientX,
        top: event.clientY,
      });
      if (anchor !== null && position) {
        const nextSelection = TextSelection.between(
          view.state.doc.resolve(anchor),
          view.state.doc.resolve(position.pos),
        );
        if (!nextSelection.eq(view.state.selection)) {
          view.dispatch(view.state.tr.setSelection(nextSelection));
        }
      }

      // 进入异常区域后由 ProseMirror 接管本次拖选，避免 Chrome 原生选区与状态选区反复争抢而闪烁。
      event.preventDefault();
    };
    const resetSelectionDrag = () => {
      setSelectionDragLocked(false);
      selectionDragBoundsRef.current = null;
      selectionDragPointerRef.current = null;
      selectionDragAnchorRef.current = null;
    };
    const handleFloatingControlDragStart = (event: DragEvent) => {
      if (!isActiveEditorRef.current) return;
      if (shouldMarkRichEditorFloatingDragIntent(event.target)) {
        // BlockNote 的块拖拽句柄可能在浮层内，需显式记录拖拽也是一次用户编辑。
        markUserIntent();
      }
    };

    document.addEventListener(
      "pointerdown",
      handleFloatingControlPointerDown,
      true,
    );
    document.addEventListener("mousemove", handleSelectionDragMouseMove, true);
    document.addEventListener("mouseup", resetSelectionDrag, true);
    window.addEventListener("blur", resetSelectionDrag);
    document.addEventListener(
      "dragstart",
      handleFloatingControlDragStart,
      true,
    );
    document.addEventListener("dragend", resetSelectionDrag, true);
    return () => {
      document.removeEventListener(
        "pointerdown",
        handleFloatingControlPointerDown,
        true,
      );
      document.removeEventListener(
        "mousemove",
        handleSelectionDragMouseMove,
        true,
      );
      document.removeEventListener("mouseup", resetSelectionDrag, true);
      window.removeEventListener("blur", resetSelectionDrag);
      document.removeEventListener(
        "dragstart",
        handleFloatingControlDragStart,
        true,
      );
      document.removeEventListener("dragend", resetSelectionDrag, true);
      setSelectionDragLocked(false);
      unregisterRichEditorSelectionDragGuardPlugin(
        editor,
        selectionGuardPlugin,
      );
    };
  }, [editor, markUserIntent]);

  return (
    <div
      ref={scrollContainerRef}
      className="editor-rich-scroll h-full overflow-y-auto overflow-x-hidden"
      style={editorStyle}
      onBlurCapture={handleBlurCapture}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onClick={handleFocus}
      onScroll={handleScroll}
      onBeforeInputCapture={markUserIntent}
      onKeyDownCapture={handleKeyDownCapture}
      onPointerDownCapture={handlePointerDownCapture}
      onTouchStartCapture={cancelPendingViewportRestore}
      onWheelCapture={cancelPendingViewportRestore}
      onMouseMoveCapture={handleStaleTableMouseMoveCapture}
      onPasteCapture={handlePasteCapture}
      onCutCapture={markUserIntent}
      onCompositionStartCapture={markUserIntent}
      onDragStartCapture={markUserIntent}
      onDragStart={handleBlockDragStart}
      onDragEndCapture={handleDragEndCapture}
      onDragOverCapture={handleFileDragOverCapture}
      onDragLeaveCapture={handleFileDragLeaveCapture}
      onDropCapture={handleDropCapture}
    >
      <BlockNoteView
        {...richEditorDefaultUIProps}
        editor={editor}
        formattingToolbar={false}
        theme={isDark ? "dark" : "light"}
        spellCheck={false}
        style={{
          fontSize: `${appearance.fontSize}px`,
          lineHeight: appearance.lineHeight,
        }}
      >
        <EditorFormattingToolbar />
        <EditorSideMenuController />
      </BlockNoteView>
    </div>
  );
}

export function BlockNoteEditor(props: BlockNoteEditorSessionProps) {
  return (
    <BlockNoteEditorInner
      controller={props.controller}
      content={props.content}
      editorOwnerKey={`session:${normalizeRichDocumentPath(props.controller.path)}`}
      path={props.controller.path}
      reloadKey={props.reloadKey}
      surface={props.surface}
    />
  );
}
