import { ImagePreview } from "@/features/image-preview/components/image-preview";

interface ImageDiffViewerProps {
  oldContent: string;
  newContent: string;
  oldTitle?: string;
  newTitle?: string;
  className?: string;
  reserveDialogResizeHandleSpace?: boolean;
}

export function ImageDiffViewer({
  oldContent,
  newContent,
  oldTitle = "原始图片",
  newTitle = "修改图片",
  className = "",
  reserveDialogResizeHandleSpace = false,
}: ImageDiffViewerProps) {
  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`}>
      <div className="shrink-0 border-b border-[var(--border-color)] px-4 py-2 text-sm text-[var(--text-secondary)]">
        图片对比
        {oldContent && oldContent === newContent ? " · 图片内容相同" : ""}
      </div>
      <div
        className={`grid min-h-0 flex-1 grid-cols-2 ${reserveDialogResizeHandleSpace ? "mb-3 mr-3" : ""}`}
      >
        {[
          {
            source: oldContent,
            title: oldTitle,
            emptyMessage: "此版本中没有图片（新增）",
          },
          {
            source: newContent,
            title: newTitle,
            emptyMessage: "此版本中没有图片（删除）",
          },
        ].map((side) => (
          <section
            key={side.title}
            aria-label={side.title}
            className="flex min-h-0 min-w-0 flex-col border-r border-[var(--border-color)] last:border-r-0"
          >
            <h3
              className="shrink-0 truncate border-b border-[var(--border-color)] px-4 py-2 text-xs font-medium"
              title={side.title}
            >
              {side.title}
            </h3>
            <div className="min-h-0 flex-1">
              <ImagePreview
                source={side.source}
                label={side.title}
                emptyMessage={side.emptyMessage}
                reserveToolbar
              />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
