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
import { useElectron } from "@/hooks/use-electron";
import { useTheme } from "@/hooks/use-theme";
import { Loader2, FileText } from "lucide-react";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "@/styles/milkdown-overrides.css";

interface MilkdownEditorProps {
  content: string;
  onChange?: (content: string) => void;
}

function MilkdownEditorInner({ content, onChange }: MilkdownEditorProps) {
  const { setWordCount, setDirty, appearance } = useEditorStore();
  const { milkdownTheme } = useTheme();
  const [loading, setLoading] = useState(true);

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
        [Crepe.Feature.Placeholder]: false,
        [Crepe.Feature.Latex]: false,
        [Crepe.Feature.TopBar]: false,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: false,
        [Crepe.Feature.LinkTooltip]: {
          inputPlaceholder: "粘贴链接...",
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

  return (
    <div
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
  const { saveFile } = useElectron();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleChange = useCallback(
    async (newContent: string) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(async () => {
        if (!filePath) return;
        await saveFile(newContent);
        updateNodeContent(filePath, newContent);
        setDirty(false);
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
        className="flex h-full items-center justify-center"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <div className="space-y-4 text-center">
          <div
            className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl"
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
              className="max-w-[280px] text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              从资源管理器选择一个 Markdown 文件，或新建一个文件开始编辑。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MilkdownProvider key={filePath}>
      <MilkdownEditorInner content={content} onChange={handleChange} />
    </MilkdownProvider>
  );
}
