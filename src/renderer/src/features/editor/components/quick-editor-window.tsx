import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote, useEditorChange } from "@blocknote/react";
import type { BlockNoteEditor as CoreBlockNoteEditor } from "@blocknote/core";
import { TextSelection } from "@tiptap/pm/state";
import { ChevronDown, ChevronUp, Info, X } from "lucide-react";
import type {
  CloseSaveSnapshot,
  QuickEditorWindowContent,
} from "@shared/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DialogResizeHandles } from "@/components/ui/dialog-resize-handles";
import { DiffViewer } from "@/features/diff";
import {
  DIFF_NO_CHANGES_MESSAGE,
  DIFF_NO_DIFF_MESSAGE,
} from "@/features/diff/lib/diff-toast";
import { areDiffContentsEqual } from "@/features/diff/lib/diff-content";
import { useTheme } from "@/hooks/use-theme";
import { useResizableDialog } from "@/hooks/use-resizable-dialog";
import { useEditorStore, type EditorMode } from "@/store/editor.store";
import { CodeResult } from "@/types";
import { getRevealInFileManagerLabel } from "@/features/file-tree/utils";
import { hasNoHeadVersion, toGitRelativePath } from "../lib/editor-git-actions";
import { editorSchema } from "../lib/blocknote-schema";
import {
  moveCursorAfterUploadedImage,
  readImageFileAsDataUrl,
  type UploadedImageCursorEditor,
} from "../lib/editor-image";
import { EDITOR_EMPTY_PLACEHOLDER } from "../lib/editor-placeholder";
import { configureRichTextUndoHistory } from "../lib/editor-undo-history";
import { scheduleStableEditorBlockScroll } from "../lib/editor-viewport";
import {
  clearEditorFindHighlights,
  collectEditorFindRanges,
  renderEditorFindHighlightFallback,
  selectEditorFindRanges,
  scrollRangeIntoView,
} from "../lib/editor-find-highlights";
import {
  findTextMatches,
  getSteppedMatchIndex,
  replaceAllTextMatches,
  replaceTextMatch,
  type FindTextOptions,
} from "../lib/find-in-file";
import {
  markdownEquals,
  parseMarkdown,
  preserveMarkdownSource,
  serializeMarkdown,
} from "../lib/markdown";
import { FindWidget } from "./find-widget";
import { MarkdownSourceEditor } from "./markdown-source-editor";
import {
  createRichEditorSelectionDragGuardPlugin,
  EditorFormattingToolbar,
  EditorSideMenuController,
  focusEditorOutlineBlock,
  getRichEditorInlineContentFromTarget,
  handleRichEditorHeadingShortcut,
  handleRichEditorSelectAllShortcut,
  pasteMarkupAsPlainText,
  RICH_EDITOR_SELECTION_DRAG_LOCK_CLASS,
  registerRichEditorSelectionDragGuardPlugin,
  richEditorDefaultUIProps,
  shouldPreventRichEditorGutterSelectionDrag,
  unregisterRichEditorSelectionDragGuardPlugin,
  type RichEditorSelectionDragBounds,
  type RichEditorSelectionDragPointer,
} from "./blocknote-editor";
import { QuickEditorActionsMenu } from "./quick-editor-actions-menu";
import {
  extractQuickEditorOutlineHeadings,
  QuickEditorOutline,
  type QuickEditorOutlineHeading,
} from "./quick-editor-outline";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "@/styles/blocknote-overrides.css";
import "./quick-editor-window.css";

const QUICK_EDITOR_MORE_ACTIONS_MIN_HEIGHT = 200;
const QUICK_EDITOR_TOAST_DURATION = 3000;
const NOOP = () => undefined;

interface QuickEditorDiffState {
  fileName: string;
  newContent: string;
  oldContent: string;
}

interface QuickEditorBlock {
  children?: QuickEditorBlock[];
  content?: unknown;
  type: string;
}

interface QuickEditorBridgeWindow extends Window {
  __getNextDirtyEditor?: () => Promise<CloseSaveSnapshot | null>;
  __onCloseSaveSuccess?: (
    groupId: string,
    tabId: string,
    filePath: string | null,
    savedContent: string,
  ) => Promise<void>;
}

const QUICK_EDITOR_GROUP_ID = "quick-editor";
const QUICK_EDITOR_TAB_ID = "quick-editor-draft";

function inlineContentHasText(content: unknown): boolean {
  if (typeof content === "string") return content.trim().length > 0;
  if (!Array.isArray(content)) return false;

  return content.some((item) => {
    if (typeof item === "string") return item.trim().length > 0;
    if (!item || typeof item !== "object") return false;

    const record = item as Record<string, unknown>;
    return (
      inlineContentHasText(record.text) || inlineContentHasText(record.content)
    );
  });
}

export function hasMeaningfulQuickEditorContent(
  blocks: readonly QuickEditorBlock[],
): boolean {
  return blocks.some((block) => {
    if (block.type !== "paragraph") return true;
    if (inlineContentHasText(block.content)) return true;
    return block.children
      ? hasMeaningfulQuickEditorContent(block.children)
      : false;
  });
}

export async function uploadQuickEditorImage(file: File): Promise<string> {
  const dataUrl = await readImageFileAsDataUrl(file);
  if (!dataUrl) {
    throw new Error("Only image files can be uploaded from the editor");
  }

  return dataUrl;
}

export function createQuickEditorImageUploader(
  getEditor: () => UploadedImageCursorEditor | null,
  schedule: (callback: () => void) => unknown,
) {
  return async (file: File, blockId?: string): Promise<string> => {
    const url = await uploadQuickEditorImage(file);
    schedule(() => {
      moveCursorAfterUploadedImage(getEditor(), blockId);
    });
    return url;
  };
}

export function resolveQuickEditorMarkdown(
  source: string | null,
  baseline: string | null,
  serialized: string,
): string {
  if (source === null || baseline === null) return serialized;
  return preserveMarkdownSource(source, baseline, serialized);
}

function findQuickEditorBlockElement(root: Element | null, blockId: string) {
  return getQuickEditorBlockElementLookup(root).get(blockId) ?? null;
}

function getQuickEditorBlockElementLookup(root: Element | null) {
  const elements = root?.querySelectorAll<HTMLElement>(
    '[data-node-type="blockOuter"][data-id]',
  );
  return new Map(
    Array.from(elements ?? [], (element) => [element.dataset.id, element]),
  );
}

function quickEditorHeadingSnapshotsEqual(
  previous: readonly QuickEditorOutlineHeading[],
  next: readonly QuickEditorOutlineHeading[],
) {
  return (
    previous.length === next.length &&
    previous.every((heading, index) => {
      const candidate = next[index];
      return (
        candidate?.id === heading.id &&
        candidate.level === heading.level &&
        candidate.text === heading.text
      );
    })
  );
}

export function QuickEditorWindow() {
  const appearance = useEditorStore((state) => state.appearance);
  const { isDark } = useTheme({ transparentBackground: true });
  const dirtyRef = useRef(false);
  const returnInProgressRef = useRef(false);
  const sourceRef = useRef<QuickEditorWindowContent["source"]>(null);
  const sourceMarkdownRef = useRef("");
  const lastSyncedContentRef = useRef<string | null>(null);
  const serializedBaselineRef = useRef<string | null>(null);
  const syncRevisionRef = useRef(0);
  const editorRef = useRef<CoreBlockNoteEditor | null>(null);
  const sourceEditorRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectionDragBoundsRef = useRef<RichEditorSelectionDragBounds | null>(
    null,
  );
  const selectionDragPointerRef = useRef<RichEditorSelectionDragPointer | null>(
    null,
  );
  const selectionDragAnchorRef = useRef<number | null>(null);
  const activeHeadingFrameRef = useRef<number | null>(null);
  const outlineScrollTokenRef = useRef(0);
  const isFindOpenRef = useRef(false);
  const isOutlineOpenRef = useRef(false);
  const outlineDirtyRef = useRef(true);
  const outlineHeadingsRef = useRef<QuickEditorOutlineHeading[]>([]);
  const activeHeadingIdRef = useRef<string | null>(null);
  const replacementUndoStackRef = useRef<string[]>([]);
  const toastTimerRef = useRef<number | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [linkedFilePath, setLinkedFilePath] = useState<string | null>(null);
  const [linkedRepositoryRoot, setLinkedRepositoryRoot] = useState<
    string | null
  >(null);
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [diffState, setDiffState] = useState<QuickEditorDiffState | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("rich");
  const [sourceMarkdown, setSourceMarkdown] = useState("");
  const [hasMoreActionsHeight, setHasMoreActionsHeight] = useState(
    () => window.innerHeight > QUICK_EDITOR_MORE_ACTIONS_MIN_HEIGHT,
  );
  const [isCollapseStateReady, setIsCollapseStateReady] = useState(false);
  const [collapseTarget, setCollapseTarget] = useState<boolean | null>(null);
  const [isCollapseTransitioning, setIsCollapseTransitioning] = useState(false);
  const [isFindOpen, setIsFindOpen] = useState(false);
  const [findFocusRequestKey, setFindFocusRequestKey] = useState(0);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [outlineHeadings, setOutlineHeadings] = useState<
    QuickEditorOutlineHeading[]
  >([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [findContent, setFindContent] = useState("");
  const [findQuery, setFindQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [findOptions, setFindOptions] = useState<FindTextOptions>({});
  const [activeFindIndex, setActiveFindIndex] = useState(-1);
  const handleImageUploadRef = useRef(
    createQuickEditorImageUploader(
      () => editorRef.current,
      (callback) => window.setTimeout(callback, 0),
    ),
  );
  const editor = useCreateBlockNote({
    placeholders: { default: EDITOR_EMPTY_PLACEHOLDER },
    schema: editorSchema,
    uploadFile: handleImageUploadRef.current,
  });
  editorRef.current = editor;

  const handleRichEditorPasteCapture = useCallback(
    (event: ReactClipboardEvent<HTMLDivElement>) => {
      if (!pasteMarkupAsPlainText(editor, event.nativeEvent)) return;

      // 浮动窗口同样在容器捕获阶段保留源码标签，避免进入 BlockNote 的 HTML 解析器。
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
    },
    [editor],
  );

  useLayoutEffect(() => {
    // 与面板富文本共用撤销深度，避免独立窗口在长时间编辑后过早丢失撤销记录。
    configureRichTextUndoHistory(editor);
  }, [editor]);

  const updateActiveHeading = useCallback((nextHeadingId: string | null) => {
    if (activeHeadingIdRef.current === nextHeadingId) return;
    activeHeadingIdRef.current = nextHeadingId;
    setActiveHeadingId(nextHeadingId);
  }, []);

  const cancelActiveHeadingUpdate = useCallback(() => {
    if (activeHeadingFrameRef.current === null) return;
    window.cancelAnimationFrame(activeHeadingFrameRef.current);
    activeHeadingFrameRef.current = null;
  }, []);

  const scheduleActiveHeadingUpdate = useCallback(() => {
    if (!isOutlineOpenRef.current || activeHeadingFrameRef.current !== null) {
      return;
    }

    // 打开、内容刷新与滚动共用同一帧调度，避免重复读取布局。
    activeHeadingFrameRef.current = window.requestAnimationFrame(() => {
      activeHeadingFrameRef.current = null;
      const container = scrollContainerRef.current;
      const headings = outlineHeadingsRef.current;
      if (!container || headings.length === 0) return;

      const activationTop = container.getBoundingClientRect().top + 24;
      const blockElements = getQuickEditorBlockElementLookup(editor.domElement);
      let nextActiveId = headings[0]?.id ?? null;
      for (const heading of headings) {
        const element = blockElements.get(heading.id);
        if (!element || element.getBoundingClientRect().top > activationTop)
          break;
        nextActiveId = heading.id;
      }
      updateActiveHeading(nextActiveId);
    });
  }, [editor, updateActiveHeading]);

  const refreshOutline = useCallback(() => {
    // 浮窗独立维护大纲；只有标题快照真实变化时才触发 React 更新。
    const headings = extractQuickEditorOutlineHeadings(editor.document);
    outlineDirtyRef.current = false;
    if (
      !quickEditorHeadingSnapshotsEqual(outlineHeadingsRef.current, headings)
    ) {
      outlineHeadingsRef.current = headings;
      setOutlineHeadings(headings);
    }

    const current = activeHeadingIdRef.current;
    updateActiveHeading(
      current && headings.some((heading) => heading.id === current)
        ? current
        : (headings[0]?.id ?? null),
    );
    scheduleActiveHeadingUpdate();
  }, [editor, scheduleActiveHeadingUpdate, updateActiveHeading]);

  const handleOutlineDocumentChange = useCallback(() => {
    // 抽屉关闭时只记录脏标记，避免每次输入都遍历整篇文档。
    if (!isOutlineOpenRef.current) {
      outlineDirtyRef.current = true;
      return;
    }
    refreshOutline();
  }, [refreshOutline]);

  const setOutlineVisibility = useCallback(
    (isOpen: boolean) => {
      isOutlineOpenRef.current = isOpen;
      setIsOutlineOpen(isOpen);
      if (!isOpen) {
        cancelActiveHeadingUpdate();
        return;
      }
      if (outlineDirtyRef.current) refreshOutline();
      else scheduleActiveHeadingUpdate();
    },
    [cancelActiveHeadingUpdate, refreshOutline, scheduleActiveHeadingUpdate],
  );

  const rawMatches = useMemo(
    () =>
      findQuery ? findTextMatches(findContent, findQuery, findOptions) : [],
    [findContent, findOptions, findQuery],
  );

  const readCollapsedState = useCallback(async (): Promise<boolean | null> => {
    try {
      return await window.electronAPI.getQuickEditorCollapsed();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readCollapsedState().then((collapsed) => {
      if (cancelled) return;
      if (collapsed !== null) setIsCollapsed(collapsed);
      setIsCollapseStateReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [readCollapsedState]);

  useEffect(() => {
    const subscribe = window.electronAPI.onQuickEditorCollapsedChanged;
    if (!subscribe) return;
    return subscribe(setIsCollapsed);
  }, []);

  useEffect(() => {
    const syncAppearanceFromSettings = (event: StorageEvent) => {
      if (event.key !== "editor-storage") return;
      // 外观设置在主窗口变更后，浮窗重新读取持久化状态以同步透明度。
      void useEditorStore.persist.rehydrate();
    };
    window.addEventListener("storage", syncAppearanceFromSettings);
    return () =>
      window.removeEventListener("storage", syncAppearanceFromSettings);
  }, []);

  useEffect(() => {
    const updateMoreActionsVisibility = () => {
      setHasMoreActionsHeight(
        window.innerHeight > QUICK_EDITOR_MORE_ACTIONS_MIN_HEIGHT,
      );
    };
    window.addEventListener("resize", updateMoreActionsVisibility);
    return () =>
      window.removeEventListener("resize", updateMoreActionsVisibility);
  }, []);

  const syncDirtyState = useCallback((isDirty: boolean) => {
    dirtyRef.current = isDirty;
    window.electronAPI.updateDirtyState(isDirty);
  }, []);

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToastMessage(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, QUICK_EDITOR_TOAST_DURATION);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const syncContentToSource = useCallback(() => {
    const source = sourceRef.current;
    const sourceContent = lastSyncedContentRef.current;
    const baseline = serializedBaselineRef.current;
    const shouldRefreshFind = isFindOpenRef.current;
    if (!source && !shouldRefreshFind) return;

    const revision = ++syncRevisionRef.current;
    void serializeMarkdown(editor, editor.document).then((serialized) => {
      if (revision !== syncRevisionRef.current) {
        return;
      }

      // 与主编辑器保持一致：以加载时的序列化结果为基线，只把真实编辑映射回原始 Markdown。
      const content = resolveQuickEditorMarkdown(
        sourceContent,
        baseline,
        serialized,
      );
      serializedBaselineRef.current = serialized;
      lastSyncedContentRef.current = content;
      if (shouldRefreshFind) setFindContent(content);
      if (!source || sourceContent === null) return;
      if (markdownEquals(content, sourceContent)) return;

      window.electronAPI.syncQuickEditorContent({ content, source });
    });
  }, [editor]);

  const getCurrentEditorContent = useCallback(async () => {
    if (editorMode === "source") return sourceMarkdownRef.current;

    const serialized = await serializeMarkdown(editor, editor.document);
    return resolveQuickEditorMarkdown(
      lastSyncedContentRef.current,
      serializedBaselineRef.current,
      serialized,
    );
  }, [editor, editorMode]);

  const applyRestoredContent = useCallback(
    async (content: string, source: QuickEditorWindowContent["source"]) => {
      const revision = ++syncRevisionRef.current;
      const blocks = await parseMarkdown(editor, content);
      const baseline = await serializeMarkdown(editor, blocks);
      if (revision !== syncRevisionRef.current) return;

      sourceRef.current = source;
      setLinkedFilePath(source?.filePath ?? null);
      setLinkedRepositoryRoot(source?.repositoryRoot ?? null);
      lastSyncedContentRef.current = content;
      serializedBaselineRef.current = baseline;
      replacementUndoStackRef.current.length = 0;
      sourceMarkdownRef.current = content;
      setSourceMarkdown(content);
      setFindContent(content);
      editor.replaceBlocks(editor.document, blocks);
      syncDirtyState(false);
    },
    [editor, syncDirtyState],
  );

  const handleSourceChange = useCallback(
    (content: string) => {
      const previousContent = lastSyncedContentRef.current;
      const source = sourceRef.current;
      sourceMarkdownRef.current = content;
      setSourceMarkdown(content);
      lastSyncedContentRef.current = content;
      syncDirtyState(content.trim().length > 0);
      if (isFindOpenRef.current) setFindContent(content);
      if (!source || previousContent === content) return;
      window.electronAPI.syncQuickEditorContent({ content, source });
    },
    [syncDirtyState],
  );

  useEditorChange(() => {
    syncDirtyState(
      hasMeaningfulQuickEditorContent(
        editor.document as unknown as QuickEditorBlock[],
      ),
    );
    syncContentToSource();
    handleOutlineDocumentChange();
  }, editor);

  useEffect(() => {
    setActiveFindIndex(findQuery && rawMatches.length > 0 ? 0 : -1);
  }, [
    findOptions.matchCase,
    findOptions.useRegex,
    findOptions.wholeWord,
    findQuery,
    rawMatches.length,
  ]);

  useEffect(() => {
    setActiveFindIndex((currentIndex) => {
      if (rawMatches.length === 0) return -1;
      if (currentIndex < 0) return 0;
      return Math.min(currentIndex, rawMatches.length - 1);
    });
  }, [rawMatches.length]);

  useEffect(() => {
    if (!isFindOpen || !findQuery) {
      clearEditorFindHighlights();
      return;
    }

    let clearFallbackHighlights = () => undefined;
    const frame = window.requestAnimationFrame(() => {
      const root = editor.domElement;
      if (!root) return;
      const ranges = collectEditorFindRanges(root, findQuery, findOptions);
      clearEditorFindHighlights();
      clearFallbackHighlights = renderEditorFindHighlightFallback(
        root,
        ranges,
        activeFindIndex,
      );
      scrollRangeIntoView(ranges[activeFindIndex]);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      clearFallbackHighlights();
    };
  }, [
    activeFindIndex,
    editor,
    findContent,
    findOptions,
    findQuery,
    isFindOpen,
  ]);

  useEffect(
    () => () => {
      clearEditorFindHighlights();
    },
    [],
  );

  const openFindWidget = useCallback(() => {
    isFindOpenRef.current = true;
    setIsFindOpen(true);
    setFindFocusRequestKey((current) => current + 1);
    // 独立浮窗平时无需持续序列化；打开搜索时再刷新当前 Markdown 快照。
    syncContentToSource();
  }, [syncContentToSource]);

  const closeFindWidget = useCallback(() => {
    isFindOpenRef.current = false;
    setIsFindOpen(false);
    clearEditorFindHighlights();
  }, []);

  const handleKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape" && isOutlineOpen) {
        event.preventDefault();
        event.stopPropagation();
        setOutlineVisibility(false);
        editor.focus();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        event.stopPropagation();
        openFindWidget();
        return;
      }
      if (editorMode !== "rich") return;
      if (handleRichEditorHeadingShortcut(event, editor)) return;
      handleRichEditorSelectAllShortcut(event, editor);
    },
    [editor, editorMode, isOutlineOpen, openFindWidget, setOutlineVisibility],
  );

  const handleRichEditorPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      outlineScrollTokenRef.current += 1;
      setOutlineVisibility(false);
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
        return;
      }

      selectionDragBoundsRef.current = null;
      selectionDragAnchorRef.current = null;
    },
    [editor, setOutlineVisibility],
  );

  const handleEditorScroll = useCallback(() => {
    scheduleActiveHeadingUpdate();
  }, [scheduleActiveHeadingUpdate]);

  useEffect(
    () => () => cancelActiveHeadingUpdate(),
    [cancelActiveHeadingUpdate],
  );

  useEffect(() => {
    if (editorMode !== "rich") return;

    const selectionGuardPlugin = createRichEditorSelectionDragGuardPlugin(
      () => ({
        bounds: selectionDragBoundsRef.current,
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
    const resetSelectionDrag = () => {
      setSelectionDragLocked(false);
      selectionDragBoundsRef.current = null;
      selectionDragPointerRef.current = null;
      selectionDragAnchorRef.current = null;
    };
    const handleSelectionDragMouseMove = (event: MouseEvent) => {
      if (event.buttons !== 1) {
        resetSelectionDrag();
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

      // 进入异常区域后由 ProseMirror 接管当前拖选，避免 Chrome 原生选区与状态选区反复争抢而闪烁。
      event.preventDefault();
    };

    document.addEventListener("mousemove", handleSelectionDragMouseMove, true);
    document.addEventListener("mouseup", resetSelectionDrag, true);
    window.addEventListener("blur", resetSelectionDrag);
    document.addEventListener("dragend", resetSelectionDrag, true);
    return () => {
      document.removeEventListener(
        "mousemove",
        handleSelectionDragMouseMove,
        true,
      );
      document.removeEventListener("mouseup", resetSelectionDrag, true);
      window.removeEventListener("blur", resetSelectionDrag);
      document.removeEventListener("dragend", resetSelectionDrag, true);
      resetSelectionDrag();
      unregisterRichEditorSelectionDragGuardPlugin(
        editor,
        selectionGuardPlugin,
      );
    };
  }, [editor, editorMode]);

  const handleOutlineHeadingSelect = useCallback(
    (blockId: string) => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;

      // 与面板编辑器共用稳定定位，避免原生平滑滚动与编辑器选区滚动同时触发，
      // 导致 CodeMirror 在跨帧测量期间出现闪烁或虚拟行错绘。
      const scrollToken = outlineScrollTokenRef.current + 1;
      outlineScrollTokenRef.current = scrollToken;
      if (!focusEditorOutlineBlock(editor, blockId)) return;

      const getTarget = () =>
        findQuickEditorBlockElement(editor.domElement, blockId);
      if (!getTarget()) return;

      scheduleStableEditorBlockScroll({
        container: scrollContainer,
        getTarget,
        shouldContinue: () => outlineScrollTokenRef.current === scrollToken,
      });
      updateActiveHeading(blockId);
    },
    [editor, updateActiveHeading],
  );

  const stepMatch = useCallback(
    (direction: 1 | -1) => {
      setActiveFindIndex((currentIndex) =>
        getSteppedMatchIndex(currentIndex, rawMatches.length, direction),
      );
    },
    [rawMatches.length],
  );

  const applyFindReplacement = useCallback(
    async (content: string, shouldPushUndo = true) => {
      const currentContent = findContent;
      if (content === currentContent) return;
      const revision = ++syncRevisionRef.current;

      try {
        const blocks = await parseMarkdown(editor, content);
        const baseline = await serializeMarkdown(editor, blocks);
        if (revision !== syncRevisionRef.current) return;

        if (shouldPushUndo) {
          replacementUndoStackRef.current.push(currentContent);
        }
        const source = sourceRef.current;
        lastSyncedContentRef.current = content;
        serializedBaselineRef.current = baseline;
        setFindContent(content);
        editor.replaceBlocks(editor.document, blocks);

        // 替换属于明确编辑，更新基线后主动同步一次，避免初始化保护把它识别为无变化。
        if (source) {
          window.electronAPI.syncQuickEditorContent({ content, source });
        }
      } catch {
        // 替换后的 Markdown 无法解析时保留当前内容，避免损坏浮窗草稿。
      }
    },
    [editor, findContent],
  );

  const replaceCurrentMatch = useCallback(() => {
    const match = rawMatches[activeFindIndex];
    if (!match) return;
    void applyFindReplacement(
      replaceTextMatch(findContent, match, replacement),
    );
  }, [
    activeFindIndex,
    applyFindReplacement,
    findContent,
    rawMatches,
    replacement,
  ]);

  const replaceAllMatches = useCallback(() => {
    if (rawMatches.length === 0) return;
    void applyFindReplacement(
      replaceAllTextMatches(findContent, rawMatches, replacement),
    );
  }, [applyFindReplacement, findContent, rawMatches, replacement]);

  const undoLastReplacement = useCallback(() => {
    const previousContent = replacementUndoStackRef.current.pop();
    if (previousContent === undefined) return;
    void applyFindReplacement(previousContent, false);
  }, [applyFindReplacement]);

  const selectAllMatches = useCallback(() => {
    if (!findQuery || rawMatches.length === 0) return;
    const root = editor.domElement;
    if (!root) return;
    const ranges = collectEditorFindRanges(root, findQuery, findOptions);
    selectEditorFindRanges(ranges);
  }, [editor, findOptions, findQuery, rawMatches.length]);

  useEffect(() => {
    const bridgeWindow = window as QuickEditorBridgeWindow;
    syncDirtyState(false);

    bridgeWindow["__getNextDirtyEditor"] = async () => {
      if (!dirtyRef.current) return null;

      const content = await getCurrentEditorContent();
      if (!content.trim()) {
        syncDirtyState(false);
        return null;
      }

      return {
        groupId: QUICK_EDITOR_GROUP_ID,
        tabId: QUICK_EDITOR_TAB_ID,
        content,
        filePath: null,
      };
    };

    bridgeWindow["__onCloseSaveSuccess"] = async (
      _groupId,
      _tabId,
      _filePath,
      savedContent,
    ) => {
      // 写盘期间若又发生编辑，继续保留脏状态并进入下一轮关闭保存检查。
      const currentContent = await getCurrentEditorContent();
      syncDirtyState(currentContent !== savedContent);
    };

    return () => {
      delete bridgeWindow["__getNextDirtyEditor"];
      delete bridgeWindow["__onCloseSaveSuccess"];
      window.electronAPI.updateDirtyState(false);
    };
  }, [getCurrentEditorContent, syncDirtyState]);

  useEffect(() => {
    if (!isCollapseStateReady || isCollapsed) return;
    const frame = window.requestAnimationFrame(() => {
      if (editorMode === "source") sourceEditorRef.current?.focus();
      else editor.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editor, editorMode, isCollapsed, isCollapseStateReady]);

  useEffect(() => {
    let cancelled = false;

    // 标签页打开的浮窗需要在编辑器就绪后解析初始 Markdown 快照。
    const applyInitialContent = async (
      initialContent: QuickEditorWindowContent,
    ) => {
      if (cancelled) return;
      const revision = ++syncRevisionRef.current;
      try {
        const blocks = await parseMarkdown(editor, initialContent.content);
        const baseline = await serializeMarkdown(editor, blocks);
        if (cancelled || revision !== syncRevisionRef.current) return;

        sourceRef.current = initialContent.source;
        setLinkedFilePath(initialContent.source?.filePath ?? null);
        setLinkedRepositoryRoot(initialContent.source?.repositoryRoot ?? null);
        lastSyncedContentRef.current = initialContent.content;
        serializedBaselineRef.current = baseline;
        replacementUndoStackRef.current.length = 0;
        sourceMarkdownRef.current = initialContent.content;
        setSourceMarkdown(initialContent.content);
        setFindContent(initialContent.content);
        editor.replaceBlocks(editor.document, blocks);
        syncDirtyState(false);
      } catch {
        // Markdown 解析失败时保留空白编辑器，避免浮窗初始化中断。
      }
    };

    const unsubscribe = window.electronAPI.onQuickEditorInitialContent(
      (initialContent) => {
        void applyInitialContent(initialContent);
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [editor, syncDirtyState]);

  useEffect(() => {
    let active = true;
    if (!linkedFilePath || !linkedRepositoryRoot) {
      setIsGitRepo(false);
      return;
    }

    void window.gitAPI.detect(linkedRepositoryRoot).then((result) => {
      if (active) {
        setIsGitRepo(
          result.code === CodeResult.Success && result.data?.isGitRepo === true,
        );
      }
    });

    return () => {
      active = false;
    };
  }, [linkedFilePath, linkedRepositoryRoot]);

  useEffect(() => {
    let cancelled = false;
    const applyLiveContent = async (content: QuickEditorWindowContent) => {
      if (cancelled) return;
      const revision = ++syncRevisionRef.current;
      try {
        const blocks = await parseMarkdown(editor, content.content);
        const baseline = await serializeMarkdown(editor, blocks);
        if (cancelled || revision !== syncRevisionRef.current) return;

        sourceRef.current = content.source;
        setLinkedFilePath(content.source?.filePath ?? null);
        setLinkedRepositoryRoot(content.source?.repositoryRoot ?? null);
        lastSyncedContentRef.current = content.content;
        serializedBaselineRef.current = baseline;
        replacementUndoStackRef.current.length = 0;
        sourceMarkdownRef.current = content.content;
        setSourceMarkdown(content.content);
        setFindContent(content.content);
        editor.replaceBlocks(editor.document, blocks);
        syncDirtyState(false);
      } catch {
        // Markdown 解析失败时保留当前编辑器，避免实时同步中断。
      }
    };
    const unsubscribe = window.electronAPI.onQuickEditorContentUpdated(
      (content) => {
        void applyLiveContent(content);
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [editor, syncDirtyState]);

  const handleReturnToApplication = useCallback(async () => {
    if (returnInProgressRef.current) return;
    returnInProgressRef.current = true;

    try {
      const content = await getCurrentEditorContent();
      window.electronAPI.returnToMainWindowFromQuickEditor({
        content,
        source: sourceRef.current,
      });
    } catch {
      returnInProgressRef.current = false;
    }
  }, [getCurrentEditorContent]);

  const handleRevealInFileManager = useCallback(() => {
    if (!linkedFilePath) return;
    void window.electronAPI.openInExplorer(linkedFilePath);
  }, [linkedFilePath]);

  const getGitHeadContent = useCallback(
    async (
      source: NonNullable<QuickEditorWindowContent["source"]>,
    ): Promise<string | null> => {
      const relativePath = toGitRelativePath(
        source.repositoryRoot!,
        source.filePath!,
      );
      const headResult = await window.gitAPI.getFileHeadContent(
        source.repositoryRoot!,
        relativePath,
      );
      if (headResult.code === CodeResult.Success) {
        return headResult.data ?? "";
      }

      const statusResult = await window.gitAPI.getStatus(
        source.repositoryRoot!,
      );
      return statusResult.code === CodeResult.Success &&
        statusResult.data &&
        hasNoHeadVersion(statusResult.data, relativePath)
        ? ""
        : null;
    },
    [],
  );

  const handleCompare = useCallback(async () => {
    const source = sourceRef.current;
    if (!source?.filePath || !source.repositoryRoot) return;

    const content = await getCurrentEditorContent();
    const headContent = await getGitHeadContent(source);
    if (headContent === null) {
      showToast("无法读取 Git 差异");
      return;
    }
    if (areDiffContentsEqual(headContent, content)) {
      showToast(DIFF_NO_DIFF_MESSAGE);
      return;
    }

    setDiffState({
      fileName: source.filePath.split(/[\\/]/).pop() ?? "当前文件",
      newContent: content,
      oldContent: headContent,
    });
  }, [getCurrentEditorContent, getGitHeadContent, showToast]);

  const handleDiscard = useCallback(async () => {
    const source = sourceRef.current;
    if (!source?.filePath || !source.repositoryRoot) return;

    const content = await getCurrentEditorContent();
    const headContent = await getGitHeadContent(source);
    if (headContent === null) {
      showToast("无法读取 Git 更改");
      return;
    }
    if (areDiffContentsEqual(headContent, content)) {
      showToast(DIFF_NO_CHANGES_MESSAGE);
      return;
    }

    await window.electronAPI.flushQuickEditorContent(source);
    const result = await window.gitAPI.discardChanges(
      source.repositoryRoot,
      toGitRelativePath(source.repositoryRoot, source.filePath),
    );
    if (result.code !== CodeResult.Success) {
      showToast("放弃更改失败");
      return;
    }

    try {
      const restoredContent = await window.electronAPI.readFile(
        source.filePath,
      );
      await applyRestoredContent(restoredContent, source);
      window.electronAPI.syncQuickEditorContent({
        content: restoredContent,
        source,
      });
    } catch {
      // 未追踪文件回滚后会被删除，浮窗转为未关联的空白草稿，不能重新同步写回。
      await applyRestoredContent("", null);
    }
  }, [
    applyRestoredContent,
    getCurrentEditorContent,
    getGitHeadContent,
    showToast,
  ]);

  const handleToggleEditorMode = useCallback(async () => {
    if (editorMode === "rich") {
      const content = await getCurrentEditorContent();
      sourceMarkdownRef.current = content;
      setSourceMarkdown(content);
      closeFindWidget();
      setOutlineVisibility(false);
      setEditorMode("source");
      return;
    }

    const revision = ++syncRevisionRef.current;
    const sourceContent = sourceMarkdownRef.current;
    try {
      const blocks = await parseMarkdown(editor, sourceContent);
      const baseline = await serializeMarkdown(editor, blocks);
      if (revision !== syncRevisionRef.current) return;

      lastSyncedContentRef.current = sourceContent;
      serializedBaselineRef.current = baseline;
      setFindContent(sourceContent);
      editor.replaceBlocks(editor.document, blocks);
      setEditorMode("rich");
    } catch {
      // 源码暂时无法解析时保留源码模式和内容，避免切换过程丢失用户输入。
    }
  }, [
    closeFindWidget,
    editor,
    editorMode,
    getCurrentEditorContent,
    setOutlineVisibility,
  ]);

  const handleToggleCollapsed = useCallback(async () => {
    if (!isCollapseStateReady || isCollapseTransitioning) return;

    const nextCollapsed = !isCollapsed;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    setCollapseTarget(nextCollapsed);
    setIsCollapseTransitioning(true);

    try {
      const collapsed = await window.electronAPI.setQuickEditorCollapsed(
        nextCollapsed,
        reduceMotion,
      );
      setIsCollapsed(collapsed);
    } catch {
      // IPC 异常后重新读取主进程状态，避免图标与原生窗口尺寸失去同步。
      const collapsed = await readCollapsedState();
      if (collapsed !== null) setIsCollapsed(collapsed);
    } finally {
      setCollapseTarget(null);
      setIsCollapseTransitioning(false);
    }
  }, [
    isCollapsed,
    isCollapseStateReady,
    isCollapseTransitioning,
    readCollapsedState,
  ]);

  const editorIsHidden = isCollapsed || collapseTarget === true;
  const showMoreActions = !editorIsHidden && hasMoreActionsHeight;
  const revealInFileManagerLabel = getRevealInFileManagerLabel(
    window.electronAPI?.getPlatform?.(),
  );

  useEffect(() => {
    if (editorIsHidden) setOutlineVisibility(false);
  }, [editorIsHidden, setOutlineVisibility]);

  return (
    <div
      className="quick-editor-window"
      data-collapsed={editorIsHidden ? "true" : "false"}
      data-quick-editor-window="true"
      onKeyDownCapture={handleKeyDownCapture}
    >
      <header className="quick-editor-window__titlebar">
        <div className="quick-editor-window__actions quick-editor-window__actions--left">
          <button
            aria-label={isCollapsed ? "展开编辑器" : "折叠编辑器"}
            className="quick-editor-window__action quick-editor-window__action--collapse"
            disabled={!isCollapseStateReady || isCollapseTransitioning}
            title={isCollapsed ? "展开编辑器" : "折叠编辑器"}
            type="button"
            onClick={() => void handleToggleCollapsed()}
          >
            {isCollapsed ? (
              <ChevronDown aria-hidden="true" size={15} />
            ) : (
              <ChevronUp aria-hidden="true" size={15} />
            )}
          </button>
        </div>
        <div className="quick-editor-window__drag-region" aria-hidden="true" />
        <div className="quick-editor-window__actions quick-editor-window__actions--right">
          {!showMoreActions ? (
            <button
              aria-label="关闭浮动窗口"
              className="quick-editor-window__action quick-editor-window__action--close"
              title="关闭浮动窗口"
              type="button"
              onClick={() => window.electronAPI.closeQuickEditorWindow()}
            >
              <X aria-hidden="true" size={15} />
            </button>
          ) : (
            <QuickEditorActionsMenu
              isOutlineOpen={isOutlineOpen}
              isOutlineDisabled={editorIsHidden || editorMode === "source"}
              onToggleEditorMode={() => void handleToggleEditorMode()}
              onToggleOutline={() =>
                setOutlineVisibility(!isOutlineOpenRef.current)
              }
              onNewWindow={() => window.electronAPI.createQuickEditorWindow()}
              onReturnToApplication={() => void handleReturnToApplication()}
              onRevealInFileManager={
                linkedFilePath ? handleRevealInFileManager : undefined
              }
              revealInFileManagerLabel={
                linkedFilePath ? revealInFileManagerLabel : undefined
              }
              onCompare={isGitRepo ? () => void handleCompare() : undefined}
              onDiscard={isGitRepo ? () => setConfirmDiscard(true) : undefined}
              onCloseWindow={() => window.electronAPI.closeQuickEditorWindow()}
            />
          )}
        </div>
      </header>

      <main
        aria-hidden={editorIsHidden || undefined}
        aria-label="快速编辑器"
        className="quick-editor-window__editor"
        style={{ opacity: appearance.opacity / 100 } as CSSProperties}
      >
        {editorMode === "rich" ? (
          <FindWidget
            isOpen={isFindOpen}
            focusRequestKey={findFocusRequestKey}
            isReplaceOpen={isReplaceOpen}
            query={findQuery}
            replacement={replacement}
            activeIndex={activeFindIndex}
            matchCount={rawMatches.length}
            options={findOptions}
            onQueryChange={setFindQuery}
            onReplacementChange={setReplacement}
            onStep={stepMatch}
            onClose={closeFindWidget}
            onToggleReplace={() => setIsReplaceOpen((current) => !current)}
            onOptionsChange={setFindOptions}
            onReplaceCurrent={replaceCurrentMatch}
            onReplaceAll={replaceAllMatches}
            onSelectAllMatches={selectAllMatches}
            onUndoReplace={undoLastReplacement}
          />
        ) : null}
        {editorMode === "rich" ? (
          <div
            ref={scrollContainerRef}
            className="quick-editor-window__scroll"
            onPasteCapture={handleRichEditorPasteCapture}
            onPointerDownCapture={handleRichEditorPointerDownCapture}
            onScroll={handleEditorScroll}
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
        ) : (
          <div className="quick-editor-window__scroll">
            <MarkdownSourceEditor
              ref={sourceEditorRef}
              fontFamily={appearance.codeFont}
              fontSize={appearance.fontSize}
              lineHeight={appearance.lineHeight}
              style={{ backgroundColor: "transparent" }}
              value={sourceMarkdown}
              onChange={handleSourceChange}
              onScrollTopChange={NOOP}
            />
          </div>
        )}
        {isOutlineOpen && !editorIsHidden ? (
          <QuickEditorOutline
            headings={outlineHeadings}
            activeHeadingId={activeHeadingId}
            resetKey={linkedFilePath}
            onHeadingSelect={handleOutlineHeadingSelect}
          />
        ) : null}
      </main>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="确认放弃更改"
        description={`确定要放弃 "${linkedFilePath?.split(/[\\/]/).pop() ?? "当前文件"}" 的更改吗？`}
        variant="warning"
        confirmText="确定"
        onConfirm={() => void handleDiscard()}
      />
      {diffState ? (
        <QuickEditorDiffDialog
          diff={diffState}
          onOpenChange={(open) => {
            if (!open) setDiffState(null);
          }}
        />
      ) : null}
      {toastMessage ? (
        <div
          aria-live="polite"
          className="app-toast pointer-events-none fixed left-1/2 top-14 z-[100] flex w-[calc(100vw-24px)] max-w-[320px] items-center gap-2 rounded-lg px-2.5 py-2 text-sm"
          role="status"
        >
          <span className="app-toast__icon flex h-5 w-5 shrink-0 items-center justify-center">
            <Info aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1 break-words leading-5">
            {toastMessage}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function QuickEditorDiffDialog({
  diff,
  onOpenChange,
}: {
  diff: QuickEditorDiffState;
  onOpenChange: (open: boolean) => void;
}) {
  const { contentRef, dragHandleProps, resizeHandleProps } = useResizableDialog(
    {
      isOpen: true,
      minWidth: 360,
      minHeight: 240,
      viewportMargin: 8,
    },
  );

  return (
    <Dialog.Root modal={false} open onOpenChange={onOpenChange}>
      <DialogContent
        ref={contentRef}
        showCloseButton={false}
        overlayStyle={{ backgroundColor: "transparent" }}
        className="h-[min(74vh,520px)] w-[min(92vw,820px)] max-w-none flex-col gap-0 overflow-hidden p-0"
        style={{
          display: "flex",
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          boxShadow: "0 10px 28px rgba(0, 0, 0, 0.24)",
          color: "var(--text-primary)",
        }}
      >
        <div
          {...dragHandleProps}
          className="flex h-11 shrink-0 cursor-move select-none items-center justify-between border-b border-[var(--border-color)] px-3"
        >
          <Dialog.Title className="min-w-0 truncate text-sm font-medium">
            {diff.fileName}差异
          </Dialog.Title>
          <Dialog.Close
            aria-label="关闭差异"
            onPointerDown={(event) => event.stopPropagation()}
            className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
          >
            <X aria-hidden="true" size={16} />
          </Dialog.Close>
        </div>
        <div className="min-h-0 flex-1">
          {diff ? (
            <DiffViewer
              oldContent={diff.oldContent}
              newContent={diff.newContent}
              fileName={diff.fileName}
              oldTitle={`${diff.fileName} (HEAD)`}
              newTitle={`${diff.fileName} (编辑器)`}
              reserveDialogResizeHandleSpace
            />
          ) : null}
        </div>
        <DialogResizeHandles resizeHandleProps={resizeHandleProps} />
      </DialogContent>
    </Dialog.Root>
  );
}
