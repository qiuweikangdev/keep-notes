interface EditorScrollHost {
  scrollTop: number;
}

type FrameScheduler = (callback: () => void) => void;

interface RestoredScrollTopOptions {
  currentPath: string | null;
  nextPath: string | null;
  currentScrollTop: number;
  cachedScrollTop: number | null | undefined;
}

export function readEditorScrollTop(element: EditorScrollHost | null): number {
  if (!element || !Number.isFinite(element.scrollTop)) return 0;
  return Math.max(0, element.scrollTop);
}

export function chooseRestoredEditorScrollTop({
  currentPath,
  nextPath,
  currentScrollTop,
  cachedScrollTop,
}: RestoredScrollTopOptions): number {
  if (currentPath && currentPath === nextPath) {
    return Math.max(0, currentScrollTop);
  }
  if (Number.isFinite(cachedScrollTop)) {
    return Math.max(0, cachedScrollTop ?? 0);
  }
  return 0;
}

export function restoreEditorScrollTop(
  element: EditorScrollHost | null,
  scrollTop: number,
  schedule: FrameScheduler = scheduleNextFrame,
): void {
  if (!element) return;
  const nextScrollTop = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0;
  schedule(() => {
    element.scrollTop = nextScrollTop;
  });
}

function scheduleNextFrame(callback: () => void): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
    return;
  }
  setTimeout(callback, 0);
}
