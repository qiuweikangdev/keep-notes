import { useEffect, useRef, useCallback, useState } from "react";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { listenerCtx, listener } from "@milkdown/kit/plugin/listener";
import { history } from "@milkdown/kit/plugin/history";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { useEditorStore } from "@/store/editor.store";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "@/hooks/use-electron";
import { Loader2 } from "lucide-react";

interface MilkdownEditorProps {
  content: string;
  onChange?: (content: string) => void;
}

function MilkdownEditorInner({ content, onChange }: MilkdownEditorProps) {
  const { setWordCount } = useEditorStore();
  const [loading, setLoading] = useState(true);

  useEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, content);
        ctx.get(listenerCtx).markdownUpdated((ctx, markdown, prevMarkdown) => {
          if (markdown !== prevMarkdown) {
            setWordCount(markdown.length);
            onChange?.(markdown);
          }
        });
      })
      .config((ctx) => {
        ctx.get(listenerCtx).mounted(() => {
          setLoading(false);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener);
  });

  return (
    <>
      {loading && (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <Milkdown />
    </>
  );
}

export function MilkdownEditor() {
  const { content, filePath } = useEditorStore();
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
        }
      }, 500);
    },
    [filePath, saveFile, updateNodeContent],
  );

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-muted flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground/50"
            >
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" x2="8" y1="13" y2="13" />
              <line x1="16" x2="8" y1="17" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium">未选择文件</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              从左侧文件树选择一个 Markdown 文件开始编辑
            </p>
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
