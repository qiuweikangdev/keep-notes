import { useLayoutEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/cn";

interface ImagePreviewProps {
  source: string;
  label: string;
  emptyMessage?: string;
  reserveToolbar?: boolean;
}

interface ImageSize {
  width: number;
  height: number;
}

const ZOOM_LEVELS = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
const CONTROL_CLASS =
  "inline-flex h-7 items-center justify-center rounded px-2 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-color)] disabled:opacity-40";

export function ImagePreview(props: ImagePreviewProps) {
  // 图片来源变化时重建显示状态，避免上一张图片的加载错误、尺寸和缩放污染新预览。
  return <ImagePreviewContent key={props.source} {...props} />;
}

function ImagePreviewContent({
  source,
  label,
  emptyMessage = "没有图片",
  reserveToolbar = false,
}: ImagePreviewProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [dimensions, setDimensions] = useState<ImageSize | null>(null);
  const [viewport, setViewport] = useState<ImageSize>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const validSource = /^data:image\/[a-z0-9.+-]+;base64,/iu.test(source);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setViewport((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 按画布的可用空间计算适应比例，小图保留原尺寸，放大后由画布滚动浏览。
  const fitScale =
    dimensions && viewport.width > 48 && viewport.height > 48
      ? Math.min(
          1,
          (viewport.width - 48) / dimensions.width,
          (viewport.height - 48) / dimensions.height,
        )
      : 1;
  const scale = zoom === "fit" ? fitScale : zoom;
  const changeZoom = (direction: "in" | "out") => {
    const next =
      direction === "in"
        ? ZOOM_LEVELS.find((value) => value > scale + 0.001)
        : ZOOM_LEVELS.findLast((value) => value < scale - 0.001);
    if (next !== undefined) setZoom(next);
  };
  const setView = (value: "fit" | number) => {
    setZoom(value);
    if (viewportRef.current) {
      viewportRef.current.scrollTop = 0;
      viewportRef.current.scrollLeft = 0;
    }
  };

  return (
    <div className="image-preview flex h-full min-h-0 flex-col">
      <div
        ref={viewportRef}
        className="image-preview__canvas min-h-0 flex-1 overflow-auto"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        <div className="flex min-h-full min-w-full w-max items-center justify-center p-6">
          {!source ? (
            <p className="text-sm text-[var(--text-muted)]">{emptyMessage}</p>
          ) : failed || !validSource ? (
            <p role="alert" className="text-sm text-[var(--text-muted)]">
              图片无法预览
            </p>
          ) : (
            <img
              src={source}
              alt={label}
              draggable={false}
              className="image-preview__image block shrink-0 select-none"
              style={{
                width: dimensions ? dimensions.width * scale : undefined,
                height: dimensions ? dimensions.height * scale : undefined,
                maxWidth: dimensions ? "none" : "100%",
                backgroundColor: "var(--bg-primary)",
                // 棋盘格仅覆盖图片的透明区域，让画布保持简洁且不抢夺视觉焦点。
                backgroundImage:
                  "conic-gradient(var(--bg-tertiary) 25%, transparent 0 50%, var(--bg-tertiary) 0 75%, transparent 0)",
                backgroundSize: "12px 12px",
              }}
              onDoubleClick={() => setView(zoom === "fit" ? 1 : "fit")}
              onLoad={(event) => {
                const image = event.currentTarget;
                if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                  setDimensions({
                    width: image.naturalWidth,
                    height: image.naturalHeight,
                  });
                }
              }}
              onError={() => setFailed(true)}
            />
          )}
        </div>
      </div>
      {reserveToolbar || (dimensions && !failed) ? (
        // 差异两侧固定预留同高底栏，空版本和加载失败时也保持画布底边对齐。
        <div
          className={cn(
            "image-preview__toolbar flex shrink-0 items-center justify-between gap-x-4 border-t border-[var(--border-color)] px-4",
            reserveToolbar ? "h-11 flex-nowrap" : "flex-wrap gap-y-1 py-1.5",
          )}
        >
          {dimensions && !failed ? (
            <>
              <span className="min-w-0 truncate text-xs tabular-nums text-[var(--text-muted)]">
                {dimensions.width} × {dimensions.height} px
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label="缩小图片"
                  title="缩小"
                  className={CONTROL_CLASS}
                  disabled={scale <= ZOOM_LEVELS[0]}
                  onClick={() => changeZoom("out")}
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span
                  aria-live="polite"
                  className="min-w-[38px] text-center text-xs tabular-nums text-[var(--text-secondary)]"
                >
                  {Math.round(scale * 100)}%
                </span>
                <button
                  type="button"
                  aria-label="放大图片"
                  title="放大"
                  className={CONTROL_CLASS}
                  disabled={scale >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                  onClick={() => changeZoom("in")}
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
