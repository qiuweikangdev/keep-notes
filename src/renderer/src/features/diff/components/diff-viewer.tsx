import { useMemo } from "react";
import { FileDiff, type FileDiffOptions } from "@pierre/diffs/react";
import {
  parseDiffFromFile,
  type DiffsThemeNames,
  type FileContents,
  type FileDiffMetadata,
} from "@pierre/diffs";
import { useTheme } from "@/hooks/use-theme";

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  oldTitle?: string;
  newTitle?: string;
  fileName?: string;
  className?: string;
}

interface DiffStats {
  added: number;
  removed: number;
}

const DIFF_THEME_MAP: Record<string, DiffsThemeNames> = {
  light: "pierre-light",
  dark: "pierre-dark",
  nord: "nord",
  dracula: "dracula",
  solarized: "solarized-dark",
};

// 通过 unsafeCSS 注入到 Shadow DOM 内的 @layer unsafe（pierre 默认最高优先级层）。
// 库内默认 8x% mix 比例让红/绿颜色被强烈稀释，这里降低 mix 直接让删除/添加行
// 的整行背景呈现明显对比度，对应 pierre 文档示例的视觉效果。
const DIFF_VISUAL_BOOST_CSS = `
  :where([data-background]) [data-line-type="change-addition"][data-line],
  :where([data-background]) [data-line-type="change-addition"][data-no-newline],
  :where([data-background]) [data-line-type="change-deletion"][data-line],
  :where([data-background]) [data-line-type="change-deletion"][data-no-newline] {
    --mix-light: 60% !important;
    --mix-dark: 50% !important;
  }
  :where([data-background]) [data-line-type="change-addition"][data-gutter-buffer],
  :where([data-background]) [data-line-type="change-addition"][data-column-number],
  :where([data-background]) [data-line-type="change-deletion"][data-gutter-buffer],
  :where([data-background]) [data-line-type="change-deletion"][data-column-number] {
    --mix-light: 75% !important;
    --mix-dark: 65% !important;
  }
  [data-line-type="change-addition"] [data-diff-span] {
    background-color: rgba(46, 160, 67, 0.45) !important;
  }
  [data-line-type="change-deletion"] [data-diff-span] {
    background-color: rgba(248, 81, 73, 0.45) !important;
  }
`;

function getDiffStats(fileDiff: FileDiffMetadata | null): DiffStats {
  if (!fileDiff) return { added: 0, removed: 0 };

  return fileDiff.hunks.reduce(
    (stats, hunk) => ({
      added: stats.added + hunk.additionLines,
      removed: stats.removed + hunk.deletionLines,
    }),
    { added: 0, removed: 0 },
  );
}

function createCacheKey(fileName: string, content: string, side: string) {
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = (hash * 31 + content.charCodeAt(index)) | 0;
  }
  return `${fileName}:${side}:${content.length}:${hash}`;
}

export function DiffViewer({
  oldContent,
  newContent,
  oldTitle = "原始内容",
  newTitle = "修改内容",
  fileName = "diff.txt",
  className = "",
}: DiffViewerProps) {
  const { theme, isDark } = useTheme();

  const oldFile = useMemo<FileContents>(
    () => ({
      name: fileName,
      contents: oldContent,
      header: "磁盘",
      cacheKey: createCacheKey(fileName, oldContent, "old"),
    }),
    [fileName, oldContent],
  );

  const newFile = useMemo<FileContents>(
    () => ({
      name: fileName,
      contents: newContent,
      header: "编辑器",
      cacheKey: createCacheKey(fileName, newContent, "new"),
    }),
    [fileName, newContent],
  );

  const fileDiff = useMemo(() => {
    try {
      // 使用 @pierre/diffs 官方解析器生成渲染元数据，避免依赖不存在的 diffLines 导出。
      return parseDiffFromFile(oldFile, newFile, undefined, true);
    } catch (error) {
      if (oldContent !== newContent) {
        console.error("Failed to compute diff:", error);
      }
      return null;
    }
  }, [newFile, newContent, oldFile, oldContent]);

  const stats = useMemo(() => getDiffStats(fileDiff), [fileDiff]);

  const diffOptions = useMemo<FileDiffOptions<undefined>>(
    () => ({
      theme: DIFF_THEME_MAP[theme] ?? (isDark ? "pierre-dark" : "pierre-light"),
      themeType: isDark ? "dark" : "light",
      diffStyle: "split",
      diffIndicators: "classic",
      hunkSeparators: "line-info-basic",
      lineDiffType: "word",
      overflow: "wrap",
      stickyHeader: true,
      disableFileHeader: true,
      tokenizeMaxLineLength: 1200,
      disableVirtualizationBuffers: true,
      unsafeCSS: DIFF_VISUAL_BOOST_CSS,
    }),
    [isDark, theme],
  );

  return (
    <div
      className={`diff-viewer flex h-full flex-col overflow-hidden ${className}`}
    >
      <div className="diff-viewer__toolbar flex flex-shrink-0 items-center justify-between gap-3 px-4 py-2">
        <div className="min-w-0 flex-1 truncate text-sm font-medium">
          <span>{oldTitle}</span>
          <span className="mx-2 text-[var(--text-muted)]">→</span>
          <span>{newTitle}</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span className="diff-viewer__stat diff-viewer__stat--added">
            +{stats.added}
          </span>
          <span className="diff-viewer__stat diff-viewer__stat--removed">
            -{stats.removed}
          </span>
        </div>
      </div>

      <div className="diff-viewer__body min-h-0 flex-1 overflow-auto">
        {fileDiff ? (
          <FileDiff
            fileDiff={fileDiff}
            options={diffOptions}
            className="diff-viewer__pierre"
            disableWorkerPool
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
            没有可显示的差异
          </div>
        )}
      </div>
    </div>
  );
}
