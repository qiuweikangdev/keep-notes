import {
  useCallback,
  useRef,
  type PointerEventHandler,
  type RefObject,
} from "react";

interface DialogOffset {
  x: number;
  y: number;
}

interface DragSession {
  pointerId: number;
  startX: number;
  startY: number;
  startOffset: DialogOffset;
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
  return Math.min(Math.max(value, minimum), maximum);
}

function createTransform(offset: DialogOffset): string {
  return `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`;
}

export function useDraggableDialog(): DraggableDialogResult {
  const contentRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef<DialogOffset>({ x: 0, y: 0 });
  const dragSessionRef = useRef<DragSession | null>(null);

  const applyOffset = useCallback((offset: DialogOffset) => {
    offsetRef.current = offset;
    if (contentRef.current) {
      contentRef.current.style.transform = createTransform(offset);
    }
  }, []);

  const resetPosition = useCallback(() => {
    dragSessionRef.current = null;
    applyOffset({ x: 0, y: 0 });
  }, [applyOffset]);

  const handlePointerDown = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      if (event.button !== 0 || !contentRef.current) return;

      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragSessionRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startOffset: offsetRef.current,
        rect: contentRef.current.getBoundingClientRect(),
      };
    },
    [],
  );

  const handlePointerMove = useCallback<PointerEventHandler<HTMLElement>>(
    (event) => {
      const session = dragSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) return;

      // 以拖动开始时的实际边界计算偏移，保证弹窗始终留在当前视口内。
      const deltaX = clamp(
        event.clientX - session.startX,
        -session.rect.left,
        window.innerWidth - session.rect.right,
      );
      const deltaY = clamp(
        event.clientY - session.startY,
        -session.rect.top,
        window.innerHeight - session.rect.bottom,
      );
      applyOffset({
        x: session.startOffset.x + deltaX,
        y: session.startOffset.y + deltaY,
      });
    },
    [applyOffset],
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
