import {
  useCallback,
  useRef,
  type PointerEventHandler,
  type RefObject,
} from "react";

// 调整方向的 8 个方位：四角 + 四边。
export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface ResizeSize {
  width: number;
  height: number;
  // 调整左上/右上/左上/左下角时，记录相对视口的偏移，避免 resize 后位置漂移。
  left: number;
  top: number;
}

interface ResizeSession {
  pointerId: number;
  direction: ResizeDirection;
  startX: number;
  startY: number;
  startSize: ResizeSize;
}

interface ResizableDialogResult {
  contentRef: RefObject<HTMLDivElement | null>;
  resizeHandleProps: Record<
    ResizeDirection,
    {
      onPointerDown: PointerEventHandler<HTMLElement>;
      onPointerMove: PointerEventHandler<HTMLElement>;
      onPointerUp: PointerEventHandler<HTMLElement>;
      onPointerCancel: PointerEventHandler<HTMLElement>;
    }
  >;
  resetSize: () => void;
}

const MIN_WIDTH = 400;
const MIN_HEIGHT = 240;
const VIEWPORT_MARGIN = 20;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function getViewportLimits(): { maxWidth: number; maxHeight: number } {
  return {
    maxWidth: Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2),
    maxHeight: Math.max(MIN_HEIGHT, window.innerHeight - VIEWPORT_MARGIN * 2),
  };
}

function captureStartSize(rect: DOMRect): ResizeSize {
  return {
    width: rect.width,
    height: rect.height,
    left: rect.left,
    top: rect.top,
  };
}

function applySize(target: HTMLDivElement, next: ResizeSize) {
  target.style.width = `${next.width}px`;
  target.style.height = `${next.height}px`;
  target.style.left = `${next.left}px`;
  target.style.top = `${next.top}px`;
  // 取消居中位移，改为由 left/top 定位，避免与 transform: translate 冲突。
  target.style.transform = "none";
}

function computeNext(
  direction: ResizeDirection,
  start: ResizeSize,
  deltaX: number,
  deltaY: number,
): ResizeSize {
  const { maxWidth, maxHeight } = getViewportLimits();

  let width = start.width;
  let height = start.height;
  let left = start.left;
  let top = start.top;

  if (direction.includes("e")) {
    width = clamp(start.width + deltaX, MIN_WIDTH, maxWidth);
  }
  if (direction.includes("s")) {
    height = clamp(start.height + deltaY, MIN_HEIGHT, maxHeight);
  }
  if (direction.includes("w")) {
    const maxDeltaW = start.width - MIN_WIDTH;
    const minDeltaW = start.width - maxWidth;
    const clampedDelta = clamp(deltaX, minDeltaW, maxDeltaW);
    width = start.width - clampedDelta;
    left = start.left + clampedDelta;
  }
  if (direction.includes("n")) {
    const maxDeltaH = start.height - MIN_HEIGHT;
    const minDeltaH = start.height - maxHeight;
    const clampedDelta = clamp(deltaY, minDeltaH, maxDeltaH);
    height = start.height - clampedDelta;
    top = start.top + clampedDelta;
  }

  // 视口边界保护：左上角不能被推出视口。
  left = clamp(
    left,
    VIEWPORT_MARGIN,
    window.innerWidth - VIEWPORT_MARGIN - width,
  );
  top = clamp(
    top,
    VIEWPORT_MARGIN,
    window.innerHeight - VIEWPORT_MARGIN - height,
  );

  return { width, height, left, top };
}

export function useResizableDialog(): ResizableDialogResult {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<ResizeSession | null>(null);
  const handlersRef = useRef<
    Record<
      ResizeDirection,
      ResizableDialogResult["resizeHandleProps"][ResizeDirection]
    >
  >({} as never);

  const ensureHandlers = useCallback((direction: ResizeDirection) => {
    if (handlersRef.current[direction]) {
      return handlersRef.current[direction];
    }

    const onPointerDown: PointerEventHandler<HTMLElement> = (event) => {
      if (event.button !== 0 || !contentRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      sessionRef.current = {
        pointerId: event.pointerId,
        direction,
        startX: event.clientX,
        startY: event.clientY,
        startSize: captureStartSize(contentRef.current.getBoundingClientRect()),
      };
    };

    const onPointerMove: PointerEventHandler<HTMLElement> = (event) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      if (!contentRef.current) return;
      const next = computeNext(
        session.direction,
        session.startSize,
        event.clientX - session.startX,
        event.clientY - session.startY,
      );
      applySize(contentRef.current, next);
    };

    const finishResize: PointerEventHandler<HTMLElement> = (event) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      sessionRef.current = null;
    };

    const handlers = {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishResize,
      onPointerCancel: finishResize,
    };
    handlersRef.current[direction] = handlers;
    return handlers;
  }, []);

  const resizeHandleProps: ResizableDialogResult["resizeHandleProps"] = {
    n: ensureHandlers("n"),
    s: ensureHandlers("s"),
    e: ensureHandlers("e"),
    w: ensureHandlers("w"),
    ne: ensureHandlers("ne"),
    nw: ensureHandlers("nw"),
    se: ensureHandlers("se"),
    sw: ensureHandlers("sw"),
  };

  const resetSize = useCallback(() => {
    sessionRef.current = null;
    if (!contentRef.current) return;
    // 清空内联尺寸，恢复为父组件传入的类样式（h-[82vh] w-[92vw] 等）。
    contentRef.current.style.width = "";
    contentRef.current.style.height = "";
    contentRef.current.style.left = "";
    contentRef.current.style.top = "";
    contentRef.current.style.transform = "";
  }, []);

  return { contentRef, resizeHandleProps, resetSize };
}
