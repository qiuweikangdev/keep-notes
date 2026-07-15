import type {
  ResizableDialogResult,
  ResizeDirection,
} from "@/hooks/use-resizable-dialog";

interface DialogResizeHandlesProps {
  resizeHandleProps: ResizableDialogResult["resizeHandleProps"];
}

const HANDLE_CLASSES: Record<ResizeDirection, string> = {
  n: "left-0 top-0 h-3 w-full cursor-n-resize",
  s: "bottom-0 left-0 h-3 w-full cursor-s-resize",
  e: "right-0 top-0 h-full w-3 cursor-e-resize",
  w: "left-0 top-0 h-full w-3 cursor-w-resize",
  ne: "right-0 top-0 h-3 w-3 cursor-ne-resize",
  nw: "left-0 top-0 h-3 w-3 cursor-nw-resize",
  se: "bottom-0 right-0 h-3 w-3 cursor-se-resize",
  sw: "bottom-0 left-0 h-3 w-3 cursor-sw-resize",
};

const DIRECTIONS = Object.keys(HANDLE_CLASSES) as ResizeDirection[];

export function DialogResizeHandles({
  resizeHandleProps,
}: DialogResizeHandlesProps) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-30">
      {DIRECTIONS.map((direction) => (
        <div
          key={direction}
          data-dialog-resize-handle={direction}
          className={`pointer-events-auto absolute ${HANDLE_CLASSES[direction]}`}
          {...resizeHandleProps[direction]}
        />
      ))}
    </div>
  );
}
