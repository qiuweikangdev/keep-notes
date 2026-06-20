import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import { useCreateBlockNote, useEditorChange } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
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
  serializeMarkdown,
} from "../lib/markdown";
import { EditorChangeGate } from "../lib/editor-change-gate";
import {
  chooseRestoredEditorScrollTop,
  readEditorScrollTop,
  restoreEditorScrollTop,
} from "../lib/editor-viewport";
import { createParseFallback } from "../lib/editor-parse-fallback";
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

const MARKDOWN_PARSER_VERSION = "blocknote-v2";

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

  const targetElement = getElementFromEventTarget(event.target);
  const codeBlockRoot =
    targetElement?.closest(".editor-code-block-shell") ?? null;
  const codeElement = getCodeElementFromSelectionRoot(codeBlockRoot);

  event.preventDefault();
  event.stopPropagation();

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
  const { isDark } = useTheme();
  const suppressChangeRef = useRef(false);
  const changeGateRef = useRef(new EditorChangeGate());
  const contentRef = useRef(content);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const appliedPathRef = useRef<string | null>(null);
  const appliedSourceRef = useRef(content);
  const serializedBaselineRef = useRef<string | null>(null);
  const serializationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const applyTokenRef = useRef(0);
  const editor = useCreateBlockNote({
    initialContent: undefined,
    schema: editorSchema,
  });

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
    setOutlineHeadings(headings);
  }, [extractHeadings, setOutlineHeadings]);

  // 跳转到指定块的函数
  const scrollToBlock = useCallback(
    (blockId: string) => {
      const blockElement = editor.domElement?.querySelector(
        `[data-id="${blockId}"]`,
      );
      if (blockElement) {
        blockElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [editor],
  );

  // 通过 store 暴露跳转函数给侧边栏
  useEffect(() => {
    window.__scrollToBlock = scrollToBlock;
  }, [scrollToBlock]);

  // 监听编辑器滚动，更新当前活跃的标题（参考 Typora 的体验）
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    let ticking = false;
    let lastActiveId: string | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const updateActiveHeading = () => {
      // 从 store 获取大纲标题列表
      const headings = useEditorStore.getState().outlineHeadings;
      if (headings.length === 0) return;

      // 找到当前可见的标题
      const viewportHeight = scrollContainer.clientHeight;
      let activeId: string | null = null;

      // 从后往前遍历，找到第一个在视口上方的标题
      for (let i = headings.length - 1; i >= 0; i--) {
        const heading = headings[i];
        const blockElement = editor.domElement?.querySelector(
          `[data-id="${heading.id}"]`,
        );
        if (blockElement) {
          const rect = blockElement.getBoundingClientRect();
          const containerRect = scrollContainer.getBoundingClientRect();
          const relativeTop = rect.top - containerRect.top;

          // 如果标题在视口上方 30% 的位置，认为是当前活跃标题
          if (relativeTop <= viewportHeight * 0.3) {
            activeId = heading.id;
            break;
          }
        }
      }

      // 只在活跃标题变化时才更新 store
      if (activeId && activeId !== lastActiveId) {
        lastActiveId = activeId;
        useEditorStore.getState().setActiveHeadingId(activeId);
      }
    };

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        ticking = false;

        // 清除之前的防抖定时器
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        // 使用防抖来减少状态更新频率，避免闪烁
        debounceTimer = setTimeout(() => {
          updateActiveHeading();
        }, 100);
      });
    };

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });

    // 初始加载时也更新一次
    updateActiveHeading();

    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, [editor]);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const cacheAppliedDocument = useCallback(() => {
    const appliedPath = appliedPathRef.current;
    if (!appliedPath) return;

    editorCache.setContent(appliedPath, appliedSourceRef.current);
    editorCache.setBlocks(
      appliedPath,
      appliedSourceRef.current,
      editor.document,
      readEditorScrollTop(scrollContainerRef.current),
      MARKDOWN_PARSER_VERSION,
    );
  }, [editor]);

  const serializeChange = useCallback(async () => {
    if (suppressChangeRef.current) return;
    const pendingRevision = changeGateRef.current.capturePendingRevision();
    if (pendingRevision === null) return;

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
        readEditorScrollTop(scrollContainerRef.current),
        MARKDOWN_PARSER_VERSION,
      );
    }
    onWordCountChange(markdown.length);
    onChange(markdown);
    changeGateRef.current.markSerialized(pendingRevision);
  }, [editor, onChange, onWordCountChange, path]);

  useEditorChange(() => {
    if (changeGateRef.current.capturePendingRevision() === null) return;
    if (serializationTimerRef.current) {
      clearTimeout(serializationTimerRef.current);
    }
    serializationTimerRef.current = setTimeout(() => {
      serializationTimerRef.current = null;
      void serializeChange();
    }, 250);

    // 更新大纲标题列表到 store
    updateOutlineHeadings();
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
          cached?.blocks ?? (await parseMarkdown(editor, source || ""));
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
          cachedScrollTop: cached?.scrollTop,
        });
        serializedBaselineRef.current = serializedBaseline;
        if (path) {
          editorCache.setContent(path, source);
          editorCache.setBlocks(
            path,
            source,
            blocks,
            restoredScrollTop,
            MARKDOWN_PARSER_VERSION,
          );
        }
        restoreEditorScrollTop(scrollContainerRef.current, restoredScrollTop);
        onParseStateChange(null);

        // 内容加载完成后更新大纲标题列表
        updateOutlineHeadings();
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
  }, [cacheAppliedDocument, editor, onParseStateChange, path, reloadKey]);

  useEffect(
    () =>
      registerEditorChangeFlusher(
        groupId,
        tabId,
        async () => {
          if (serializationTimerRef.current) {
            clearTimeout(serializationTimerRef.current);
            serializationTimerRef.current = null;
          }
          await serializeChange();
        },
        () => {
          // 放弃文件更改时取消尚未执行的序列化，避免旧内容稍后再次进入保存队列。
          if (serializationTimerRef.current) {
            clearTimeout(serializationTimerRef.current);
            serializationTimerRef.current = null;
          }
        },
      ),
    [groupId, serializeChange, tabId],
  );

  useEffect(
    () => () => {
      if (serializationTimerRef.current) {
        clearTimeout(serializationTimerRef.current);
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

  const handleKeyDownCapture = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      markUserIntent();
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
      onPointerDownCapture={markUserIntent}
      onPasteCapture={markUserIntent}
      onCutCapture={markUserIntent}
      onCompositionStartCapture={markUserIntent}
      onDragOverCapture={blockExternalFileDrop}
      onDropCapture={(event) => {
        markUserIntent();
        blockExternalFileDrop(event);
      }}
      onScroll={(event) => {
        const appliedPath = appliedPathRef.current;
        if (appliedPath) {
          editorCache.setScrollTop(
            appliedPath,
            readEditorScrollTop(event.currentTarget),
          );
        }
      }}
    >
      <BlockNoteView
        editor={editor}
        theme={isDark ? "dark" : "light"}
        spellCheck={false}
        style={{
          fontSize: `${appearance.fontSize}px`,
          lineHeight: appearance.lineHeight,
        }}
      />
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
