import {
  useEffect,
  useRef,
  useCallback,
  useState,
  type CSSProperties,
} from "react";
import { Crepe } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { replaceAll } from "@milkdown/utils";
import { useEditorStore } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import { useTheme } from "@/hooks/use-theme";
import { Loader2 } from "lucide-react";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "@/styles/milkdown-overrides.css";

interface MilkdownEditorProps {
  content: string;
  reloadKey: number;
  onChange?: (content: string) => void;
  onFocus?: () => void;
}

function keepSlashMenuUsable(container: HTMLElement) {
  const menu = document.querySelector<HTMLElement>(".milkdown-slash-menu");
  if (!menu || menu.dataset.show === "false") return;

  const editorBounds = container.getBoundingClientRect();
  const menuBounds = menu.getBoundingClientRect();
  const minTop = editorBounds.top + 12;
  const maxBottom = Math.min(editorBounds.bottom, window.innerHeight) - 12;
  const nextMaxHeight = Math.max(220, maxBottom - minTop);

  menu.style.maxHeight = `${nextMaxHeight}px`;

  const groups = menu.querySelector<HTMLElement>(".menu-groups");
  if (groups) {
    const tabHeight =
      menu.querySelector<HTMLElement>(".tab-group")?.offsetHeight ?? 0;
    groups.style.maxHeight = `${Math.max(160, nextMaxHeight - tabHeight)}px`;
    groups.style.overflowY = "auto";
  }

  const dy =
    menuBounds.top < minTop
      ? minTop - menuBounds.top
      : menuBounds.bottom > maxBottom
        ? maxBottom - menuBounds.bottom
        : 0;

  if (dy) {
    const currentTop = Number.parseFloat(menu.style.top || "0");
    if (Number.isFinite(currentTop)) {
      menu.style.top = `${currentTop + dy}px`;
    }
  }
}

function preventSlashMenuItemHoverSync() {
  const items = document.querySelectorAll<HTMLElement>(
    ".milkdown-slash-menu .menu-groups li",
  );

  items.forEach((item) => {
    if (item.dataset.hoverSyncDisabled === "true") return;
    item.dataset.hoverSyncDisabled = "true";
    item.addEventListener(
      "pointerenter",
      (event) => {
        event.stopImmediatePropagation();
      },
      true,
    );
  });
}

function MilkdownEditorInner({
  content,
  reloadKey,
  onChange,
  onFocus,
}: MilkdownEditorProps) {
  const { setWordCount, setDirty, appearance } = useEditorStore();
  const { milkdownTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const replaceSeqRef = useRef(0);
  const lastExternalContentRef = useRef<string | null>(null);

  const { get } = useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: content,
      features: {
        [Crepe.Feature.CodeMirror]: true,
        [Crepe.Feature.ListItem]: true,
        [Crepe.Feature.LinkTooltip]: true,
        [Crepe.Feature.ImageBlock]: true,
        [Crepe.Feature.BlockEdit]: true,
        [Crepe.Feature.Table]: true,
        [Crepe.Feature.Toolbar]: true,
        [Crepe.Feature.Cursor]: true,
        [Crepe.Feature.Placeholder]: true,
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.TopBar]: false,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: "输入内容，或输入 / 调出命令",
          mode: "block",
        },
        [Crepe.Feature.LinkTooltip]: {
          inputPlaceholder: "粘贴链接...",
        },
        [Crepe.Feature.BlockEdit]: {
          textGroup: {
            label: "文本",
          },
          listGroup: {
            label: "列表",
          },
          advancedGroup: {
            label: "高级",
          },
        },
        [Crepe.Feature.CodeMirror]: {
          copyText: "复制",
          searchPlaceholder: "搜索语言",
          noResultText: "无结果",
          previewToggleText: (previewOnlyMode: boolean) =>
            previewOnlyMode ? "编辑" : "隐藏",
        },
        [Crepe.Feature.ImageBlock]: {
          onUpload: async (file: File) => {
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(file);
            });
          },
        },
      },
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_, markdown, prevMarkdown) => {
        if (markdown !== prevMarkdown) {
          setWordCount(markdown.length);
          // 区分用户输入和外部 replaceAll 触发的变化
          // 如果内容与最近的外部内容相同，则忽略
          const isExternalUpdate = markdown === lastExternalContentRef.current;
          if (!isExternalUpdate) {
            setDirty(true);
            onChange?.(markdown);
          }
          // 重置外部内容标记
          lastExternalContentRef.current = null;
        }
      });

      listener.mounted(() => {
        setLoading(false);
      });
    });

    return crepe.editor;
  });

  const getThemeClass = () => {
    switch (milkdownTheme) {
      case "frame-dark":
      case "nord-dark":
        return "milkdown-dark-theme";
      default:
        return "milkdown-light-theme";
    }
  };

  const editorStyle = {
    backgroundColor: "var(--bg-primary)",
    opacity: appearance.opacity / 100,
    "--editor-font-size": `${appearance.fontSize}px`,
    "--editor-line-height": appearance.lineHeight,
    "--editor-padding": `${appearance.padding}px`,
  } as CSSProperties;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const stopMenuItemHover = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        typeof target.closest === "function" &&
        target.closest(".milkdown-slash-menu .menu-groups li")
      ) {
        event.stopImmediatePropagation();
      }
    };

    const scheduleUpdate = () => {
      requestAnimationFrame(() => {
        preventSlashMenuItemHoverSync();
        keepSlashMenuUsable(container);
      });
    };

    document.addEventListener("pointerenter", stopMenuItemHover, true);
    document.addEventListener("pointermove", scheduleUpdate, true);
    window.addEventListener("resize", scheduleUpdate);

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-show", "style", "class"],
    });
    scheduleUpdate();

    return () => {
      document.removeEventListener("pointerenter", stopMenuItemHover, true);
      document.removeEventListener("pointermove", scheduleUpdate, true);
      window.removeEventListener("resize", scheduleUpdate);
      observer.disconnect();
    };
  }, []);

  // 外部内容变化时（如切换文件或放弃更改后重新读取文件），无感同步到编辑器
  useEffect(() => {
    const editor = get();
    if (!editor || loading) return;

    const seq = ++replaceSeqRef.current;

    // 使用 requestAnimationFrame 延迟到下一帧执行，确保只应用最新的内容
    const rafId = requestAnimationFrame(() => {
      // 检查 seq 是否仍是最新的，防止过期更新
      if (seq === replaceSeqRef.current) {
        // 记录外部内容，用于在 markdownUpdated 事件中区分用户输入和外部更新
        lastExternalContentRef.current = content;
        editor.action(replaceAll(content));
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [reloadKey, content, loading]);

  return (
    <div
      ref={containerRef}
      className={`h-full overflow-y-auto overflow-x-hidden ${getThemeClass()}`}
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
      <Milkdown />
    </div>
  );
}

export function MilkdownEditor({
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

  const saveContent = useCallback(
    async (path: string, nextContent: string) => {
      try {
        await window.electronAPI.writeFile(path, nextContent);
        updateNodeContent(path, nextContent);
        if (groupId && tabId) {
          setTabDirty(groupId, tabId, false);
        } else {
          setDirty(false);
        }
      } catch (error) {
        console.error("Failed to save markdown file", error);
      }
    },
    [updateNodeContent, setDirty, groupId, tabId, setTabDirty],
  );

  const handleChange = useCallback(
    async (newContent: string) => {
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

      // 立即保存到文件
      await saveContent(currentFilePath, newContent);
    },
    [
      currentFilePath,
      saveContent,
      groupId,
      tabId,
      setTabContent,
      syncOtherTabs,
    ],
  );

  return (
    <MilkdownProvider>
      <MilkdownEditorInner
        content={currentContent}
        reloadKey={currentReloadKey}
        onChange={handleChange}
        onFocus={handleFocus}
      />
    </MilkdownProvider>
  );
}
