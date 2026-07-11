import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
  useBlockNoteEditor,
  useEditorState,
  useEditorChange,
  useComponentsContext,
  type FormattingToolbarProps,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { EditorView as CodeMirrorView } from "@codemirror/view";
import { CodeXml } from "lucide-react";
import {
  BlockNoteEditor as CoreBlockNoteEditor,
  type Block,
  type InlineContent,
} from "@blocknote/core";
import { AllSelection, TextSelection } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { useTheme } from "@/hooks/use-theme";
import { useDiffStore } from "@/store/diff.store";
import {
  useEditorStore,
  type EditorState,
  type SplitWarmupState,
} from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import {
  editorCache,
  editorSaveCoordinator,
  registerEditorChangeFlusher,
  richPaneViewStateRegistry,
} from "../lib/editor-runtime";
import { selectBlockNoteRuntimeSignature } from "../lib/editor-view-selectors";
import type { RichDocumentRuntime } from "../lib/rich-document-session-manager";
import type { RichPreviewAnchor } from "../lib/rich-preview-anchor";
import { RichPreviewCache } from "../lib/rich-preview-cache";
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
  chooseRestoredEditorScrollTop,
  readEditorScrollTop,
  restoreEditorScrollTop,
  scheduleStableEditorBlockScroll,
} from "../lib/editor-viewport";
import {
  flushPendingEditorOutlineNavigation,
  registerEditorOutlineNavigator,
} from "../lib/editor-outline-navigation";
import { createParseFallback } from "../lib/editor-parse-fallback";
import { editorInstanceRegistry } from "../lib/editor-instance-registry";
import {
  readImageFileAsArrayBuffer,
  readImageFileAsDataUrl,
} from "../lib/editor-image";
import { editorSchema } from "../lib/blocknote-schema";
import { selectCodeBlockContent } from "./editor-code-block";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "@/styles/blocknote-overrides.css";

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

interface UploadedImageCursorEditor {
  document: Array<{ id: string; type: string }>;
  getBlock: (blockId: string) => { id: string; type: string } | undefined;
  insertBlocks: (
    blocksToInsert: Array<{ type: "paragraph"; content: string }>,
    referenceBlock: string,
    placement: "after",
  ) => Array<{ id: string }>;
  setTextCursorPosition: (blockId: string, placement: "start") => void;
}

interface OutlineNavigationCursorEditor {
  getBlock: (blockId: string) => unknown;
  focus: () => void;
  setTextCursorPosition: (blockId: string, placement: "start") => void;
}

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
  readViewState: () => Pick<RichPaneViewState, "scrollTop" | "selection">;
  restoreViewState: (state: RichPaneViewState) => void;
  scrollToBlock: (blockId: string) => boolean;
}

export interface RichEditorSessionController {
  path: string;
  getActiveBinding: () => RichEditorBinding | null;
  getBoundTabIds: () => string[];
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
  splitWarmup?: SplitWarmupState;
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

interface LegacyBlockNoteEditorProps {
  groupId: string;
  tabId: string;
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
    !tab.filePath ||
    normalizeRichDocumentPath(tab.filePath) !== normalizedPath
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
  if (!tab.filePath || normalizeRichDocumentPath(tab.filePath) !== owner.path) {
    return;
  }

  store.setTabScrollTop(owner.groupId, owner.tabId, scrollTop);
}

const MARKDOWN_PARSER_VERSION = "blocknote-v5";

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
  sideMenu: true,
} as const;

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

export function EditorFormattingToolbar() {
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
  return `[data-id="${escapedBlockId}"]`;
}

function findEditorBlockElement(root: Element | null, blockId: string) {
  return (
    root?.querySelector<HTMLElement>(createBlockIdSelector(blockId)) ?? null
  );
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

export function resolveEditorTextPosition(
  editor: CoreBlockNoteEditor,
  blockId: string,
  textOffset: number,
): number | null {
  const doc = editor.prosemirrorView.state.doc;
  let blockContainer: ProseMirrorNode | null = null;
  let blockContainerStart = -1;
  doc.descendants((node, position) => {
    if (node.type.name === "blockContainer" && node.attrs.id === blockId) {
      blockContainer = node;
      blockContainerStart = position;
      return false;
    }
    return blockContainer === null;
  });
  if (!blockContainer || blockContainerStart < 0) return null;

  const finiteOffset = Number.isFinite(textOffset) ? Math.trunc(textOffset) : 0;
  const targetOffset = Math.min(
    Math.max(finiteOffset, 0),
    blockContainer.textContent.length,
  );
  let consumed = 0;
  let resolvedPosition: number | null = null;
  let firstInlineContentPosition: number | null = null;
  blockContainer.descendants((node, position) => {
    if (firstInlineContentPosition === null && node.inlineContent) {
      firstInlineContentPosition = blockContainerStart + 1 + position + 1;
    }
    if (!node.isText || resolvedPosition !== null)
      return resolvedPosition === null;

    const length = node.text?.length ?? 0;
    if (consumed + length >= targetOffset) {
      resolvedPosition =
        blockContainerStart + 1 + position + (targetOffset - consumed);
      return false;
    }
    consumed += length;
    return true;
  });

  if (resolvedPosition !== null) return resolvedPosition;

  // 空 inline block 仍可由 Selection.near 定位；图片等 atom block 交给 BlockNote fallback。
  if (firstInlineContentPosition === null) return null;
  try {
    return doc.resolve(firstInlineContentPosition).parent.inlineContent
      ? firstInlineContentPosition
      : null;
  } catch {
    return null;
  }
}

export function focusEditorAtPreviewAnchor(
  editor: CoreBlockNoteEditor,
  anchor: RichPreviewAnchor | null,
): void {
  if (!anchor) {
    editor.focus();
    return;
  }
  if (!editor.getBlock(anchor.blockId)) {
    editor.focus();
    return;
  }

  const position = resolveEditorTextPosition(
    editor,
    anchor.blockId,
    anchor.textOffset,
  );
  if (position === null) {
    editor.setTextCursorPosition(anchor.blockId, "start");
    editor.focus();
    return;
  }

  const view = editor.prosemirrorView;
  try {
    const resolvedPosition = view.state.doc.resolve(position);
    const selection = resolvedPosition.parent.inlineContent
      ? TextSelection.create(view.state.doc, position)
      : TextSelection.near(resolvedPosition, 1);
    view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  } catch {
    editor.setTextCursorPosition(anchor.blockId, "start");
    editor.focus();
    return;
  }
  editor.focus();
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

function scheduleEditorIdleTask(callback: () => void, timeout = 1200) {
  const idleWindow = window as Window & {
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions,
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof idleWindow.requestIdleCallback === "function") {
    const handle = idleWindow.requestIdleCallback(callback, { timeout });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const timer = window.setTimeout(callback, timeout);
  return () => window.clearTimeout(timer);
}

function scrollCurrentEditorSelectionIntoView(editor: CoreBlockNoteEditor) {
  const view = editor.prosemirrorView;
  if (!view) return false;

  view.dispatch(view.state.tr.scrollIntoView());
  return true;
}

export function focusEditorOutlineBlock(
  editor: OutlineNavigationCursorEditor,
  blockId: string,
  scrollSelection: (editor: OutlineNavigationCursorEditor) => boolean = (
    currentEditor,
  ) =>
    scrollCurrentEditorSelectionIntoView(
      currentEditor as unknown as CoreBlockNoteEditor,
    ),
) {
  if (!editor.getBlock(blockId)) return false;

  try {
    // 首次从大纲跳转时编辑器可能未聚焦；先聚焦再设置光标，避免第一次点击只激活编辑器不滚动。
    editor.focus();
    editor.setTextCursorPosition(blockId, "start");
    scrollSelection(editor);
    return true;
  } catch {
    return false;
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

export function moveCursorAfterUploadedImage(
  editor: UploadedImageCursorEditor | null,
  blockId: string | undefined,
): boolean {
  if (!editor || !blockId) return false;

  const uploadedBlock = editor.getBlock(blockId);
  if (uploadedBlock?.type !== "image") return false;

  const blockIndex = editor.document.findIndex((block) => block.id === blockId);
  const nextBlock = blockIndex >= 0 ? editor.document[blockIndex + 1] : null;
  const targetBlock =
    nextBlock?.type === "paragraph"
      ? nextBlock
      : editor.insertBlocks(
          [{ type: "paragraph", content: "" }],
          blockId,
          "after",
        )[0];

  if (!targetBlock?.id) return false;

  // 粘贴图片后把光标移到图片后的文本块，避免图片块保持选中并立即弹出文件操作栏。
  editor.setTextCursorPosition(targetBlock.id, "start");
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
        getMarkdownFilePath: () => path,
        saveImageAttachment: window.electronAPI.saveImageAttachment,
        moveCursorAfterUpload: () => {
          window.setTimeout(() => {
            moveCursorAfterUploadedImage(ownerEditorRef.current, blockId);
          }, 0);
        },
      }),
    [path, workspaceRootPath],
  );
  const resolveEditorFileUrl = useCallback(
    (url: string) => loadEditorImageUrl(resolveEditorImageUrl(url, path)),
    [loadEditorImageUrl, path],
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
          resolveFileUrl: proxies.resolveFileUrl,
          schema: editorSchema,
          uploadFile: proxies.uploadFile,
        }),
    );
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
      splitWarmup={props.splitWarmup}
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
  splitWarmup,
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
  const serializeChangeRef = useRef<() => Promise<void>>(async () => {});
  const outlineUpdateCancelRef = useRef<(() => void) | null>(null);
  const outlineScrollTokenRef = useRef(0);
  const isActiveEditorRef = useRef(isActiveEditor);
  const applyTokenRef = useRef(0);
  const lifecycleGenerationRef = useRef(0);
  const lifecycleActiveRef = useRef(true);
  const editorRef = useRef<CoreBlockNoteEditor | null>(null);
  const editorRegistrationCleanupRef = useRef<(() => void) | null>(null);
  const editorBindingSubscriptionCleanupRef = useRef<(() => void) | null>(null);
  const runtimeRegistrationCleanupRef = useRef<(() => void) | null>(null);
  const runtimeRef = useRef<RichBlockNoteRuntime | null>(null);
  const previewCacheRef = useRef<RichPreviewCache | null>(null);
  const previewTransactionCleanupRef = useRef<(() => void) | null>(null);
  const splitWarmupRef = useRef(splitWarmup);
  const loadEditorImageUrl = useCallback(async (url: string) => {
    try {
      return (await window.electronAPI.loadImageAsDataUrl(url)) ?? url;
    } catch {
      return url;
    }
  }, []);
  editorRef.current = editor;

  // 获取 store 中的方法
  const setOutlineHeadings = useEditorStore(
    (state) => state.setOutlineHeadings,
  );

  // 提取标题的函数
  const extractHeadings = useCallback(() => {
    const headings: Array<{ id: string; text: string; level: number }> = [];

    function walk(blocks: Block[]) {
      for (const block of blocks) {
        if (block.type === "heading") {
          const text =
            (block.content as InlineContent[])
              ?.map((ic) => (ic.type === "text" ? ic.text : ""))
              .join("") ?? "";
          headings.push({
            id: block.id,
            text,
            level: block.props.level ?? 1,
          });
        }
        if (block.children?.length) {
          walk(block.children);
        }
      }
    }

    walk(editor.document);
    return headings;
  }, [editor]);

  // 更新大纲标题列表到 store
  const updateOutlineHeadings = useCallback(() => {
    const headings = extractHeadings();
    if (isActiveEditorRef.current) {
      setOutlineHeadings(headings);
    }
    return headings;
  }, [extractHeadings, setOutlineHeadings]);

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

      if (!focusEditorOutlineBlock(editor, blockId)) {
        return false;
      }

      const getTarget = () =>
        findEditorBlockElement(editor.domElement, blockId);
      if (!getTarget()) {
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

  const focusAt = useCallback(
    (anchor: RichPreviewAnchor | null) =>
      focusEditorAtPreviewAnchor(editor, anchor),
    [editor],
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
    return {
      scrollTop: readEditorScrollTop(scrollContainerRef.current),
      selection: richSelection,
    };
  }, [editor]);

  const restoreViewState = useCallback(
    (state: RichPaneViewState) => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = Math.max(0, state.scrollTop);
      }
      if (!state.selection) return;

      const anchor = resolveEditorTextPosition(
        editor,
        state.selection.anchorBlockId,
        state.selection.anchorOffset,
      );
      const head = resolveEditorTextPosition(
        editor,
        state.selection.headBlockId,
        state.selection.headOffset,
      );
      if (anchor === null || head === null) return;
      const view = editor.prosemirrorView;
      view.dispatch(
        view.state.tr.setSelection(
          TextSelection.create(view.state.doc, anchor, head),
        ),
      );
    },
    [editor],
  );

  const cancelPendingEditorWork = useCallback(() => {
    serializationCancelRef.current?.();
    serializationCancelRef.current = null;
    outlineUpdateCancelRef.current?.();
    outlineUpdateCancelRef.current = null;
    serializationQueuedRef.current = false;
    // 稳定滚动通过 token 自行退出；取消会话工作时同步使所有旧滚动回调失效。
    outlineScrollTokenRef.current += 1;
  }, []);

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
            previewCache?.handleTransaction(tr);
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
        focusAt,
        readViewState,
        restoreViewState,
        scrollToBlock,
        serializePendingChange: async () => {
          serializationCancelRef.current?.();
          serializationCancelRef.current = null;
          await serializeChangeRef.current();
        },
        cancelPendingWork: cancelPendingEditorWork,
        destroy: () => {
          if (destroyed) return;
          destroyed = true;
          // runtime 释放前同步落盘所有窗格的最后滚动位置，不能把旧 timer 留给后续 binding。
          scrollWriterRef.current?.flushAll();
          invalidateEditorLifecycle();
          editorRegistrationCleanupRef.current?.();
          editorRegistrationCleanupRef.current = null;
          editorBindingSubscriptionCleanupRef.current?.();
          editorBindingSubscriptionCleanupRef.current = null;
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
                  tab.filePath !== null &&
                  normalizeRichDocumentPath(tab.filePath) ===
                    normalizedRuntimePath &&
                  tab.isDirty,
              ),
            ),
        isSaving: () =>
          useEditorStore
            .getState()
            .panelGroups.some((group) =>
              group.tabs.some(
                (tab) =>
                  tab.filePath !== null &&
                  normalizeRichDocumentPath(tab.filePath) ===
                    normalizedRuntimePath &&
                  tab.saveStatus === "saving",
              ),
            ),
        isReloading: () =>
          useEditorStore
            .getState()
            .panelGroups.some((group) =>
              group.tabs.some(
                (tab) =>
                  tab.filePath !== null &&
                  normalizeRichDocumentPath(tab.filePath) ===
                    normalizedRuntimePath &&
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

  // 通过 store 暴露跳转函数给侧边栏
  useEffect(() => {
    let registeredPaneKey: RichPaneKey | null = null;
    let releaseNavigator: (() => void) | null = null;
    const synchronizeRegistration = () => {
      const binding = controllerRef.current.getActiveBinding();
      if (binding?.paneKey === registeredPaneKey) return;
      releaseNavigator?.();
      registeredPaneKey = binding?.paneKey ?? null;
      releaseNavigator = binding
        ? registerEditorOutlineNavigator(
            binding.groupId,
            binding.tabId,
            scrollToBlock,
          )
        : null;
    };

    // 编辑器表面会跨面板移动，大纲导航必须跟随当前活动 binding。
    synchronizeRegistration();
    const unsubscribe = useEditorStore.subscribe(synchronizeRegistration);
    return () => {
      unsubscribe();
      releaseNavigator?.();
    };
  }, [scrollToBlock]);

  // 同步最新内容引用，避免异步保存读取到旧 props。
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    splitWarmupRef.current = splitWarmup;
  }, [splitWarmup]);

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

  const registerEditorInstanceForCurrentBinding = useCallback(
    (currentSplitWarmup: SplitWarmupState | undefined) => {
      editorRegistrationCleanupRef.current?.();
      editorRegistrationCleanupRef.current = null;
      editorBindingSubscriptionCleanupRef.current?.();
      editorBindingSubscriptionCleanupRef.current = null;
      let registeredPaneKey: RichPaneKey | null = null;

      const synchronizeRegistration = () => {
        const binding = controllerRef.current.getActiveBinding();
        if (binding?.paneKey === registeredPaneKey) return;
        editorRegistrationCleanupRef.current?.();
        editorRegistrationCleanupRef.current = null;
        registeredPaneKey = binding?.paneKey ?? null;
        if (!binding) return;

        editorRegistrationCleanupRef.current = editorInstanceRegistry.register({
          groupId: binding.groupId,
          tabId: binding.tabId,
          path,
          editor,
          standby: Boolean(currentSplitWarmup),
          mirrorSourceGroupId: currentSplitWarmup?.sourceGroupId,
          mirrorSourceTabId: currentSplitWarmup?.sourceTabId,
          isApplying: () => suppressChangeRef.current,
          onSynchronizationPending: () => {
            const current = controllerRef.current.getActiveBinding();
            if (!current) return;
            const store = useEditorStore.getState();
            const group = store.panelGroups.find(
              (candidate) => candidate.id === current.groupId,
            );
            if (group?.splitWarmup) {
              store.markSplitWarmupPreparing(current.groupId);
            }
          },
          onSynchronized: () => {
            const current = controllerRef.current.getActiveBinding();
            const warmup = splitWarmupRef.current;
            if (
              current &&
              warmup &&
              editorInstanceRegistry.isDocumentSynchronized(
                warmup.sourceGroupId,
                warmup.sourceTabId,
                current.groupId,
                current.tabId,
              )
            ) {
              useEditorStore.getState().markSplitWarmupReady(current.groupId);
            }
          },
          onDesynchronized: () => {
            const current = controllerRef.current.getActiveBinding();
            if (!current) return;
            const store = useEditorStore.getState();
            const currentGroup = store.panelGroups.find(
              (group) => group.id === current.groupId,
            );
            if (currentGroup?.splitWarmup) {
              store.markSplitWarmupStale(current.groupId);
            } else {
              store.incrementTabReloadKey(current.groupId, current.tabId);
            }
          },
        });

        if (!currentSplitWarmup) return;
        const synchronized = editorInstanceRegistry.isDocumentSynchronized(
          currentSplitWarmup.sourceGroupId,
          currentSplitWarmup.sourceTabId,
          binding.groupId,
          binding.tabId,
        );
        const store = useEditorStore.getState();
        if (synchronized) store.markSplitWarmupReady(binding.groupId);
        else store.markSplitWarmupStale(binding.groupId);
      };

      synchronizeRegistration();
      editorBindingSubscriptionCleanupRef.current = useEditorStore.subscribe(
        synchronizeRegistration,
      );
    },
    [editor, path],
  );

  const serializeChange = useCallback(async () => {
    const lifecycleGeneration = lifecycleGenerationRef.current;
    const isCurrentLifecycle = () =>
      lifecycleActiveRef.current &&
      lifecycleGenerationRef.current === lifecycleGeneration;
    if (!isCurrentLifecycle() || suppressChangeRef.current) return;
    // 页面不可见时跳过序列化，避免后台窗口占用 CPU 阻塞用户交互。
    if (document.visibilityState === "hidden") return;
    if (serializationInFlightRef.current) {
      serializationQueuedRef.current = true;
      await serializationInFlightRef.current;
      if (!isCurrentLifecycle()) return;
      return;
    }

    const pendingRevision = changeGateRef.current.capturePendingRevision();
    if (pendingRevision === null) return;

    const runSerialization = (async () => {
      if (baselineSerializationRef.current) {
        await baselineSerializationRef.current;
        if (!isCurrentLifecycle()) return;
      }
      const serialized = await serializeMarkdown(editor, editor.document);
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
            editor.document,
            parserCacheVersion,
            serialized,
          );
        }
        if (!isCurrentLifecycle()) return;
        changeGateRef.current.markSerialized(pendingRevision);
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
        changeGateRef.current.markSerialized(pendingRevision);
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
          editor.document,
          parserCacheVersion,
          serialized,
        );
      }
      if (!isCurrentLifecycle()) return;
      controllerRef.current.onWordCountChange(markdown.length);
      if (!isCurrentLifecycle()) return;
      controllerRef.current.onMarkdownChange(markdown);
      if (!isCurrentLifecycle()) return;
      changeGateRef.current.markSerialized(pendingRevision);
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
        serializationCancelRef.current = scheduleEditorIdleTask(() => {
          serializationCancelRef.current = null;
          void serializeChangeRef.current();
        }, 1200);
      } else {
        serializationQueuedRef.current = false;
      }
    }
  }, [editor, path, reloadKey]);
  serializeChangeRef.current = serializeChange;

  useEditorChange(() => {
    if (changeGateRef.current.capturePendingRevision() === null) return;
    if (serializationCancelRef.current) {
      serializationCancelRef.current();
    }
    // 大文档序列化会占用主线程；后台保存让位给弹窗、菜单等即时交互。
    const docLength = contentRef.current.length;
    const idleTimeout =
      docLength > 20000
        ? 15000
        : docLength > 12000
          ? 9000
          : docLength > 6000
            ? 3000
            : 1800;
    serializationCancelRef.current = scheduleEditorIdleTask(() => {
      serializationCancelRef.current = null;
      void serializeChange();
    }, idleTimeout);

    // 大纲提取同样会遍历整棵文档树，大文档下延后执行，避免抢占点击反馈。
    if (outlineUpdateCancelRef.current) {
      outlineUpdateCancelRef.current();
    }
    const outlineIdleTimeout =
      docLength > 20000 ? 12000 : docLength > 12000 ? 7000 : 1500;
    outlineUpdateCancelRef.current = scheduleEditorIdleTask(() => {
      outlineUpdateCancelRef.current = null;
      if (!isActiveEditorRef.current) return;
      if (serializationInFlightRef.current) return;

      updateOutlineHeadings();
    }, outlineIdleTimeout);
  }, editor);

  useEffect(() => {
    lifecycleActiveRef.current = true;
    const applyToken = ++applyTokenRef.current;
    baselineSerializationRef.current = null;
    cacheAppliedDocument();
    suppressChangeRef.current = true;
    changeGateRef.current.resetAfterProgrammaticChange();

    const applyContent = async () => {
      try {
        const currentSplitWarmup = splitWarmupRef.current;
        const rawSource = contentRef.current;
        const source = repairMarkdownSourceBeforeParse(rawSource);
        const sourceWasRepaired = !markdownEquals(source, rawSource);
        if (sourceWasRepaired) {
          // 打开历史异常文件时先修复已拼接的列表源码，避免富文本和源码继续分叉。
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
        const liveSourceBlocks = currentSplitWarmup
          ? editorInstanceRegistry.getDocumentSnapshot(
              currentSplitWarmup.sourceGroupId,
              currentSplitWarmup.sourceTabId,
            )
          : null;
        const parsedBlocks =
          liveSourceBlocks ??
          cached?.blocks ??
          (await parseMarkdown(editor, source || "", {
            markdownFilePath: path,
            resolveImageUrl: loadEditorImageUrl,
          }));
        const blocks = ensureEditableBlocks(parsedBlocks, () => {
          return { type: "paragraph", content: [] } as Block;
        });
        // Markdown 解析可能晚于下一次切换完成，旧结果不得再写入编辑器。
        if (applyToken !== applyTokenRef.current) return;
        if (sourceWasRepaired) {
          controllerRef.current.onWordCountChange(source.length);
          controllerRef.current.onMarkdownChange(source);
        }
        // 后台预热不得清除当前可见编辑器的选区或打断连续输入。
        if (!currentSplitWarmup) {
          window.getSelection()?.removeAllRanges();
        }
        editor.replaceBlocks(editor.document, blocks);
        appliedPathRef.current = path;
        appliedSourceRef.current = source;
        const restoredScrollTop = chooseRestoredEditorScrollTop({
          currentPath,
          nextPath: path,
          currentScrollTop,
          cachedScrollTop: undefined,
        });
        serializedBaselineRef.current = cached?.serializedBaseline ?? null;
        if (path) {
          editorCache.setContent(path, source);
          editorCache.setBlocks(
            path,
            source,
            blocks,
            parserCacheVersion,
            cached?.serializedBaseline,
          );
        }
        ensureRichRuntime(editor.document);
        restoreEditorScrollTop(scrollContainerRef.current, restoredScrollTop);
        controllerRef.current.onParseStateChange(null);

        registerEditorInstanceForCurrentBinding(currentSplitWarmup);

        if (serializedBaselineRef.current === null) {
          const baselinePath = path;
          const baselineSource = source;
          const baselineBlocks = blocks;
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
      editorRegistrationCleanupRef.current?.();
      editorRegistrationCleanupRef.current = null;
      editorBindingSubscriptionCleanupRef.current?.();
      editorBindingSubscriptionCleanupRef.current = null;
    };
    // 普通输入只更新 contentRef；仅文件切换或显式重载时替换整篇文档。
  }, [
    cacheAppliedDocument,
    cancelPendingEditorWork,
    editor,
    ensureRichRuntime,
    loadEditorImageUrl,
    path,
    registerEditorInstanceForCurrentBinding,
    reloadKey,
  ]);

  useEffect(() => {
    let registeredPaneKey: RichPaneKey | null = null;
    let releaseFlusher: (() => void) | null = null;
    const synchronizeRegistration = () => {
      const binding = controllerRef.current.getActiveBinding();
      if (binding?.paneKey === registeredPaneKey) return;
      releaseFlusher?.();
      registeredPaneKey = binding?.paneKey ?? null;
      releaseFlusher = binding
        ? registerEditorChangeFlusher(
            binding.groupId,
            binding.tabId,
            async () => {
              serializationCancelRef.current?.();
              serializationCancelRef.current = null;
              await serializeChangeRef.current();
            },
            () => {
              // 放弃文件更改时取消尚未执行的序列化，避免旧内容稍后再次进入保存队列。
              serializationCancelRef.current?.();
              serializationCancelRef.current = null;
            },
          )
        : null;
    };

    synchronizeRegistration();
    const unsubscribe = useEditorStore.subscribe(synchronizeRegistration);
    return () => {
      unsubscribe();
      releaseFlusher?.();
    };
  }, []);

  useEffect(
    () => () => {
      invalidateEditorLifecycle();
      editorRegistrationCleanupRef.current?.();
      editorRegistrationCleanupRef.current = null;
      editorBindingSubscriptionCleanupRef.current?.();
      editorBindingSubscriptionCleanupRef.current = null;
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
    opacity: appearance.opacity / 100,
    "--editor-font-size": `${appearance.fontSize}px`,
    "--editor-line-height": appearance.lineHeight,
    "--editor-padding": `${appearance.padding}px`,
  } as CSSProperties;

  const blockExternalFileDrop = useCallback((event: React.DragEvent) => {
    const types = event.dataTransfer.types;
    if (
      !types.includes("blocknote/html") &&
      (types.includes("application/x-keep-notes-file") ||
        types.includes("Files"))
    ) {
      event.preventDefault();
    }
  }, []);

  const markUserIntent = useCallback(() => {
    changeGateRef.current.markUserIntent();
  }, []);

  const handleFocus = useCallback(() => {
    const binding = controllerRef.current.getActiveBinding();
    if (!binding) return;
    // 焦点事件发生时再读取 binding，表面移动后不会把操作写回旧面板。
    editorInstanceRegistry.flushPending(binding.groupId, binding.tabId);
    const store = useEditorStore.getState();
    store.setActiveGroupId(binding.groupId);
    store.setActiveTab(binding.groupId, binding.tabId);
  }, []);

  const readCurrentScrollOwner = useCallback((): RichPaneScrollOwner | null => {
    const binding = controllerRef.current.getActiveBinding();
    if (!binding) return null;

    const owner = toScrollOwner(binding);
    return path && owner.path === normalizeRichDocumentPath(path)
      ? owner
      : null;
  }, [path]);

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const owner = readCurrentScrollOwner();
      if (!owner) return;

      // 高频滚动只更新 ref/registry；Zustand 在 150ms idle 或生命周期边界才写入。
      scrollWriterRef.current?.record(owner, event.currentTarget.scrollTop);
    },
    [readCurrentScrollOwner],
  );

  const handleBlur = useCallback(() => {
    const owner = readCurrentScrollOwner();
    if (owner) scrollWriterRef.current?.flushOwner(owner);
    else scrollWriterRef.current?.flushAll();
  }, [readCurrentScrollOwner]);

  const handlePointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (shouldMarkRichEditorPointerIntent(event.target)) {
        markUserIntent();
      }
    },
    [markUserIntent],
  );

  const handleKeyDownCapture = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      markUserIntent();
      if (shouldLetCodeMirrorHandleKeyboardEvent(event.target)) return;
      if (handleRichEditorHeadingShortcut(event, editor)) return;
      handleRichEditorSelectAllShortcut(event, editor);
    },
    [editor, markUserIntent],
  );

  useEffect(() => {
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
    document.addEventListener(
      "dragstart",
      handleFloatingControlDragStart,
      true,
    );
    return () => {
      document.removeEventListener(
        "pointerdown",
        handleFloatingControlPointerDown,
        true,
      );
      document.removeEventListener(
        "dragstart",
        handleFloatingControlDragStart,
        true,
      );
    };
  }, [markUserIntent]);

  return (
    <div
      ref={scrollContainerRef}
      className="editor-rich-scroll h-full overflow-y-auto overflow-x-hidden"
      style={editorStyle}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onClick={handleFocus}
      onScroll={handleScroll}
      onBeforeInputCapture={markUserIntent}
      onKeyDownCapture={handleKeyDownCapture}
      onPointerDownCapture={handlePointerDownCapture}
      onPasteCapture={markUserIntent}
      onCutCapture={markUserIntent}
      onCompositionStartCapture={markUserIntent}
      onDragStartCapture={markUserIntent}
      onDragOverCapture={blockExternalFileDrop}
      onDropCapture={(event) => {
        markUserIntent();
        blockExternalFileDrop(event);
      }}
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
      </BlockNoteView>
    </div>
  );
}

export function BlockNoteEditor(
  props: LegacyBlockNoteEditorProps | BlockNoteEditorSessionProps,
) {
  if ("controller" in props) {
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

  return <LegacyBlockNoteEditor {...props} />;
}

function LegacyBlockNoteEditor({ groupId, tabId }: LegacyBlockNoteEditorProps) {
  useEditorStore(selectBlockNoteRuntimeSignature(groupId, tabId));
  const group = useEditorStore
    .getState()
    .panelGroups.find((item) => item.id === groupId);
  const tab = group?.tabs.find((item) => item.id === tabId);
  const tabFilePath = tab?.filePath ?? null;
  const controller = useMemo<RichEditorSessionController>(
    () => ({
      path: tabFilePath ?? "",
      getActiveBinding: () => {
        const currentTab = useEditorStore
          .getState()
          .panelGroups.find((currentGroup) => currentGroup.id === groupId)
          ?.tabs.find((item) => item.id === tabId);
        if (!currentTab) return null;
        return {
          groupId,
          tabId,
          paneKey: toRichPaneKey(groupId, tabId),
          path: currentTab.filePath ?? "",
        };
      },
      getBoundTabIds: () =>
        editorInstanceRegistry.getSynchronizedTabIds(groupId, tabId),
      onMarkdownChange: (content) => {
        const store = useEditorStore.getState();
        const currentTab = store.panelGroups
          .find((currentGroup) => currentGroup.id === groupId)
          ?.tabs.find((item) => item.id === tabId);
        if (!currentTab) return;
        store.setTabContent(groupId, tabId, content);
        if (!currentTab.filePath) return;

        const synchronizedTabIds = editorInstanceRegistry.getSynchronizedTabIds(
          groupId,
          tabId,
        );
        store.syncFileContent(
          currentTab.filePath,
          content,
          tabId,
          synchronizedTabIds,
        );
        const diffState = useDiffStore.getState();
        if (diffState.isOpen && diffState.filePath === currentTab.filePath) {
          diffState.updateContent(diffState.oldContent, content);
        }
        editorSaveCoordinator.schedule(currentTab.filePath, content);
      },
      onWordCountChange: (count) => {
        useEditorStore.getState().setTabWordCount(groupId, tabId, count);
      },
      onParseStateChange: (message) => {
        useEditorStore.getState().setTabParseError(groupId, tabId, message);
      },
      onRuntimeReady: () => () => {},
    }),
    [groupId, tabFilePath, tabId],
  );

  if (!tab) return null;

  return (
    <BlockNoteEditorInner
      controller={controller}
      content={tab.content}
      editorOwnerKey={`legacy:${groupId}:${tabId}`}
      path={tabFilePath}
      reloadKey={tab.reloadKey}
      splitWarmup={group?.splitWarmup}
    />
  );
}
