import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
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

interface ViewportBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface ResizeSession {
  pointerId: number;
  direction: ResizeDirection;
  startX: number;
  startY: number;
  startRect: ResizeGeometry;
}

interface DragSession {
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  activated: boolean;
}

type PointerHandlers = {
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onPointerCancel: PointerEventHandler<HTMLElement>;
};

export interface ResizableDialogOptions {
  isOpen?: boolean;
  minWidth?: number;
  minHeight?: number;
  viewportMargin?: number;
  dragActivationDistance?: number;
}

export interface ResizableDialogResult {
  contentRef: RefObject<HTMLDivElement | null>;
  dragHandleProps: PointerHandlers;
  resizeHandleProps: Record<ResizeDirection, PointerHandlers>;
  resetGeometry: () => void;
  resetSize: () => void;
}

const RESIZE_DIRECTIONS: ResizeDirection[] = [
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
];

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
  target.style.removeProperty("transition");
}

function getViewportBounds(margin: number): ViewportBounds {
  const horizontalMargin = window.innerWidth > margin * 2 ? margin : 0;
  const verticalMargin = window.innerHeight > margin * 2 ? margin : 0;

  return {
    left: horizontalMargin,
    top: verticalMargin,
    right: window.innerWidth - horizontalMargin,
    bottom: window.innerHeight - verticalMargin,
    width: Math.max(1, window.innerWidth - horizontalMargin * 2),
    height: Math.max(1, window.innerHeight - verticalMargin * 2),
  };
}

function constrainGeometry(
  geometry: ResizeGeometry,
  minWidth: number,
  minHeight: number,
  margin: number,
): ResizeGeometry {
  const bounds = getViewportBounds(margin);
  const width = clamp(
    geometry.width,
    Math.min(minWidth, bounds.width),
    bounds.width,
  );
  const height = clamp(
    geometry.height,
    Math.min(minHeight, bounds.height),
    bounds.height,
  );

  return {
    width,
    height,
    left: clamp(geometry.left, bounds.left, bounds.right - width),
    top: clamp(geometry.top, bounds.top, bounds.bottom - height),
  };
}

function computeResizeGeometry(
  direction: ResizeDirection,
  start: ResizeGeometry,
  deltaX: number,
  deltaY: number,
  minWidth: number,
  minHeight: number,
  margin: number,
): ResizeGeometry {
  const bounds = getViewportBounds(margin);
  const effectiveMinWidth = Math.min(minWidth, bounds.width);
  const effectiveMinHeight = Math.min(minHeight, bounds.height);
  const startRight = start.left + start.width;
  const startBottom = start.top + start.height;

  let left = start.left;
  let right = startRight;
  let top = start.top;
  let bottom = startBottom;

  if (direction.includes("e")) {
    right = clamp(
      startRight + deltaX,
      start.left + effectiveMinWidth,
      bounds.right,
    );
  }
  if (direction.includes("w")) {
    left = clamp(
      start.left + deltaX,
      bounds.left,
      startRight - effectiveMinWidth,
    );
  }
  if (direction.includes("s")) {
    bottom = clamp(
      startBottom + deltaY,
      start.top + effectiveMinHeight,
      bounds.bottom,
    );
  }
  if (direction.includes("n")) {
    top = clamp(
      start.top + deltaY,
      bounds.top,
      startBottom - effectiveMinHeight,
    );
  }

  return constrainGeometry(
    {
      width: right - left,
      height: bottom - top,
      left,
      top,
    },
    minWidth,
    minHeight,
    margin,
  );
}

export function useResizableDialog({
  isOpen = true,
  minWidth = 480,
  minHeight = 280,
  viewportMargin = 16,
  dragActivationDistance = 8,
}: ResizableDialogOptions = {}): ResizableDialogResult {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const resizeSessionRef = useRef<ResizeSession | null>(null);
  const { startDrag, endDrag, startResize, endResize } = useDragResize();

  const resetGeometry = useCallback(() => {
    if (dragSessionRef.current?.activated) endDrag();
    if (resizeSessionRef.current) endResize();
    dragSessionRef.current = null;
    resizeSessionRef.current = null;

    if (contentRef.current) clearGeometry(contentRef.current);
  }, [endDrag, endResize]);

  useLayoutEffect(() => {
    if (isOpen) resetGeometry();
  }, [isOpen, resetGeometry]);

  useEffect(() => {
    if (!isOpen) return;

    const handleViewportResize = () => {
      const target = contentRef.current;
      if (!target) return;
      applyGeometry(
        target,
        constrainGeometry(
          captureGeometry(target),
          minWidth,
          minHeight,
          viewportMargin,
        ),
      );
    };

    window.addEventListener("resize", handleViewportResize);
    return () => window.removeEventListener("resize", handleViewportResize);
  }, [isOpen, minHeight, minWidth, viewportMargin]);

  useEffect(() => {
    return () => {
      if (dragSessionRef.current?.activated) endDrag();
      if (resizeSessionRef.current) endResize();
    };
  }, [endDrag, endResize]);

  const dragHandleProps = useMemo<PointerHandlers>(() => {
    const onPointerDown: PointerEventHandler<HTMLElement> = (event) => {
      if (event.button !== 0 || !contentRef.current) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragSessionRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: 0,
        offsetY: 0,
        width: 0,
        height: 0,
        activated: false,
      };
    };

    const onPointerMove: PointerEventHandler<HTMLElement> = (event) => {
      const session = dragSessionRef.current;
      const target = contentRef.current;
      if (!session || session.pointerId !== event.pointerId || !target) return;

      if (!session.activated) {
        const deltaX = event.clientX - session.startX;
        const deltaY = event.clientY - session.startY;
        if (
          Math.abs(deltaX) < dragActivationDistance &&
          Math.abs(deltaY) < dragActivationDistance
        ) {
          return;
        }

        const rect = target.getBoundingClientRect();
        session.offsetX = event.clientX - rect.left;
        session.offsetY = event.clientY - rect.top;
        session.width = rect.width;
        session.height = rect.height;
        session.activated = true;
        target.style.setProperty("transition", "none", "important");
        target.style.setProperty("left", `${rect.left}px`, "important");
        target.style.setProperty("top", `${rect.top}px`, "important");
        target.style.setProperty("transform", "none", "important");
        startDrag();
        return;
      }

      applyGeometry(
        target,
        constrainGeometry(
          {
            width: session.width,
            height: session.height,
            left: event.clientX - session.offsetX,
            top: event.clientY - session.offsetY,
          },
          minWidth,
          minHeight,
          viewportMargin,
        ),
      );
    };

    const finish: PointerEventHandler<HTMLElement> = (event) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      dragSessionRef.current = null;
      if (session.activated) endDrag();
    };

    return {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
    };
  }, [
    dragActivationDistance,
    endDrag,
    minHeight,
    minWidth,
    startDrag,
    viewportMargin,
  ]);

  const resizeHandleProps = useMemo(() => {
    const handlers = {} as Record<ResizeDirection, PointerHandlers>;

    for (const direction of RESIZE_DIRECTIONS) {
      const onPointerDown: PointerEventHandler<HTMLElement> = (event) => {
        if (event.button !== 0 || !contentRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        contentRef.current.style.setProperty("transition", "none", "important");
        resizeSessionRef.current = {
          pointerId: event.pointerId,
          direction,
          startX: event.clientX,
          startY: event.clientY,
          startRect: captureGeometry(contentRef.current),
        };
        startResize();
      };

      const onPointerMove: PointerEventHandler<HTMLElement> = (event) => {
        const session = resizeSessionRef.current;
        const target = contentRef.current;
        if (!session || session.pointerId !== event.pointerId || !target)
          return;

        applyGeometry(
          target,
          computeResizeGeometry(
            session.direction,
            session.startRect,
            event.clientX - session.startX,
            event.clientY - session.startY,
            minWidth,
            minHeight,
            viewportMargin,
          ),
        );
      };

      const finish: PointerEventHandler<HTMLElement> = (event) => {
        const session = resizeSessionRef.current;
        if (!session || session.pointerId !== event.pointerId) return;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        resizeSessionRef.current = null;
        endResize();
      };

      handlers[direction] = {
        onPointerDown,
        onPointerMove,
        onPointerUp: finish,
        onPointerCancel: finish,
      };
    }

    return handlers;
  }, [endResize, minHeight, minWidth, startResize, viewportMargin]);

  return {
    contentRef,
    dragHandleProps,
    resizeHandleProps,
    resetGeometry,
    resetSize: resetGeometry,
  };
}
