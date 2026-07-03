import { useEffect, useRef } from "react";
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);

  // 打开或切换文件时，大纲列表始终从顶部开始，不复用上一个文件的滚动位置。
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [resetKey]);

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
      }
    }
  }, [activeHeadingId]);

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollContainerRef} className="flex-1 overflow-auto py-2">
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
    </div>
  );
}
