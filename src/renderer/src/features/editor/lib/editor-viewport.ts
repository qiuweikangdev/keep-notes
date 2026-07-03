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

interface StableEditorBlockScrollOptions {
  container: EditorScrollContainer;
  getTarget: () => EditorScrollTarget | null;
  schedule?: FrameScheduler;
  maxAttempts?: number;
  settleFrames?: number;
  shouldContinue?: () => boolean;
}

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

export function chooseRestoredEditorScrollTop(
  _options: RestoredScrollTopOptions,
): number {
  // 文件加载和刷新都从顶部开始，避免跨文件或历史会话恢复旧滚动位置。
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

export function scheduleStableEditorBlockScroll({
  container,
  getTarget,
  schedule = scheduleNextFrame,
  maxAttempts = 8,
  settleFrames = 2,
  shouldContinue,
}: StableEditorBlockScrollOptions): boolean {
  const safeMaxAttempts = Math.max(1, maxAttempts);
  const safeSettleFrames = Math.max(1, settleFrames);
  let attempts = 0;
  let stableFrames = 0;

  const align = (): boolean => {
    if (shouldContinue && !shouldContinue()) return true;

    attempts += 1;
    const didScroll = scrollEditorBlockIntoView(container, getTarget());
    stableFrames = didScroll ? stableFrames + 1 : 0;

    if (attempts < safeMaxAttempts && stableFrames < safeSettleFrames) {
      schedule(align);
    }

    return didScroll;
  };

  return align();
}

function scheduleNextFrame(callback: () => void): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(callback);
    return;
  }
  setTimeout(callback, 0);
}
