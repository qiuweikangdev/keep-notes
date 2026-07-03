interface EditorScrollHost {
  scrollTop: number;
}

interface EditorScrollContainer extends EditorScrollHost {
  getBoundingClientRect: () => Pick<DOMRect, "top">;
}

interface EditorScrollTarget {
  getBoundingClientRect: () => Pick<DOMRect, "top">;
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
}: RestoredScrollTopOptions): number {
  if (currentPath && currentPath === nextPath) {
    return Math.max(0, currentScrollTop);
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

export function scrollEditorBlockIntoView(
  container: EditorScrollContainer | null,
  target: EditorScrollTarget | null,
): boolean {
  if (!container || !target) return false;

  const containerTop = container.getBoundingClientRect().top;
  const targetTop = target.getBoundingClientRect().top;
  const nextScrollTop = container.scrollTop + targetTop - containerTop;

  // 只移动编辑器自身滚动容器，避免 scrollIntoView 级联滚动外层布局。
  container.scrollTop = Number.isFinite(nextScrollTop)
    ? Math.max(0, nextScrollTop)
    : 0;
  return true;
}

function scheduleNextFrame(callback: () => void): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
    return;
  }
  setTimeout(callback, 0);
}
