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

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

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

  // 创建编辑器实例
  const editor = useCreateBlockNote({
    initialContent: undefined,
  });

  // 监听内容变化
  useEditorChange(async (editor) => {
    if (!onChange || isLoadingContentRef.current) return;

    // 将编辑器内容转换为Markdown
    const rawMarkdown = await editor.blocksToMarkdownLossy(editor.document);

    // 标准化列表标记（将 * 转换为 -）
    const markdown = normalizeMarkdownListMarkers(rawMarkdown);

    // 如果内容没有变化，不触发onChange
    if (markdown === lastSavedContentRef.current) return;

    // 更新字数统计
    setWordCount(markdown.length);

    // 标记为已修改
    setDirty(true);

    // 调用onChange回调
    lastSavedContentRef.current = markdown;
    onChange(markdown);
  }, editor);

  // 加载初始内容
  useEffect(() => {
    if (!editor) return;

    const loadContent = async () => {
      try {
        setLoading(true);
        isLoadingContentRef.current = true;

        if (content) {
          // 将Markdown内容解析为BlockNote块
          const blocks = await editor.tryParseMarkdownToBlocks(content);
          editor.replaceBlocks(editor.document, blocks);
          lastSavedContentRef.current = content;
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

  return (
    <div
      className="h-full overflow-y-auto overflow-x-hidden"
      style={editorStyle}
      onFocus={onFocus}
      onClick={onFocus}
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

  // 当编辑器获得焦点时，更新 activeGroupId
  const handleFocus = useCallback(() => {
    if (groupId) {
      setActiveGroupId(groupId);
    }
  }, [groupId, setActiveGroupId]);

  // 同步更新所有打开相同文件的其他标签页
  const syncOtherTabs = useCallback(
    (newContent: string, path: string | null) => {
      if (!path) return;

      const state = useEditorStore.getState();
      for (const group of state.panelGroups) {
        for (const tab of group.tabs) {
          // 跳过当前标签页
          if (group.id === groupId && tab.id === tabId) continue;

          // 如果有相同文件路径，同步内容
          if (tab.filePath === path) {
            state.setTabContent(group.id, tab.id, newContent);
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
