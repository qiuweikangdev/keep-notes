import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import { useCreateBlockNote, useEditorChange } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { Block } from "@blocknote/core";

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
  serializeMarkdown,
} from "../lib/markdown";
import { EditorChangeGate } from "../lib/editor-change-gate";
import {
  readEditorScrollTop,
  restoreEditorScrollTop,
} from "../lib/editor-viewport";
import { createParseFallback } from "../lib/editor-parse-fallback";

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
  const serializationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const applyTokenRef = useRef(0);
  const editor = useCreateBlockNote({ initialContent: undefined });

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
    );
  }, [editor]);

  const serializeChange = useCallback(async () => {
    if (suppressChangeRef.current) return;
    const pendingRevision = changeGateRef.current.capturePendingRevision();
    if (pendingRevision === null) return;

    const markdown = await serializeMarkdown(editor, editor.document);
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
        const cached = path ? editorCache.getBlocks(path, source) : null;
        const parsedBlocks =
          cached?.blocks ?? (await parseMarkdown(editor, source || ""));
        const blocks = ensureEditableBlocks(parsedBlocks, () => {
          return { type: "paragraph", content: [] } as Block;
        });

        // Markdown 解析可能晚于下一次切换完成，旧结果不得再写入编辑器。
        if (applyToken !== applyTokenRef.current) return;
        window.getSelection()?.removeAllRanges();
        editor.replaceBlocks(editor.document, blocks);
        appliedPathRef.current = path;
        appliedSourceRef.current = source;
        if (path) {
          editorCache.setContent(path, source);
          editorCache.setBlocks(path, source, blocks, cached?.scrollTop ?? 0);
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
