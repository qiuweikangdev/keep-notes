import {
  useCallback,
  useRef,
  type PointerEventHandler,
  type RefObject,
} from "react";

interface DialogPosition {
  left: number;
  top: number;
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

function captureInlinePosition(target: HTMLElement): DialogPosition | null {
  const left = target.style.getPropertyValue("left");
  const top = target.style.getPropertyValue("top");
  if (!left || !top) return null;
  const leftNum = Number.parseFloat(left);
  const topNum = Number.parseFloat(top);
  if (Number.isNaN(leftNum) || Number.isNaN(topNum)) return null;
  return { left: leftNum, top: topNum };
}

function applyPosition(target: HTMLElement, position: DialogPosition) {
  target.style.setProperty("left", `${position.left}px`, "important");
  target.style.setProperty("top", `${position.top}px`, "important");
  target.style.setProperty("transform", "none", "important");
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
    // 清空 inline 定位，让 dialog 回到 CSS class 居中（left-[50%] top-[50%] translate(-50%,-50%)）。
    target.style.removeProperty("left");
    target.style.removeProperty("top");
    target.style.removeProperty("transform");
  }, []);

  const handlePointerDown = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      if (event.button !== 0 || !contentRef.current) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const target = contentRef.current;

      // 复用 resize 留下的 inline 位置；否则按当前可见位置初始化。
      const inline = captureInlinePosition(target);
      if (inline) {
        positionRef.current = inline;
      } else {
        const rect = target.getBoundingClientRect();
        positionRef.current = { left: rect.left, top: rect.top };
        applyPosition(target, positionRef.current);
      }

      const rect = target.getBoundingClientRect();
      dragSessionRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startPosition: { ...positionRef.current },
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
      const width = session.rect.width;
      const height = session.rect.height;
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
      positionRef.current = { left: nextLeft, top: nextTop };
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
