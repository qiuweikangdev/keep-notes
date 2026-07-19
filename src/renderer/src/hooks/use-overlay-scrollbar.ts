import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";

interface ScrollbarMetrics {
  maxThumbOffset: number;
  scrollableHeight: number;
  thumbHeight: number;
  thumbOffset: number;
}

export function useOverlayScrollbar(syncKey: unknown) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollbarTrackRef = useRef<HTMLDivElement>(null);
  const scrollbarThumbRef = useRef<HTMLDivElement>(null);
  const scrollbarDragStateRef = useRef<{
    pointerId: number;
    startThumbOffset: number;
    startY: number;
  } | null>(null);

  const getScrollbarMetrics = useCallback((): ScrollbarMetrics | null => {
    const container = scrollContainerRef.current;
    if (!container) return null;

    const { clientHeight, scrollHeight, scrollTop } = container;
    const scrollableHeight = scrollHeight - clientHeight;
    if (scrollableHeight <= 0) return null;

    const thumbHeight = Math.max(
      24,
      (clientHeight * clientHeight) / scrollHeight,
    );
    const maxThumbOffset = clientHeight - thumbHeight;
    const thumbOffset = (scrollTop / scrollableHeight) * maxThumbOffset;

    return { maxThumbOffset, scrollableHeight, thumbHeight, thumbOffset };
  }, []);

  const syncScrollbarThumb = useCallback(() => {
    const thumb = scrollbarThumbRef.current;
    const metrics = getScrollbarMetrics();
    if (!thumb) return;
    if (!metrics) {
      thumb.hidden = true;
      return;
    }

    // 直接同步覆盖式滑块，避免滚动时触发 React 重渲。
    thumb.hidden = false;
    thumb.style.height = `${metrics.thumbHeight}px`;
    thumb.style.transform = `translateY(${metrics.thumbOffset}px)`;
  }, [getScrollbarMetrics]);

  const scrollToThumbOffset = useCallback(
    (thumbOffset: number) => {
      const container = scrollContainerRef.current;
      const metrics = getScrollbarMetrics();
      if (!container || !metrics) return;

      const boundedOffset = Math.min(
        Math.max(0, thumbOffset),
        metrics.maxThumbOffset,
      );
      container.scrollTop =
        (boundedOffset / metrics.maxThumbOffset) * metrics.scrollableHeight;
      syncScrollbarThumb();
    },
    [getScrollbarMetrics, syncScrollbarThumb],
  );

  const handleScrollbarTrackPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const track = scrollbarTrackRef.current;
      const metrics = getScrollbarMetrics();
      if (!track || !metrics) return;

      const trackBounds = track.getBoundingClientRect();
      scrollToThumbOffset(
        event.clientY - trackBounds.top - metrics.thumbHeight / 2,
      );
    },
    [getScrollbarMetrics, scrollToThumbOffset],
  );

  const handleScrollbarThumbPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const metrics = getScrollbarMetrics();
      if (!metrics) return;

      event.preventDefault();
      event.stopPropagation();
      scrollbarDragStateRef.current = {
        pointerId: event.pointerId,
        startThumbOffset: metrics.thumbOffset,
        startY: event.clientY,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [getScrollbarMetrics],
  );

  const handleScrollbarThumbPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = scrollbarDragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;

      scrollToThumbOffset(
        dragState.startThumbOffset + event.clientY - dragState.startY,
      );
    },
    [scrollToThumbOffset],
  );

  const handleScrollbarThumbPointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (scrollbarDragStateRef.current?.pointerId !== event.pointerId) return;

      scrollbarDragStateRef.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    },
    [],
  );

  useEffect(() => {
    const frame = requestAnimationFrame(syncScrollbarThumb);
    return () => cancelAnimationFrame(frame);
  }, [syncKey, syncScrollbarThumb]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(syncScrollbarThumb);
    observer.observe(container);

    return () => observer.disconnect();
  }, [syncScrollbarThumb]);

  return {
    scrollContainerRef,
    scrollbarTrackRef,
    scrollbarThumbRef,
    syncScrollbarThumb,
    handleScrollbarTrackPointerDown,
    handleScrollbarThumbPointerDown,
    handleScrollbarThumbPointerMove,
    handleScrollbarThumbPointerEnd,
  };
}
