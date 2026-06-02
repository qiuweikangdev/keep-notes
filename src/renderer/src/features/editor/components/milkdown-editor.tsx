import {
  useEffect,
  useRef,
  useCallback,
  useState,
  type CSSProperties,
} from "react";
import { Crepe } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { useEditorStore } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import { useTheme } from "@/hooks/use-theme";
import { Loader2 } from "lucide-react";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "@/styles/milkdown-overrides.css";

interface MilkdownEditorProps {
  content: string;
  onChange?: (content: string) => void;
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

function MilkdownEditorInner({ content, onChange }: MilkdownEditorProps) {
  const { setWordCount, setDirty, appearance } = useEditorStore();
  const { milkdownTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEditor((root) => {
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
          setDirty(true);
          onChange?.(markdown);
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

  return (
    <div
      ref={containerRef}
      className={`h-full overflow-y-auto overflow-x-hidden ${getThemeClass()}`}
      style={editorStyle}
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

export function MilkdownEditor() {
  const { content, filePath, setDirty } = useEditorStore();
  const { updateNodeContent } = useTreeStore();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSaveRef = useRef<{ filePath: string; content: string } | null>(
    null,
  );

  const saveContent = useCallback(
    async (path: string, nextContent: string) => {
      try {
        await window.electronAPI.writeFile(path, nextContent);
        updateNodeContent(path, nextContent);
        const pending = pendingSaveRef.current;
        if (
          !pending ||
          (pending.filePath === path && pending.content === nextContent)
        ) {
          pendingSaveRef.current = null;
          setDirty(false);
        }
      } catch (error) {
        console.error("Failed to save markdown file", error);
      }
    },
    [updateNodeContent, setDirty],
  );

  const handleChange = useCallback(
    async (newContent: string) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // 无文件时保存到 store 作为草稿
      if (!filePath) {
        useEditorStore.getState().setContent(newContent);
        useEditorStore.getState().setDirty(true);
        return;
      }

      pendingSaveRef.current = { filePath, content: newContent };
      saveTimeoutRef.current = setTimeout(async () => {
        const pending = pendingSaveRef.current;
        if (!pending) return;
        await saveContent(pending.filePath, pending.content);
      }, 500);
    },
    [filePath, saveContent],
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      const pending = pendingSaveRef.current;
      if (pending) {
        void saveContent(pending.filePath, pending.content);
      }
    };
  }, [saveContent]);

  return (
    <MilkdownProvider>
      <MilkdownEditorInner content={content} onChange={handleChange} />
    </MilkdownProvider>
  );
}
