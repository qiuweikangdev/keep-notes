import { useEffect, useMemo, useState } from "react";
import { FileDiff, type FileDiffOptions } from "@pierre/diffs/react";
import {
  parseDiffFromFile,
  type CreatePatchOptionsNonabortable,
  type DiffsThemeNames,
  type FileContents,
  type FileDiffMetadata,
} from "@pierre/diffs";
import { useTheme } from "@/hooks/use-theme";
import { normalizeDiffContent } from "../lib/diff-content";

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  oldTitle?: string;
  newTitle?: string;
  fileName?: string;
  className?: string;
  reserveDialogResizeHandleSpace?: boolean;
}

interface DiffStats {
  added: number;
  removed: number;
}

interface DiffInput {
  cacheKey: string;
  isLarge: boolean;
  oldFile: FileContents;
  newFile: FileContents;
  normalizedOldContent: string;
  normalizedNewContent: string;
}

interface DiffComputationState {
  status: "empty" | "computing" | "ready" | "error";
  cacheKey: string;
  fileDiff: FileDiffMetadata | null;
}

const DIFF_THEME_MAP: Record<string, DiffsThemeNames> = {
  light: "pierre-light",
  dark: "pierre-dark",
  nord: "nord",
  dracula: "dracula",
  solarized: "solarized-dark",
  system: "pierre-dark",
};

const LARGE_DIFF_CHAR_LIMIT = 20000;
const LARGE_DIFF_CONTEXT_LINES = 3;
const DIFF_CACHE_LIMIT = 6;
const DIFF_METADATA_CACHE = new Map<string, FileDiffMetadata | null>();

const DIFF_VISUAL_BOOST_CSS = `
  :host {
    --diffs-bg: var(--bg-primary) !important;
    --diffs-fg: var(--text-primary) !important;
    --diffs-bg-context: var(--bg-primary) !important;
    --diffs-bg-context-gutter: var(--bg-secondary) !important;
    --diffs-bg-buffer: var(--bg-primary) !important;
    --diffs-bg-separator: var(--bg-secondary) !important;
    --diffs-fg-number: var(--text-muted) !important;
    --diffs-bg-hover-override: var(--hover-bg) !important;
  }

  :host, [data-code], [data-gutter], [data-content], [data-content-buffer] {
    background-color: var(--bg-primary) !important;
  }

  :where([data-background]) [data-line-type="change-addition"][data-line],
  :where([data-background]) [data-line-type="change-addition"][data-no-newline] {
    --diffs-line-bg: color-mix(
      in srgb,
      rgb(46, 160, 67) 22%,
      var(--bg-primary)
    ) !important;
  }
  :where([data-background]) [data-line-type="change-deletion"][data-line],
  :where([data-background]) [data-line-type="change-deletion"][data-no-newline] {
    --diffs-line-bg: color-mix(
      in srgb,
      rgb(248, 81, 73) 24%,
      var(--bg-primary)
    ) !important;
  }
  :where([data-background]) [data-line-type="change-addition"][data-gutter-buffer],
  :where([data-background]) [data-line-type="change-addition"][data-column-number] {
    --diffs-line-bg: color-mix(
      in srgb,
      rgb(46, 160, 67) 30%,
      var(--bg-primary)
    ) !important;
    color: #4ade80 !important;
  }
  :where([data-background]) [data-line-type="change-deletion"][data-gutter-buffer],
  :where([data-background]) [data-line-type="change-deletion"][data-column-number] {
    --diffs-line-bg: color-mix(
      in srgb,
      rgb(248, 81, 73) 34%,
      var(--bg-primary)
    ) !important;
    color: #f87171 !important;
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

function setDiffMetadataCache(key: string, value: FileDiffMetadata | null) {
  if (DIFF_METADATA_CACHE.has(key)) {
    DIFF_METADATA_CACHE.delete(key);
  }
  DIFF_METADATA_CACHE.set(key, value);

  while (DIFF_METADATA_CACHE.size > DIFF_CACHE_LIMIT) {
    const firstKey = DIFF_METADATA_CACHE.keys().next().value;
    if (!firstKey) break;
    DIFF_METADATA_CACHE.delete(firstKey);
  }
}

function scheduleDiffComputation(callback: () => void, isLarge: boolean) {
  const idleWindow = window as Window & {
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions,
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  // 先让弹窗/面板完成首帧绘制，再计算大 diff，避免点击后看起来没有响应。
  if (isLarge && typeof idleWindow.requestIdleCallback === "function") {
    const handle = idleWindow.requestIdleCallback(callback, { timeout: 200 });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const timer = window.setTimeout(callback, 32);
  return () => window.clearTimeout(timer);
}

function createDiffInput(
  oldContent: string,
  newContent: string,
  fileName: string,
): DiffInput {
  const normalizedOldContent = normalizeDiffContent(oldContent);
  const normalizedNewContent = normalizeDiffContent(newContent);
  const oldCacheKey = createCacheKey(fileName, normalizedOldContent, "old");
  const newCacheKey = createCacheKey(fileName, normalizedNewContent, "new");

  return {
    cacheKey: `${oldCacheKey}:${newCacheKey}`,
    isLarge:
      normalizedOldContent.length + normalizedNewContent.length >=
      LARGE_DIFF_CHAR_LIMIT,
    normalizedOldContent,
    normalizedNewContent,
    oldFile: {
      name: fileName,
      contents: normalizedOldContent,
      header: "磁盘",
      cacheKey: oldCacheKey,
    },
    newFile: {
      name: fileName,
      contents: normalizedNewContent,
      header: "编辑器",
      cacheKey: newCacheKey,
    },
  };
}

function computeFileDiff(input: DiffInput) {
  if (input.normalizedOldContent === input.normalizedNewContent) {
    return null;
  }

  const parseOptions: CreatePatchOptionsNonabortable | undefined = input.isLarge
    ? { context: LARGE_DIFF_CONTEXT_LINES }
    : undefined;

  return parseDiffFromFile(input.oldFile, input.newFile, parseOptions, true);
}

export function DiffViewer({
  oldContent,
  newContent,
  oldTitle = "原始内容",
  newTitle = "修改内容",
  fileName = "diff.txt",
  className = "",
  reserveDialogResizeHandleSpace = false,
}: DiffViewerProps) {
  const { theme, isDark } = useTheme();
  const diffInput = useMemo(
    () => createDiffInput(oldContent, newContent, fileName),
    [fileName, newContent, oldContent],
  );
  const [diffState, setDiffState] = useState<DiffComputationState>(() => {
    const hasCached = DIFF_METADATA_CACHE.has(diffInput.cacheKey);
    return {
      status:
        diffInput.normalizedOldContent === diffInput.normalizedNewContent
          ? "empty"
          : hasCached
            ? "ready"
            : "computing",
      cacheKey: diffInput.cacheKey,
      fileDiff: hasCached
        ? (DIFF_METADATA_CACHE.get(diffInput.cacheKey) ?? null)
        : null,
    };
  });

  useEffect(() => {
    if (diffInput.normalizedOldContent === diffInput.normalizedNewContent) {
      setDiffState({
        status: "empty",
        cacheKey: diffInput.cacheKey,
        fileDiff: null,
      });
      return undefined;
    }

    if (DIFF_METADATA_CACHE.has(diffInput.cacheKey)) {
      setDiffState({
        status: "ready",
        cacheKey: diffInput.cacheKey,
        fileDiff: DIFF_METADATA_CACHE.get(diffInput.cacheKey) ?? null,
      });
      return undefined;
    }

    let cancelled = false;
    setDiffState({
      status: "computing",
      cacheKey: diffInput.cacheKey,
      fileDiff: null,
    });

    const cancelSchedule = scheduleDiffComputation(() => {
      try {
        // 大文档只保留少量上下文，避免把整篇文档同步塞进 diff 渲染树。
        const nextFileDiff = computeFileDiff(diffInput);
        setDiffMetadataCache(diffInput.cacheKey, nextFileDiff);
        if (!cancelled) {
          setDiffState({
            status: "ready",
            cacheKey: diffInput.cacheKey,
            fileDiff: nextFileDiff,
          });
        }
      } catch (error) {
        console.error("Failed to compute diff:", error);
        if (!cancelled) {
          setDiffState({
            status: "error",
            cacheKey: diffInput.cacheKey,
            fileDiff: null,
          });
        }
      }
    }, diffInput.isLarge);

    return () => {
      cancelled = true;
      cancelSchedule();
    };
  }, [diffInput]);

  const currentStatus =
    diffState.cacheKey === diffInput.cacheKey ? diffState.status : "computing";
  const fileDiff =
    diffState.cacheKey === diffInput.cacheKey ? diffState.fileDiff : null;
  const stats = useMemo(() => getDiffStats(fileDiff), [fileDiff]);

  const diffOptions = useMemo<FileDiffOptions<undefined>>(
    () => ({
      theme: DIFF_THEME_MAP[theme] ?? (isDark ? "pierre-dark" : "pierre-light"),
      themeType: isDark ? "dark" : "light",
      diffStyle: "split",
      diffIndicators: "classic",
      hunkSeparators: "line-info-basic",
      lineDiffType: diffInput.isLarge ? "none" : "word",
      maxLineDiffLength: diffInput.isLarge ? 240 : 1200,
      overflow: "wrap",
      stickyHeader: true,
      disableFileHeader: true,
      tokenizeMaxLineLength: diffInput.isLarge ? 240 : 1200,
      unsafeCSS: DIFF_VISUAL_BOOST_CSS,
    }),
    [diffInput.isLarge, isDark, theme],
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

      <div
        className={`diff-viewer__body min-h-0 flex-1 overflow-auto ${reserveDialogResizeHandleSpace ? "mb-3 mr-3" : ""}`}
      >
        {currentStatus === "computing" ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
            正在计算差异…
          </div>
        ) : fileDiff ? (
          <FileDiff
            fileDiff={fileDiff}
            options={diffOptions}
            className="diff-viewer__pierre"
          />
        ) : currentStatus === "error" ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
            差异计算失败
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
            没有可显示的差异
          </div>
        )}
      </div>
    </div>
  );
}
