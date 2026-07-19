interface EditorScrollHost {
  scrollTop: number;
}

interface EditorScrollContainer extends EditorScrollHost {
  getBoundingClientRect: () => Pick<DOMRect, "top">;
}

interface EditorScrollTarget {
  getBoundingClientRect: () => Pick<DOMRect, "top"> & {
    bottom?: number;
    height?: number;
  };
}

export interface EditorViewportAnchor {
  topCodeLine: number | null;
  topCodeLineOffset: number;
  topBlockId: string | null;
  topBlockOffset: number;
  topBlockRatio: number | null;
}

export interface EditorViewportSnapshot extends EditorViewportAnchor {
  scrollTop: number;
}

type FrameScheduler = (callback: () => void) => void;

interface StableEditorBlockScrollOptions {
  container: EditorScrollContainer;
  getTarget: () => EditorScrollTarget | null;
  getTargetOffset?: (target: EditorScrollTarget) => number;
  targetOffset?: number;
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
  preserveCurrentScroll?: boolean;
}

interface CapturedEditorViewportOptions {
  live: EditorViewportSnapshot;
  now: number;
  pending: EditorViewportSnapshot | null;
  suppressUntil: number;
}

const viewportPreservationVersions = new Map<string, number>();

function normalizeViewportPath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function requestEditorViewportPreservation(path: string): number {
  const normalizedPath = normalizeViewportPath(path);
  const version = (viewportPreservationVersions.get(normalizedPath) ?? 0) + 1;
  viewportPreservationVersions.set(normalizedPath, version);
  return version;
}

export function readEditorViewportPreservation(
  path: string | null,
): number | null {
  if (!path) return null;
  return viewportPreservationVersions.get(normalizeViewportPath(path)) ?? null;
}

export function completeEditorViewportPreservation(
  path: string | null,
  version: number,
): void {
  if (!path) return;
  const normalizedPath = normalizeViewportPath(path);
  if (viewportPreservationVersions.get(normalizedPath) === version) {
    viewportPreservationVersions.delete(normalizedPath);
  }
}

export function readEditorScrollTop(element: EditorScrollHost | null): number {
  if (!element || !Number.isFinite(element.scrollTop)) return 0;
  return Math.max(0, element.scrollTop);
}

export function chooseCapturedEditorViewport({
  live,
  now,
  pending,
  suppressUntil,
}: CapturedEditorViewportOptions): EditorViewportSnapshot {
  const source = pending && now <= suppressUntil ? pending : live;
  return { ...source };
}

export function chooseRestoredEditorScrollTop(
  options: RestoredScrollTopOptions,
): number {
  if (options.preserveCurrentScroll) {
    return Number.isFinite(options.currentScrollTop)
      ? Math.max(0, options.currentScrollTop)
      : 0;
  }
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
  targetOffset = 0,
): boolean {
  if (!container || !target) return false;

  const containerTop = container.getBoundingClientRect().top;
  const targetTop = target.getBoundingClientRect().top;
  const normalizedTargetOffset = Number.isFinite(targetOffset)
    ? targetOffset
    : 0;
  const nextScrollTop =
    container.scrollTop + targetTop - containerTop + normalizedTargetOffset;

  // 只移动编辑器自身滚动容器，避免 scrollIntoView 级联滚动外层布局。
  container.scrollTop = Number.isFinite(nextScrollTop)
    ? Math.max(0, nextScrollTop)
    : 0;
  return true;
}

function readEditorBlockHeight(
  bounds: ReturnType<EditorScrollTarget["getBoundingClientRect"]>,
): number | null {
  const height =
    bounds.height ??
    (typeof bounds.bottom === "number" ? bounds.bottom - bounds.top : NaN);
  return Number.isFinite(height) && height > 0 ? height : null;
}

export function resolveEditorViewportTargetOffset(
  target: EditorScrollTarget,
  anchor: EditorViewportAnchor,
): number {
  const height = readEditorBlockHeight(target.getBoundingClientRect());
  if (height === null || anchor.topBlockRatio === null) {
    return anchor.topBlockOffset;
  }

  const ratio = Math.min(Math.max(anchor.topBlockRatio, 0), 1);
  return height * ratio;
}

export function readEditorViewportAnchor<T extends EditorScrollTarget>(
  container: EditorScrollContainer | null,
  blocks: Iterable<T>,
  readBlockId: (block: T) => string | null,
): EditorViewportAnchor {
  if (!container) {
    return {
      topCodeLine: null,
      topCodeLineOffset: 0,
      topBlockId: null,
      topBlockOffset: 0,
      topBlockRatio: null,
    };
  }

  const containerTop = container.getBoundingClientRect().top;
  let lastAnchor: EditorViewportAnchor = {
    topCodeLine: null,
    topCodeLineOffset: 0,
    topBlockId: null,
    topBlockOffset: 0,
    topBlockRatio: null,
  };
  for (const block of blocks) {
    const blockId = readBlockId(block);
    if (!blockId) continue;

    const bounds = block.getBoundingClientRect();
    const topBlockOffset = containerTop - bounds.top;
    const height = readEditorBlockHeight(bounds);
    const anchor = {
      topCodeLine: null,
      topCodeLineOffset: 0,
      topBlockId: blockId,
      topBlockOffset,
      topBlockRatio:
        height === null
          ? null
          : Math.min(Math.max(topBlockOffset / height, 0), 1),
    };
    lastAnchor = anchor;
    if ((bounds.bottom ?? bounds.top) > containerTop) return anchor;
  }

  return lastAnchor;
}

export function scheduleStableEditorBlockScroll({
  container,
  getTarget,
  getTargetOffset,
  targetOffset = 0,
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
    const previousScrollTop = container.scrollTop;
    const target = getTarget();
    const didScroll = scrollEditorBlockIntoView(
      container,
      target,
      target && getTargetOffset ? getTargetOffset(target) : targetOffset,
    );
    const adjustment = Math.abs(container.scrollTop - previousScrollTop);
    // 嵌入式编辑器会跨帧更新高度；只有连续两帧无需校正，才能认为 viewport 真正稳定。
    stableFrames = didScroll && adjustment < 1 ? stableFrames + 1 : 0;

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
