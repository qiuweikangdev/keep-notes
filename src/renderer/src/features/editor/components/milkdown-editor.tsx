import { useEffect, useRef, useCallback, useState } from "react";
import { Crepe } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { useEditorStore } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "@/hooks/use-electron";
import { useTheme } from "@/hooks/use-theme";
import { Loader2, FileText } from "lucide-react";

// 导入所有 Milkdown 主题
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "@milkdown/crepe/theme/frame-dark.css";
import "@milkdown/crepe/theme/nord.css";
import "@milkdown/crepe/theme/nord-dark.css";

// 覆盖 Crepe 主题 token 颜色（必须在主题 CSS 之后导入）
import "@/styles/milkdown-overrides.css";

interface MilkdownEditorProps {
  content: string;
  onChange?: (content: string) => void;
}

function MilkdownEditorInner({ content, onChange }: MilkdownEditorProps) {
  const { setWordCount, setDirty, appearance } = useEditorStore();
  const { milkdownTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const crepeRef = useRef<Crepe | null>(null);

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
          text: "开始写作...",
          mode: "doc",
        },
        [Crepe.Feature.LinkTooltip]: {
          inputPlaceholder: "输入链接地址...",
        },
        [Crepe.Feature.ImageBlock]: {
          onUpload: async (file: File) => {
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => {
                resolve(reader.result as string);
              };
              reader.readAsDataURL(file);
            });
          },
        },
      },
    });

    // 监听内容变化
    crepe.on((listener) => {
      listener.markdownUpdated((ctx, markdown, prevMarkdown) => {
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

    crepeRef.current = crepe;
    return crepe.editor;
  });

  // 更新内容
  useEffect(() => {
    if (crepeRef.current && content !== undefined && !loading) {
      try {
        const editor = get();
        if (editor && editor.status === "Created") {
          crepeRef.current.setMarkdown(content);
        }
      } catch (e) {
        console.warn("Failed to set markdown:", e);
      }
    }
  }, [content, loading, get]);

  // 根据主题选择类名
  const getThemeClass = () => {
    switch (milkdownTheme) {
      case "frame-dark":
      case "nord-dark":
        return "milkdown-dark-theme";
      default:
        return "milkdown-light-theme";
    }
  };

  // 应用编辑器外观设置
  const editorStyle = {
    backgroundColor: "var(--bg-primary)",
    opacity: appearance.opacity / 100,
    "--editor-font-size": `${appearance.fontSize}px`,
    "--editor-line-height": appearance.lineHeight,
    "--editor-padding": `${appearance.padding}px`,
  } as React.CSSProperties;

  return (
    <div
      className={`h-full overflow-y-auto overflow-x-hidden ${getThemeClass()}`}
      style={editorStyle}
    >
      {loading && (
        <div className="flex items-center justify-center h-32">
          <Loader2
            className="h-6 w-6 animate-spin"
            style={{ color: "var(--text-muted)" }}
          />
        </div>
      )}
      <Milkdown />
    </div>
  );
}

export function MilkdownEditor() {
  const { content, filePath, setDirty } = useEditorStore();
  const { updateNodeContent } = useTreeStore();
  const { saveFile } = useElectron();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleChange = useCallback(
    async (newContent: string) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        if (filePath) {
          await saveFile(newContent);
          updateNodeContent(filePath, newContent);
          setDirty(false);
        }
      }, 500);
    },
    [filePath, saveFile, updateNodeContent, setDirty],
  );

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (!filePath) {
    return (
      <div
        className="flex items-center justify-center h-full"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <div className="text-center space-y-4">
          <div
            className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            <FileText
              className="h-10 w-10"
              style={{ color: "var(--text-muted)" }}
            />
          </div>
          <div className="space-y-2">
            <p
              className="text-base font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              欢迎使用 Keep Notes
            </p>
            <p
              className="text-sm max-w-[280px]"
              style={{ color: "var(--text-muted)" }}
            >
              从左侧文件树选择一个 Markdown 文件开始编辑，或创建一个新文件
            </p>
          </div>
          <div
            className="flex flex-col items-center gap-2 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            <div className="flex items-center gap-2">
              <kbd
                className="px-2 py-0.5 rounded"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-muted)",
                }}
              >
                ⌘ N
              </kbd>
              <span>新建文件</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd
                className="px-2 py-0.5 rounded"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-muted)",
                }}
              >
                ⌘ O
              </kbd>
              <span>打开文件夹</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd
                className="px-2 py-0.5 rounded"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  color: "var(--text-muted)",
                }}
              >
                /
              </kbd>
              <span>斜杠命令</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MilkdownProvider>
      <MilkdownEditorInner
        key={filePath}
        content={content}
        onChange={handleChange}
      />
    </MilkdownProvider>
  );
}
