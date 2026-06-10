import {
  useCallback,
  useRef,
  type PointerEventHandler,
  type RefObject,
} from "react";

interface DialogPosition {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface DragSession {
  pointerId: number;
  startX: number;
  startY: number;
  startPosition: DialogPosition;
  rect: DOMRect;
}

interface DraggableDialogResult {
  contentRef: RefObject<HTMLDivElement | null>;
  dragHandleProps: {
    onPointerDown: PointerEventHandler<HTMLElement>;
    onPointerMove: PointerEventHandler<HTMLElement>;
    onPointerUp: PointerEventHandler<HTMLElement>;
    onPointerCancel: PointerEventHandler<HTMLElement>;
  };
  resetPosition: () => void;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum < minimum) return minimum;
  return Math.min(Math.max(value, minimum), maximum);
}

function applyPosition(target: HTMLElement, position: DialogPosition) {
  target.style.left = `${position.left}px`;
  target.style.top = `${position.top}px`;
  target.style.width = `${position.width}px`;
  target.style.height = `${position.height}px`;
  target.style.transform = "none";
}

function captureCurrent(target: HTMLElement): DialogPosition {
  const rect = target.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

export function useDraggableDialog(): DraggableDialogResult {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const positionRef = useRef<DialogPosition | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);

  const resetPosition = useCallback(() => {
    dragSessionRef.current = null;
    positionRef.current = null;
    const target = contentRef.current;
    if (!target) return;
    // 清空所有内联位置/尺寸，让 dialog 回到 CSS class 居中（left-[50%] top-[50%] translate(-50%,-50%)）。
    target.style.width = "";
    target.style.height = "";
    target.style.left = "";
    target.style.top = "";
    target.style.transform = "";
  }, []);

  const handlePointerDown = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      if (event.button !== 0 || !contentRef.current) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const target = contentRef.current;
      // 首次拖动时把 CSS 居中"固化"为 inline 坐标，后续仅修改 inline 值。
      if (!positionRef.current) {
        positionRef.current = captureCurrent(target);
        applyPosition(target, positionRef.current);
      }
      const rect = target.getBoundingClientRect();
      dragSessionRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startPosition: {
          ...positionRef.current,
          width: rect.width,
          height: rect.height,
        },
        rect,
      };
    },
    [],
  );

  const handlePointerMove = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;
      if (!contentRef.current || !positionRef.current) return;
      const deltaX = event.clientX - session.startX;
      const deltaY = event.clientY - session.startY;
      const width = session.startPosition.width;
      const height = session.startPosition.height;
      const nextLeft = clamp(
        session.startPosition.left + deltaX,
        8,
        window.innerWidth - width - 8,
      );
      const nextTop = clamp(
        session.startPosition.top + deltaY,
        8,
        window.innerHeight - height - 8,
      );
      positionRef.current = {
        left: nextLeft,
        top: nextTop,
        width,
        height,
      };
      applyPosition(contentRef.current, positionRef.current);
    },
    [],
  );

  const finishDrag = useCallback<PointerEventHandler<HTMLElement>>((event) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragSessionRef.current = null;
  }, []);

  return {
    contentRef,
    dragHandleProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: finishDrag,
      onPointerCancel: finishDrag,
    },
    resetPosition,
  };
}
