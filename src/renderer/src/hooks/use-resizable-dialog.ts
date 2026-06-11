import {
  useCallback,
  useRef,
  type PointerEventHandler,
  type RefObject,
} from "react";
import { useDragResize } from "@/components/drag-resize-provider";

// 调整方向的 8 个方位：四角 + 四边。
export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

interface ResizeGeometry {
  width: number;
  height: number;
  left: number;
  top: number;
}

interface ResizeSession {
  pointerId: number;
  direction: ResizeDirection;
  startX: number;
  startY: number;
  startRect: ResizeGeometry;
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

const MIN_WIDTH = 480;
const MIN_HEIGHT = 280;
const VIEWPORT_MARGIN = 16;

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum < minimum) return minimum;
  return Math.min(Math.max(value, minimum), maximum);
}

function captureGeometry(target: HTMLElement): ResizeGeometry {
  const rect = target.getBoundingClientRect();
  return {
    width: rect.width,
    height: rect.height,
    left: rect.left,
    top: rect.top,
  };
}

function applyGeometry(target: HTMLElement, next: ResizeGeometry) {
  target.style.setProperty("width", `${next.width}px`, "important");
  target.style.setProperty("height", `${next.height}px`, "important");
  target.style.setProperty("left", `${next.left}px`, "important");
  target.style.setProperty("top", `${next.top}px`, "important");
  target.style.setProperty("transform", "none", "important");
}

function clearGeometry(target: HTMLElement) {
  target.style.removeProperty("width");
  target.style.removeProperty("height");
  target.style.removeProperty("left");
  target.style.removeProperty("top");
  target.style.removeProperty("transform");
}

function computeNext(
  direction: ResizeDirection,
  start: ResizeGeometry,
  deltaX: number,
  deltaY: number,
): ResizeGeometry {
  const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
  const maxHeight = Math.max(
    MIN_HEIGHT,
    window.innerHeight - VIEWPORT_MARGIN * 2,
  );

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
    const minDeltaW = start.width - maxWidth;
    const maxDeltaW = start.width - MIN_WIDTH;
    const dx = clamp(deltaX, minDeltaW, maxDeltaW);
    width = start.width - dx;
    left = start.left + dx;
  }
  if (direction.includes("n")) {
    const minDeltaH = start.height - maxHeight;
    const maxDeltaH = start.height - MIN_HEIGHT;
    const dy = clamp(deltaY, minDeltaH, maxDeltaH);
    height = start.height - dy;
    top = start.top + dy;
  }

  // 视口边界保护。
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
  const { startResize, endResize } = useDragResize();

  const sessionRef = useRef<ResizeSession | null>(null);
  const handlersRef = useRef<ResizableDialogResult["resizeHandleProps"]>(
    {} as never,
  );

  const getHandlers = (direction: ResizeDirection) => {
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
        startRect: captureGeometry(contentRef.current),
      };
      startResize();
    };

    const onPointerMove: PointerEventHandler<HTMLElement> = (event) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      if (!contentRef.current) return;
      const next = computeNext(
        session.direction,
        session.startRect,
        event.clientX - session.startX,
        event.clientY - session.startY,
      );
      applyGeometry(contentRef.current, next);
    };

    const finish: PointerEventHandler<HTMLElement> = (event) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      sessionRef.current = null;
      endResize();
    };

    const handlers = {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    };
    handlersRef.current[direction] = handlers;
    return handlers;
  };

  const resetSize = useCallback(() => {
    sessionRef.current = null;
    const target = contentRef.current;
    if (!target) return;
    clearGeometry(target);
  }, []);

  const resizeHandleProps: ResizableDialogResult["resizeHandleProps"] = {
    n: getHandlers("n"),
    s: getHandlers("s"),
    e: getHandlers("e"),
    w: getHandlers("w"),
    ne: getHandlers("ne"),
    nw: getHandlers("nw"),
    se: getHandlers("se"),
    sw: getHandlers("sw"),
  };

  return { contentRef, resizeHandleProps, resetSize };
}
