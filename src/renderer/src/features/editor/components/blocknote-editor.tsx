import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useCreateBlockNote, useEditorChange } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { Block } from "@blocknote/core";
import { Trash2 } from "lucide-react";

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
  readEditorScrollTop,
  restoreEditorScrollTop,
} from "../lib/editor-viewport";
import { createParseFallback } from "../lib/editor-parse-fallback";
import {
  findHoveredTableDeleteTarget,
  getTableDeleteButtonPosition,
  isPointerWithinTableDeleteHoverZone,
  isTableDeleteButtonTarget,
} from "../lib/editor-table-delete-overlay";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "@/styles/blocknote-overrides.css";

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

interface TableDeleteOverlayState {
  blockId: string;
  top: number;
  left: number;
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
  const hoveredTableRef = useRef<ReturnType<
    typeof findHoveredTableDeleteTarget
  > | null>(null);
  const appliedPathRef = useRef<string | null>(null);
  const appliedSourceRef = useRef(content);
  const serializedBaselineRef = useRef<string | null>(null);
  const serializationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const applyTokenRef = useRef(0);
  const editor = useCreateBlockNote({ initialContent: undefined });
  const [tableDeleteOverlay, setTableDeleteOverlay] =
    useState<TableDeleteOverlayState | null>(null);

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
  }, editor);

  useEffect(() => {
    const applyToken = ++applyTokenRef.current;
    cacheAppliedDocument();
    suppressChangeRef.current = true;
    changeGateRef.current.resetAfterProgrammaticChange();

    const applyContent = async () => {
      try {
        const source = contentRef.current;
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
        serializedBaselineRef.current = serializedBaseline;
        if (path) {
          editorCache.setContent(path, source);
          editorCache.setBlocks(
            path,
            source,
            blocks,
            cached?.scrollTop ?? 0,
            MARKDOWN_PARSER_VERSION,
          );
        }
        restoreEditorScrollTop(
          scrollContainerRef.current,
          cached?.scrollTop ?? 0,
        );
        onParseStateChange(null);
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

  const clearTableDeleteOverlay = useCallback(() => {
    hoveredTableRef.current = null;
    setTableDeleteOverlay(null);
  }, []);

  const refreshTableDeleteOverlay = useCallback(() => {
    const hoveredTable = hoveredTableRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (
      !hoveredTable ||
      !scrollContainer ||
      !hoveredTable.tableRoot.isConnected
    ) {
      clearTableDeleteOverlay();
      return;
    }

    const position = getTableDeleteButtonPosition(
      hoveredTable.tableWrapper,
      scrollContainer,
    );
    if (!position) {
      clearTableDeleteOverlay();
      return;
    }

    setTableDeleteOverlay((current) => {
      if (
        current?.blockId === hoveredTable.blockId &&
        current.top === position.top &&
        current.left === position.left
      ) {
        return current;
      }

      return {
        blockId: hoveredTable.blockId,
        top: position.top,
        left: position.left,
      };
    });
  }, [clearTableDeleteOverlay]);

  const updateTableDeleteOverlay = useCallback(
    (target: EventTarget | null) => {
      const hoveredTable = findHoveredTableDeleteTarget(target);
      if (!hoveredTable) {
        clearTableDeleteOverlay();
        return;
      }

      hoveredTableRef.current = hoveredTable;
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) {
        clearTableDeleteOverlay();
        return;
      }

      const position = getTableDeleteButtonPosition(
        hoveredTable.tableWrapper,
        scrollContainer,
      );
      if (!position) {
        clearTableDeleteOverlay();
        return;
      }

      setTableDeleteOverlay({
        blockId: hoveredTable.blockId,
        top: position.top,
        left: position.left,
      });
    },
    [clearTableDeleteOverlay],
  );

  const handleDeleteTable = useCallback(() => {
    const hoveredTable = hoveredTableRef.current;
    if (!hoveredTable) return;

    markUserIntent();

    const blockId = hoveredTable.blockId;
    const cursorPosition = editor.getTextCursorPosition();
    if (cursorPosition.block.id === blockId) {
      const fallbackBlock =
        cursorPosition.nextBlock ?? cursorPosition.prevBlock;
      if (fallbackBlock) {
        editor.setTextCursorPosition(
          fallbackBlock.id,
          cursorPosition.nextBlock?.id === fallbackBlock.id ? "start" : "end",
        );
      }
    }

    if (editor.document.length === 1) {
      const result = editor.replaceBlocks(
        [blockId],
        [{ type: "paragraph", content: [] }],
      );
      const replacementBlock = result.insertedBlocks[0];
      if (replacementBlock) {
        editor.setTextCursorPosition(replacementBlock.id, "start");
      }
    } else {
      editor.removeBlocks([blockId]);
    }

    clearTableDeleteOverlay();
  }, [clearTableDeleteOverlay, editor, markUserIntent]);

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

  useEffect(() => {
    // 表格手柄和删除按钮不在同一个 DOM 分支里，悬浮态需要跟随全局指针统一更新。
    const handlePointerMove = (event: PointerEvent) => {
      if (isTableDeleteButtonTarget(event.target)) {
        refreshTableDeleteOverlay();
        return;
      }

      const hoveredTable = hoveredTableRef.current;
      if (
        hoveredTable &&
        isPointerWithinTableDeleteHoverZone(
          hoveredTable.tableWrapper,
          event.clientX,
          event.clientY,
        )
      ) {
        refreshTableDeleteOverlay();
        return;
      }

      updateTableDeleteOverlay(event.target);
    };

    document.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("resize", refreshTableDeleteOverlay);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("resize", refreshTableDeleteOverlay);
    };
  }, [refreshTableDeleteOverlay, updateTableDeleteOverlay]);

  return (
    <div
      ref={scrollContainerRef}
      className="editor-rich-scroll relative h-full overflow-y-auto overflow-x-hidden"
      style={editorStyle}
      onFocus={onFocus}
      onClick={onFocus}
      onBeforeInputCapture={markUserIntent}
      onKeyDownCapture={markUserIntent}
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
        refreshTableDeleteOverlay();
      }}
    >
      <BlockNoteView
        editor={editor}
        theme={isDark ? "dark" : "light"}
        style={{
          fontSize: `${appearance.fontSize}px`,
          lineHeight: appearance.lineHeight,
          padding: `${appearance.padding}px`,
        }}
      />
      {tableDeleteOverlay ? (
        <button
          type="button"
          aria-label="删除表格"
          data-keep-notes-table-delete
          className="absolute z-20 flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-muted)] shadow-sm transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--danger-color)]"
          style={{
            top: `${tableDeleteOverlay.top}px`,
            left: `${tableDeleteOverlay.left}px`,
          }}
          onMouseEnter={refreshTableDeleteOverlay}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            markUserIntent();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleDeleteTable();
          }}
        >
          <Trash2 size={12} />
        </button>
      ) : null}
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
