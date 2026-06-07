import {
  useEffect,
  useRef,
  useCallback,
  useState,
  type CSSProperties,
} from "react";
import { useCreateBlockNote, useEditorChange } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useEditorStore } from "@/store/editor.store";
import { useDiffStore } from "@/store/diff.store";
import { useTreeStore } from "@/store/tree.store";
import { useTheme } from "@/hooks/use-theme";
import { Loader2 } from "lucide-react";
import { debounce } from "lodash-es";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "@/styles/blocknote-overrides.css";

/**
 * 将BlockNote输出的Markdown列表标记从 * 转换为 -
 * 只处理行首的无序列表标记，不影响其他地方的 *
 */
function normalizeMarkdownListMarkers(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => {
      // 匹配行首的 * 后跟空格的情况（无序列表标记）
      // 支持缩进的列表项
      return line.replace(/^(\s*)\* /g, "$1- ");
    })
    .join("\n");
}

/**
 * 规范化Markdown内容用于比较
 * 去除尾部空格、规范化换行符，但保留缩进空格
 * 用于判断内容是否真正发生了变化（忽略格式差异）
 */
function normalizeForComparison(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n+$/, "\n");
}

interface BlockNoteEditorProps {
  content: string;
  documentKey: string;
  reloadKey: number;
  onChange?: (content: string) => void;
  onFocus?: () => void;
}

function BlockNoteEditorInner({
  content,
  documentKey,
  reloadKey,
  onChange,
  onFocus,
}: BlockNoteEditorProps) {
  const { setWordCount, setDirty, appearance } = useEditorStore();
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const lastSavedContentRef = useRef<string>("");
  const isLoadingContentRef = useRef(false);
  // 记录加载时的原始内容，用于比较避免不必要的格式变更
  const originalContentRef = useRef<string>("");

  // 创建编辑器实例
  const editor = useCreateBlockNote({
    initialContent: undefined,
  });

  // 防抖处理内容变化，避免频繁转换导致光标错乱和闪烁
  const debouncedContentChange = useCallback(
    debounce(async (editor: any) => {
      if (!onChange || isLoadingContentRef.current) return;

      // 将编辑器内容转换为Markdown
      const rawMarkdown = await editor.blocksToMarkdownLossy(editor.document);

      // 标准化列表标记（将 * 转换为 -）
      const markdown = normalizeMarkdownListMarkers(rawMarkdown);

      // 如果内容没有变化，不触发onChange
      if (markdown === lastSavedContentRef.current) return;

      // 检查是否只是格式差异（如尾部空格），如果是则保留原始内容
      // 避免往返转换导致不必要的文件差异
      const normalizedNew = normalizeForComparison(markdown);
      const normalizedOriginal = normalizeForComparison(
        originalContentRef.current,
      );
      if (normalizedNew === normalizedOriginal && originalContentRef.current) {
        // 内容实质未变化，只是格式差异，保留原始内容
        lastSavedContentRef.current = originalContentRef.current;
        return;
      }

      // 更新字数统计
      setWordCount(markdown.length);

      // 标记为已修改
      setDirty(true);

      // 调用onChange回调
      lastSavedContentRef.current = markdown;
      onChange(markdown);
    }, 300),
    [onChange, setWordCount, setDirty],
  );

  // 监听内容变化
  useEditorChange((editor) => {
    debouncedContentChange(editor);
  }, editor);

  // 加载初始内容
  useEffect(() => {
    if (!editor) return;

    const loadContent = async () => {
      try {
        setLoading(true);
        isLoadingContentRef.current = true;

        // 记录原始内容用于后续比较
        originalContentRef.current = content;

        // 无论内容是否为空，都需要更新编辑器
        if (content) {
          // 将Markdown内容解析为BlockNote块
          const blocks = await editor.tryParseMarkdownToBlocks(content);
          editor.replaceBlocks(editor.document, blocks);
          lastSavedContentRef.current = content;
        } else {
          // 内容为空时，清空编辑器
          editor.replaceBlocks(editor.document, []);
          lastSavedContentRef.current = "";
        }
      } catch (error) {
        console.error("加载Markdown内容失败:", error);
      } finally {
        setLoading(false);
        isLoadingContentRef.current = false;
      }
    };

    loadContent();
  }, [editor, documentKey, reloadKey]);

  // 编辑器样式
  const editorStyle = {
    backgroundColor: "var(--bg-primary)",
    opacity: appearance.opacity / 100,
    "--editor-font-size": `${appearance.fontSize}px`,
    "--editor-line-height": appearance.lineHeight,
    "--editor-padding": `${appearance.padding}px`,
  } as CSSProperties;

  // 在捕获阶段拦截文件拖拽事件的默认行为，防止文件路径被插入到编辑器
  // 允许BlockNote内部拖拽（blocknote/html）通过，只阻止外部文件拖拽
  // 注意：不调用 stopPropagation，让事件继续冒泡以便父组件处理文件打开
  const handleDragOverCapture = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    // 允许BlockNote内部拖拽
    if (types.includes("blocknote/html")) {
      return;
    }
    // 阻止外部文件拖拽
    if (
      types.includes("application/x-keep-notes-file") ||
      types.includes("Files")
    ) {
      e.preventDefault();
    }
  }, []);

  const handleDropCapture = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    // 允许BlockNote内部拖拽
    if (types.includes("blocknote/html")) {
      return;
    }
    // 阻止外部文件拖拽
    if (
      types.includes("application/x-keep-notes-file") ||
      types.includes("Files")
    ) {
      e.preventDefault();
    }
  }, []);

  return (
    <div
      className="h-full overflow-y-auto overflow-x-hidden"
      style={editorStyle}
      onFocus={onFocus}
      onClick={onFocus}
      onDragOverCapture={handleDragOverCapture}
      onDropCapture={handleDropCapture}
    >
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2
            className="h-6 w-6 animate-spin"
            style={{ color: "var(--text-muted)" }}
          />
        </div>
      ) : null}
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
  groupId?: string;
  tabId?: string;
}) {
  const {
    content,
    filePath,
    setDirty,
    reloadKey,
    panelGroups = [],
    setTabContent,
    setTabDirty,
    setActiveGroupId,
    setActiveTab,
  } = useEditorStore();
  const { updateNodeContent } = useTreeStore();

  // 获取当前标签页数据
  const group = groupId ? panelGroups.find((g) => g.id === groupId) : null;
  const tab = group && tabId ? group.tabs.find((t) => t.id === tabId) : null;
  const currentContent = tab ? tab.content : content;
  const currentFilePath = tab ? tab.filePath : filePath;
  const currentReloadKey = tab ? tab.reloadKey : reloadKey;
  const currentDocumentKey = `${groupId ?? "legacy"}:${tabId ?? "legacy"}:${
    currentFilePath ?? "untitled"
  }`;
  const saveStateRef = useRef<{
    running: boolean;
    pending: { path: string; content: string } | null;
  }>({ running: false, pending: null });
  const ownWriteContentsRef = useRef<Set<string>>(new Set());

  // 当编辑器获得焦点时，更新 activeGroupId 和 activeTabId
  const handleFocus = useCallback(() => {
    if (groupId && tabId) {
      setActiveGroupId(groupId);
      setActiveTab(groupId, tabId);
    }
  }, [groupId, tabId, setActiveGroupId, setActiveTab]);

  // 同步更新所有打开相同文件的其他标签页
  const syncOtherTabs = useCallback(
    (newContent: string, path: string | null) => {
      if (!path) return;

      const state = useEditorStore.getState();
      for (const group of state.panelGroups) {
        for (const tab of group.tabs) {
          // 跳过当前标签页
          if (group.id === groupId && tab.id === tabId) continue;

          // 如果有相同文件路径，同步内容并触发重新加载
          if (tab.filePath === path) {
            state.setTabContent(group.id, tab.id, newContent);
            state.incrementTabReloadKey(group.id, tab.id);
          }
        }
      }
    },
    [groupId, tabId],
  );

  // 监听文件外部变化
  useEffect(() => {
    if (!currentFilePath) return;

    // 注册文件监听
    window.electronAPI.watchFile(currentFilePath);

    // 注册文件变化回调
    const unsubscribe = window.electronAPI.onFileChanged(
      (changedPath: string, newContent: string) => {
        if (changedPath === currentFilePath) {
          const state = useEditorStore.getState();
          const activeGroup = groupId
            ? state.panelGroups.find((group) => group.id === groupId)
            : null;
          const activeTab =
            activeGroup && tabId
              ? activeGroup.tabs.find((item) => item.id === tabId)
              : null;
          const currentEditorContent = activeTab
            ? activeTab.content
            : state.content;

          // 忽略自己写盘触发的事件，避免快速输入时被旧写入内容回滚。
          if (
            currentEditorContent === newContent ||
            ownWriteContentsRef.current.has(newContent)
          ) {
            ownWriteContentsRef.current.delete(newContent);
            return;
          }

          // 更新当前标签页内容
          if (groupId && tabId) {
            setTabContent(groupId, tabId, newContent);
            // 增加 reloadKey 触发编辑器重新加载
            const state = useEditorStore.getState();
            state.incrementTabReloadKey(groupId, tabId);
          }
          // 同步更新其他打开相同文件的标签页
          syncOtherTabs(newContent, currentFilePath);
        }
      },
    );

    return () => {
      // 取消文件监听
      window.electronAPI.unwatchFile(currentFilePath);
      unsubscribe();
    };
  }, [currentFilePath, groupId, tabId, setTabContent, syncOtherTabs]);

  const writeContentToDisk = useCallback(
    async (path: string, nextContent: string) => {
      ownWriteContentsRef.current.add(nextContent);
      await window.electronAPI.writeFile(path, nextContent);
      updateNodeContent(path, nextContent);
      window.setTimeout(() => {
        ownWriteContentsRef.current.delete(nextContent);
      }, 5000);
    },
    [updateNodeContent],
  );

  const flushSaveQueue = useCallback(async () => {
    const saveState = saveStateRef.current;
    if (saveState.running) return;

    saveState.running = true;
    let hasError = false;

    try {
      while (saveState.pending) {
        const pending = saveState.pending;
        saveState.pending = null;
        try {
          await writeContentToDisk(pending.path, pending.content);
        } catch (error) {
          hasError = true;
          console.error("保存Markdown文件失败", error);
        }
      }

      if (!hasError) {
        if (groupId && tabId) {
          setTabDirty(groupId, tabId, false);
        } else {
          setDirty(false);
        }
      }
    } finally {
      saveState.running = false;
      if (saveState.pending) {
        void flushSaveQueue();
      }
    }
  }, [groupId, setDirty, setTabDirty, tabId, writeContentToDisk]);

  const queueSaveContent = useCallback(
    (path: string, nextContent: string) => {
      saveStateRef.current.pending = { path, content: nextContent };
      void flushSaveQueue();
    },
    [flushSaveQueue],
  );

  const handleChange = useCallback(
    (newContent: string) => {
      // 无文件时保存到 store 作为草稿
      if (!currentFilePath) {
        if (groupId && tabId) {
          setTabContent(groupId, tabId, newContent);
        } else {
          useEditorStore.getState().setContent(newContent);
          useEditorStore.getState().setDirty(true);
        }
        return;
      }

      // 更新当前标签页内容
      if (groupId && tabId) {
        setTabContent(groupId, tabId, newContent);
      }

      // 同步更新其他打开相同文件的标签页
      syncOtherTabs(newContent, currentFilePath);

      const diffState = useDiffStore.getState();
      if (diffState.isOpen && diffState.filePath === currentFilePath) {
        diffState.updateContent(diffState.oldContent, newContent);
      }

      // 串行写入最新内容，避免快速输入时旧写入覆盖新写入。
      queueSaveContent(currentFilePath, newContent);
    },
    [
      currentFilePath,
      groupId,
      tabId,
      setTabContent,
      syncOtherTabs,
      queueSaveContent,
    ],
  );

  return (
    <BlockNoteEditorInner
      content={currentContent}
      documentKey={currentDocumentKey}
      reloadKey={currentReloadKey}
      onChange={handleChange}
      onFocus={handleFocus}
    />
  );
}
