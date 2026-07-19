import { useEffect, useRef } from "react";
import { useOverlayScrollbar } from "@/hooks/use-overlay-scrollbar";
import { OutlineHeadingItem } from "./outline-heading-item";

interface Heading {
  id: string;
  text: string;
  level: number;
}

interface OutlinePanelProps {
  headings: Heading[];
  activeHeadingId: string | null;
  resetKey: string | null;
  onHeadingClick: (id: string) => void;
}

export function OutlinePanel({
  headings,
  activeHeadingId,
  resetKey,
  onHeadingClick,
}: OutlinePanelProps) {
  const activeItemRef = useRef<HTMLButtonElement>(null);
  const {
    scrollContainerRef,
    scrollbarTrackRef,
    scrollbarThumbRef,
    syncScrollbarThumb,
    handleScrollbarTrackPointerDown,
    handleScrollbarThumbPointerDown,
    handleScrollbarThumbPointerMove,
    handleScrollbarThumbPointerEnd,
  } = useOverlayScrollbar(headings.length);

  // 打开或切换文件时，大纲列表始终从顶部开始，不复用上一个文件的滚动位置。
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
      syncScrollbarThumb();
    }
  }, [resetKey, scrollContainerRef, syncScrollbarThumb]);

  // 当活跃标题变化时，自动滚动到对应位置
  useEffect(() => {
    if (activeItemRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const item = activeItemRef.current;

      // 计算元素相对于容器的位置
      const containerRect = container.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();

      // 检查元素是否在可视区域内
      const isAbove = itemRect.top < containerRect.top;
      const isBelow = itemRect.bottom > containerRect.bottom;

      if (isAbove || isBelow) {
        // 平滑滚动到元素位置
        container.scrollTop +=
          itemRect.top -
          containerRect.top -
          container.clientHeight / 2 +
          item.clientHeight / 2;
        syncScrollbarThumb();
      }
    }
  }, [activeHeadingId, scrollContainerRef, syncScrollbarThumb]);

  return (
    <div className="flex h-full flex-col">
      <div className="file-tree-scroll-shell relative min-h-0 flex-1">
        <div
          ref={scrollContainerRef}
          className="file-tree-scroll-container h-full overflow-auto py-2"
          onScroll={syncScrollbarThumb}
        >
          {headings.length === 0 ? (
            <div
              className="px-3 py-2 text-[13px]"
              style={{ color: "var(--text-muted)" }}
            >
              暂无标题
            </div>
          ) : (
            headings.map((heading) => (
              <OutlineHeadingItem
                key={heading.id}
                id={heading.id}
                text={heading.text}
                level={heading.level}
                isActive={heading.id === activeHeadingId}
                onClick={onHeadingClick}
                ref={heading.id === activeHeadingId ? activeItemRef : undefined}
              />
            ))
          )}
        </div>
        <div
          ref={scrollbarTrackRef}
          aria-hidden="true"
          className="file-tree-scrollbar-track"
          onPointerDown={handleScrollbarTrackPointerDown}
        >
          <div
            ref={scrollbarThumbRef}
            className="file-tree-scrollbar-thumb"
            onPointerCancel={handleScrollbarThumbPointerEnd}
            onPointerDown={handleScrollbarThumbPointerDown}
            onPointerMove={handleScrollbarThumbPointerMove}
            onPointerUp={handleScrollbarThumbPointerEnd}
          />
        </div>
      </div>
    </div>
  );
}
