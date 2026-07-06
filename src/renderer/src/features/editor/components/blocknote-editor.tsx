import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
} from "react";
import {
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
  useBlockNoteEditor,
  useCreateBlockNote,
  useEditorState,
  useEditorChange,
  useComponentsContext,
  type FormattingToolbarProps,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { EditorView as CodeMirrorView } from "@codemirror/view";
import { CodeXml } from "lucide-react";
import type {
  Block,
  BlockNoteEditor as CoreBlockNoteEditor,
  InlineContent,
} from "@blocknote/core";
import { AllSelection } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { useTheme } from "@/hooks/use-theme";
import { useDiffStore } from "@/store/diff.store";
import { useEditorStore } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import {
  editorCache,
  editorSaveCoordinator,
  registerEditorChangeFlusher,
} from "../lib/editor-runtime";
import {
  ensureEditableBlocks,
  markdownEquals,
  parseMarkdown,
  preserveMarkdownSource,
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

interface BlockNoteEditorInnerProps {
  groupId: string;
  tabId: string;
  content: string;
  path: string | null;
  reloadKey: number;
  onChange: (content: string) => void;
  onFocus: () => void;
  onWordCountChange: (count: number) => void;
  onParseStateChange: (message: string | null) => void;
}

const MARKDOWN_PARSER_VERSION = "blocknote-v4";
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

function BlockNoteEditorInner({
  groupId,
  tabId,
  content,
  path,
  reloadKey,
  onChange,
  onFocus,
  onWordCountChange,
  onParseStateChange,
}: BlockNoteEditorInnerProps) {
  const appearance = useEditorStore((state) => state.appearance);
  const isActiveEditor = useEditorStore((state) => {
    const activeGroup = state.panelGroups.find(
      (group) => group.id === state.activeGroupId,
    );
    return (
      state.activeGroupId === groupId && activeGroup?.activeTabId === tabId
    );
  });
  const workspaceRootPath = useTreeStore(
    (state) => state.treeRoot?.key ?? null,
  );
  const { isDark } = useTheme();
  const suppressChangeRef = useRef(false);
  const changeGateRef = useRef(new EditorChangeGate());
  const contentRef = useRef(content);
  const pathRef = useRef(path);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const appliedPathRef = useRef<string | null>(null);
  const appliedSourceRef = useRef(content);
  const serializedBaselineRef = useRef<string | null>(null);
  const serializationCancelRef = useRef<(() => void) | null>(null);
  const serializationInFlightRef = useRef<Promise<void> | null>(null);
  const serializationQueuedRef = useRef(false);
  const serializeChangeRef = useRef<() => Promise<void>>(async () => {});
  const outlineUpdateCancelRef = useRef<(() => void) | null>(null);
  const outlineScrollTokenRef = useRef(0);
  const isActiveEditorRef = useRef(isActiveEditor);
  const applyTokenRef = useRef(0);
  const editorRef = useRef<CoreBlockNoteEditor | null>(null);
  const workspaceRootPathRef = useRef(workspaceRootPath);
  const loadEditorImageUrl = useCallback(async (url: string) => {
    try {
      return (await window.electronAPI.loadImageAsDataUrl(url)) ?? url;
    } catch {
      return url;
    }
  }, []);
  const uploadEditorImageFile = useCallback(
    async (file: File, blockId?: string) => {
      return uploadEditorImageFileAsAttachment(file, {
        getWorkspaceRootPath: () => workspaceRootPathRef.current,
        getMarkdownFilePath: () => pathRef.current,
        saveImageAttachment: window.electronAPI.saveImageAttachment,
        moveCursorAfterUpload: () => {
          window.setTimeout(() => {
            moveCursorAfterUploadedImage(editorRef.current, blockId);
          }, 0);
        },
      });
    },
    [],
  );
  const editor = useCreateBlockNote({
    initialContent: undefined,
    resolveFileUrl: (url) => {
      return loadEditorImageUrl(resolveEditorImageUrl(url, pathRef.current));
    },
    schema: editorSchema,
    uploadFile: uploadEditorImageFile,
  });
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

  // 通过 store 暴露跳转函数给侧边栏
  useEffect(
    () => registerEditorOutlineNavigator(groupId, tabId, scrollToBlock),
    [groupId, scrollToBlock, tabId],
  );

  // 同步最新内容引用，避免异步保存读取到旧 props。
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  useEffect(() => {
    pathRef.current = path;
  }, [path]);

  useEffect(() => {
    workspaceRootPathRef.current = workspaceRootPath;
  }, [workspaceRootPath]);

  useLayoutEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    // 文件切换或重载开始时立即回到顶部，不等待 Markdown 解析和 BlockNote 替换完成。
    scrollContainer.scrollTop = 0;
  }, [path, reloadKey]);

  const cacheAppliedDocument = useCallback(() => {
    const appliedPath = appliedPathRef.current;
    if (!appliedPath) return;

    editorCache.setContent(appliedPath, appliedSourceRef.current);
    editorCache.setBlocks(
      appliedPath,
      appliedSourceRef.current,
      editor.document,
      MARKDOWN_PARSER_VERSION,
    );
  }, [editor]);

  const serializeChange = useCallback(async () => {
    if (suppressChangeRef.current) return;
    if (serializationInFlightRef.current) {
      serializationQueuedRef.current = true;
      await serializationInFlightRef.current;
      return;
    }

    const pendingRevision = changeGateRef.current.capturePendingRevision();
    if (pendingRevision === null) return;

    const runSerialization = (async () => {
      const serialized = await serializeMarkdown(editor, editor.document);
      const baseline = serializedBaselineRef.current;
      if (baseline === null) {
        serializedBaselineRef.current = serialized;
        changeGateRef.current.markSerialized(pendingRevision);
        return;
      }
      if (markdownEquals(serialized, baseline)) {
        changeGateRef.current.markSerialized(pendingRevision);
        return;
      }
      const markdown = preserveMarkdownSource(
        contentRef.current,
        baseline,
        serialized,
      );
      serializedBaselineRef.current = serialized;
      if (markdownEquals(markdown, contentRef.current)) {
        changeGateRef.current.markSerialized(pendingRevision);
        return;
      }

      // 只有当前文档真正序列化成功后，才推进解析缓存对应的源码快照。
      contentRef.current = markdown;
      appliedSourceRef.current = markdown;
      if (path) {
        editorCache.setContent(path, markdown);
        editorCache.setBlocks(
          path,
          markdown,
          editor.document,
          MARKDOWN_PARSER_VERSION,
        );
      }
      onWordCountChange(markdown.length);
      onChange(markdown);
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
  }, [editor, onChange, onWordCountChange, path]);
  serializeChangeRef.current = serializeChange;

  useEditorChange(() => {
    if (changeGateRef.current.capturePendingRevision() === null) return;
    if (serializationCancelRef.current) {
      serializationCancelRef.current();
    }
    serializationCancelRef.current = scheduleEditorIdleTask(() => {
      serializationCancelRef.current = null;
      void serializeChange();
    }, 1800);

    // 更新大纲标题列表到 store
    if (outlineUpdateCancelRef.current) {
      outlineUpdateCancelRef.current();
    }
    outlineUpdateCancelRef.current = scheduleEditorIdleTask(() => {
      outlineUpdateCancelRef.current = null;
      if (!isActiveEditorRef.current) return;
      if (serializationInFlightRef.current) return;

      updateOutlineHeadings();
    }, 1500);
  }, editor);

  useEffect(() => {
    const applyToken = ++applyTokenRef.current;
    cacheAppliedDocument();
    suppressChangeRef.current = true;
    changeGateRef.current.resetAfterProgrammaticChange();

    const applyContent = async () => {
      try {
        const source = contentRef.current;
        const currentPath = appliedPathRef.current;
        const currentScrollTop = readEditorScrollTop(
          scrollContainerRef.current,
        );
        // 解析规则升级后不能复用旧块缓存，否则会继续显示错误的列表或代码块结构。
        const cached = path
          ? editorCache.getBlocks(path, source, MARKDOWN_PARSER_VERSION)
          : null;
        const parsedBlocks =
          cached?.blocks ??
          (await parseMarkdown(editor, source || "", {
            markdownFilePath: path,
            resolveImageUrl: loadEditorImageUrl,
          }));
        const blocks = ensureEditableBlocks(parsedBlocks, () => {
          return { type: "paragraph", content: [] } as Block;
        });
        const serializedBaseline = await serializeMarkdown(editor, blocks);

        // Markdown 解析可能晚于下一次切换完成，旧结果不得再写入编辑器。
        if (applyToken !== applyTokenRef.current) return;
        window.getSelection()?.removeAllRanges();
        editor.replaceBlocks(editor.document, blocks);
        appliedPathRef.current = path;
        appliedSourceRef.current = source;
        const restoredScrollTop = chooseRestoredEditorScrollTop({
          currentPath,
          nextPath: path,
          currentScrollTop,
          cachedScrollTop: undefined,
        });
        serializedBaselineRef.current = serializedBaseline;
        if (path) {
          editorCache.setContent(path, source);
          editorCache.setBlocks(path, source, blocks, MARKDOWN_PARSER_VERSION);
        }
        restoreEditorScrollTop(scrollContainerRef.current, restoredScrollTop);
        onParseStateChange(null);

        // 内容加载完成后更新大纲标题列表
        if (isActiveEditorRef.current) {
          updateOutlineHeadings();
          flushPendingEditorOutlineNavigation(groupId, tabId);
        }
      } catch (error) {
        if (applyToken !== applyTokenRef.current) return;
        const fallback = createParseFallback(error);
        onParseStateChange(fallback.message);
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
    };
    // 普通输入只更新 contentRef；仅文件切换或显式重载时替换整篇文档。
  }, [
    cacheAppliedDocument,
    editor,
    loadEditorImageUrl,
    onParseStateChange,
    path,
    reloadKey,
  ]);

  useEffect(
    () =>
      registerEditorChangeFlusher(
        groupId,
        tabId,
        async () => {
          if (serializationCancelRef.current) {
            serializationCancelRef.current();
            serializationCancelRef.current = null;
          }
          await serializeChange();
        },
        () => {
          // 放弃文件更改时取消尚未执行的序列化，避免旧内容稍后再次进入保存队列。
          if (serializationCancelRef.current) {
            serializationCancelRef.current();
            serializationCancelRef.current = null;
          }
        },
      ),
    [groupId, serializeChange, tabId],
  );

  useEffect(
    () => () => {
      if (serializationCancelRef.current) {
        serializationCancelRef.current();
      }
      if (outlineUpdateCancelRef.current) {
        outlineUpdateCancelRef.current();
      }
      cacheAppliedDocument();
    },
    [cacheAppliedDocument],
  );

  const editorStyle = {
    backgroundColor: "var(--bg-primary)",
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

    document.addEventListener(
      "pointerdown",
      handleFloatingControlPointerDown,
      true,
    );
    return () => {
      document.removeEventListener(
        "pointerdown",
        handleFloatingControlPointerDown,
        true,
      );
    };
  }, [markUserIntent]);

  return (
    <div
      ref={scrollContainerRef}
      className="editor-rich-scroll h-full overflow-y-auto overflow-x-hidden"
      style={editorStyle}
      onFocus={onFocus}
      onClick={onFocus}
      onBeforeInputCapture={markUserIntent}
      onKeyDownCapture={handleKeyDownCapture}
      onPointerDownCapture={handlePointerDownCapture}
      onPasteCapture={markUserIntent}
      onCutCapture={markUserIntent}
      onCompositionStartCapture={markUserIntent}
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

export function BlockNoteEditor({
  groupId,
  tabId,
}: {
  groupId: string;
  tabId: string;
}) {
  const tab = useEditorStore((state) =>
    state.panelGroups
      .find((group) => group.id === groupId)
      ?.tabs.find((item) => item.id === tabId),
  );
  const setActiveGroupId = useEditorStore((state) => state.setActiveGroupId);
  const setActiveTab = useEditorStore((state) => state.setActiveTab);
  const setTabContent = useEditorStore((state) => state.setTabContent);
  const setTabWordCount = useEditorStore((state) => state.setTabWordCount);
  const setTabParseError = useEditorStore((state) => state.setTabParseError);
  const syncFileContent = useEditorStore((state) => state.syncFileContent);

  const handleFocus = useCallback(() => {
    setActiveGroupId(groupId);
    setActiveTab(groupId, tabId);
  }, [groupId, setActiveGroupId, setActiveTab, tabId]);

  const handleChange = useCallback(
    (content: string) => {
      if (!tab) return;
      setTabContent(groupId, tabId, content);
      if (!tab.filePath) return;

      syncFileContent(tab.filePath, content, tabId);
      const diffState = useDiffStore.getState();
      if (diffState.isOpen && diffState.filePath === tab.filePath) {
        diffState.updateContent(diffState.oldContent, content);
      }
      editorSaveCoordinator.schedule(tab.filePath, content);
    },
    [groupId, setTabContent, syncFileContent, tab, tabId],
  );

  const handleParseStateChange = useCallback(
    (message: string | null) => {
      setTabParseError(groupId, tabId, message);
    },
    [groupId, setTabParseError, tabId],
  );

  if (!tab) return null;

  return (
    <BlockNoteEditorInner
      groupId={groupId}
      tabId={tabId}
      content={tab.content}
      path={tab.filePath}
      reloadKey={tab.reloadKey}
      onChange={handleChange}
      onFocus={handleFocus}
      onWordCountChange={(count) => setTabWordCount(groupId, tabId, count)}
      onParseStateChange={handleParseStateChange}
    />
  );
}
