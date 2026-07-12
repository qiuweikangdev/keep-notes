export const EDITOR_PERFORMANCE_OPERATIONS = [
  "editor:split-to-paint",
  "editor:pane-activate",
  "editor:transaction",
  "editor:preview-frame",
  "editor:resize-frame",
] as const;

export type EditorPerformanceOperation =
  (typeof EDITOR_PERFORMANCE_OPERATIONS)[number];

export interface EditorPerformanceContextInput {
  documentLength?: unknown;
  visiblePaneCount?: unknown;
  mountedPreviewBlockCount?: unknown;
  operation?: unknown;
  [key: string]: unknown;
}

export interface EditorPerformanceContext {
  documentLength: number;
  visiblePaneCount: number;
  mountedPreviewBlockCount: number;
  operation?: EditorPerformanceOperation;
}

export type EditorPerformanceSpanToken = number;
export type EditorSplitPaintToken = number;

export type EditorOperationMeasure = <T>(
  operation: EditorPerformanceOperation,
  callback: () => T,
  shouldRecord?: (value: Awaited<T>) => boolean,
) => T;

interface EditorPerformanceSpan {
  endTime: number | null;
  operation: EditorPerformanceOperation;
  startTime: number;
  token: EditorPerformanceSpanToken;
}

interface EditorPerformanceSpanRegistryOptions {
  maxSpans?: number;
}

export class EditorPerformanceSpanRegistry {
  private readonly maxSpans: number;
  private nextToken = 0;
  private readonly spans = new Map<
    EditorPerformanceSpanToken,
    EditorPerformanceSpan
  >();

  constructor(options: EditorPerformanceSpanRegistryOptions = {}) {
    this.maxSpans = Math.max(1, Math.floor(options.maxSpans ?? 64));
  }

  get size(): number {
    return this.spans.size;
  }

  begin(
    operation: EditorPerformanceOperation,
    startTime: number,
  ): EditorPerformanceSpanToken {
    while (this.spans.size >= this.maxSpans) {
      const oldestToken = this.spans.keys().next().value;
      if (typeof oldestToken !== "number") break;
      this.spans.delete(oldestToken);
    }
    this.nextToken += 1;
    const token = this.nextToken;
    this.spans.set(token, {
      endTime: null,
      operation,
      startTime: normalizeTime(startTime),
      token,
    });
    return token;
  }

  finish(token: EditorPerformanceSpanToken, endTime: number): void {
    const span = this.spans.get(token);
    if (!span) return;
    span.endTime = Math.max(span.startTime, normalizeTime(endTime));
  }

  abort(token: EditorPerformanceSpanToken): void {
    this.spans.delete(token);
  }

  match(
    startTime: number,
    duration: number,
  ): EditorPerformanceOperation | null {
    const entryStart = normalizeTime(startTime);
    const entryEnd = entryStart + Math.max(0, normalizeTime(duration));
    let best: EditorPerformanceSpan | null = null;
    let bestOverlap = 0;

    for (const span of this.spans.values()) {
      const spanEnd = span.endTime ?? Number.POSITIVE_INFINITY;
      const overlap =
        Math.min(entryEnd, spanEnd) - Math.max(entryStart, span.startTime);
      if (
        overlap > bestOverlap ||
        (overlap === bestOverlap &&
          overlap > 0 &&
          span.startTime > (best?.startTime ?? Number.NEGATIVE_INFINITY))
      ) {
        best = span;
        bestOverlap = overlap;
      }
    }

    return bestOverlap > 0 ? (best?.operation ?? null) : null;
  }
}

function isEditorPerformanceOperation(
  operation: unknown,
): operation is EditorPerformanceOperation {
  return (
    typeof operation === "string" &&
    EDITOR_PERFORMANCE_OPERATIONS.includes(
      operation as EditorPerformanceOperation,
    )
  );
}

function normalizeCounter(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function normalizeTime(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function createEditorPerformanceContext(
  input: EditorPerformanceContextInput,
): EditorPerformanceContext {
  const context: EditorPerformanceContext = {
    documentLength: normalizeCounter(input.documentLength),
    visiblePaneCount: normalizeCounter(input.visiblePaneCount),
    mountedPreviewBlockCount: normalizeCounter(input.mountedPreviewBlockCount),
  };
  if (isEditorPerformanceOperation(input.operation)) {
    context.operation = input.operation;
  }
  return context;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

const editorPerformanceSpans = import.meta.env.DEV
  ? new EditorPerformanceSpanRegistry()
  : null;
let nextMeasurementId = 0;

export function measureEditorOperation<T>(
  operation: EditorPerformanceOperation,
  callback: () => T,
  shouldRecord?: (value: Awaited<T>) => boolean,
): T {
  if (!import.meta.env.DEV || !isEditorPerformanceOperation(operation)) {
    return callback();
  }

  const performanceApi = globalThis.performance;
  if (
    typeof performanceApi?.mark !== "function" ||
    typeof performanceApi.measure !== "function"
  ) {
    return callback();
  }

  nextMeasurementId += 1;
  const measurementId = `${operation}:${nextMeasurementId}`;
  const startMark = `${measurementId}:start`;
  const endMark = `${measurementId}:end`;
  try {
    performanceApi.mark(startMark);
  } catch {
    return callback();
  }

  const spanToken = editorPerformanceSpans!.begin(
    operation,
    performanceApi.now(),
  );
  let finished = false;
  const finish = (record: boolean) => {
    if (finished) return;
    finished = true;
    if (!record) {
      editorPerformanceSpans!.abort(spanToken);
      try {
        performanceApi.clearMarks?.(startMark);
      } catch {
        // 放弃样本的清理失败不得影响编辑器交互。
      }
      return;
    }

    try {
      performanceApi.mark(endMark);
      performanceApi.measure(operation, startMark, endMark);
    } catch {
      // 诊断 API 不可用时不得影响编辑器交互。
    } finally {
      editorPerformanceSpans!.finish(spanToken, performanceApi.now());
      try {
        performanceApi.clearMarks?.(startMark);
        performanceApi.clearMarks?.(endMark);
      } catch {
        // 清理失败同样只影响诊断，不中断业务回调。
      }
    }
  };

  try {
    const result = callback();
    if (isPromiseLike(result)) {
      return Promise.resolve(result).then(
        (value) => {
          finish(shouldRecord ? shouldRecord(value as Awaited<T>) : true);
          return value;
        },
        (error: unknown) => {
          finish(true);
          throw error;
        },
      ) as T;
    }
    finish(shouldRecord ? shouldRecord(result as Awaited<T>) : true);
    return result;
  } catch (error) {
    finish(true);
    throw error;
  }
}

interface ObserveEditorLongTasksOptions {
  spans?: EditorPerformanceSpanRegistry;
}

export function observeEditorLongTasks(
  contextProvider: () => EditorPerformanceContextInput,
  options: ObserveEditorLongTasksOptions = {},
): () => void {
  if (!import.meta.env.DEV || typeof PerformanceObserver === "undefined") {
    return () => {};
  }
  if (
    Array.isArray(PerformanceObserver.supportedEntryTypes) &&
    !PerformanceObserver.supportedEntryTypes.includes("longtask")
  ) {
    return () => {};
  }

  const spans = options.spans ?? editorPerformanceSpans!;
  let observer: PerformanceObserver;
  try {
    observer = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.duration < 50) continue;
        const operation = spans.match(entry.startTime, entry.duration);
        if (!operation) continue;
        try {
          const context = createEditorPerformanceContext({
            ...contextProvider(),
            operation,
          });
          console.debug("[editor-performance] longtask", context);
        } catch {
          // Context 提供器只服务于诊断，不允许破坏主线程。
        }
      }
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch {
    try {
      observer?.disconnect();
    } catch {
      // 某些 Chromium 版本会在不支持 entry type 时同时拒绝断开。
    }
    return () => {};
  }

  return () => {
    try {
      observer.disconnect();
    } catch {
      // 卸载阶段不向上抛出诊断异常。
    }
  };
}

interface EditorFrameCoordinatorOptions {
  cancelFrame?: (handle: number) => void;
  measure?: EditorOperationMeasure;
  scheduleFrame?: (callback: FrameRequestCallback) => number;
}

interface PendingSplitPaint {
  commitGeneration: number;
  finish: () => void;
  frameHandle: number | null;
  paneId: string | null;
  token: EditorSplitPaintToken;
}

interface EditorSplitPaintCoordinatorOptions extends EditorFrameCoordinatorOptions {
  defer?: (callback: () => void) => void;
}

export class EditorSplitPaintCoordinator {
  private readonly byPane = new Map<string, EditorSplitPaintToken>();
  private readonly cancelFrame: (handle: number) => void;
  private readonly defer: (callback: () => void) => void;
  private readonly measure: EditorOperationMeasure;
  private nextToken = 0;
  private readonly pending = new Map<
    EditorSplitPaintToken,
    PendingSplitPaint
  >();
  private readonly scheduleFrame: (callback: FrameRequestCallback) => number;

  constructor(options: EditorSplitPaintCoordinatorOptions = {}) {
    this.cancelFrame =
      options.cancelFrame ?? ((handle) => window.cancelAnimationFrame(handle));
    this.defer = options.defer ?? ((callback) => queueMicrotask(callback));
    this.measure = options.measure ?? measureEditorOperation;
    this.scheduleFrame =
      options.scheduleFrame ??
      ((callback) => window.requestAnimationFrame(callback));
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  begin(): EditorSplitPaintToken {
    this.nextToken += 1;
    const token = this.nextToken;
    let finish!: () => void;
    const completion = new Promise<void>((resolve) => {
      finish = resolve;
    });
    this.pending.set(token, {
      commitGeneration: 0,
      finish,
      frameHandle: null,
      paneId: null,
      token,
    });
    void this.measure("editor:split-to-paint", () => completion);
    return token;
  }

  bindPane(token: EditorSplitPaintToken, paneId: string): boolean {
    const pending = this.pending.get(token);
    if (!pending) return false;
    const previousToken = this.byPane.get(paneId);
    if (previousToken !== undefined && previousToken !== token) {
      this.cancel(previousToken);
    }
    if (pending.paneId) this.byPane.delete(pending.paneId);
    pending.paneId = paneId;
    this.byPane.set(paneId, token);
    return true;
  }

  commitPane(paneId: string): () => void {
    const token = this.byPane.get(paneId);
    const pending = token === undefined ? null : this.pending.get(token);
    if (!pending) return () => {};

    pending.commitGeneration += 1;
    const commitGeneration = pending.commitGeneration;
    if (pending.frameHandle === null) {
      pending.frameHandle = this.scheduleFrame(() => {
        const current = this.pending.get(token);
        if (!current) return;
        // 第一帧让已提交的预览真正绘制，第二帧再结束 action-to-paint 样本。
        current.frameHandle = this.scheduleFrame(() => this.complete(token));
      });
    }

    return () => {
      this.defer(() => {
        const current = this.pending.get(token);
        if (current?.commitGeneration === commitGeneration) {
          this.cancel(token);
        }
      });
    };
  }

  cancel(token: EditorSplitPaintToken): void {
    const pending = this.pending.get(token);
    if (!pending) return;
    if (pending.frameHandle !== null) {
      this.cancelFrame(pending.frameHandle);
    }
    this.release(pending);
  }

  private complete(token: EditorSplitPaintToken): void {
    const pending = this.pending.get(token);
    if (!pending) return;
    pending.frameHandle = null;
    this.release(pending);
  }

  private release(pending: PendingSplitPaint): void {
    this.pending.delete(pending.token);
    if (pending.paneId && this.byPane.get(pending.paneId) === pending.token) {
      this.byPane.delete(pending.paneId);
    }
    pending.finish();
  }
}

export class EditorResizeFrameCoordinator {
  private readonly cancelFrame: (handle: number) => void;
  private readonly measure: EditorOperationMeasure;
  private pending: { finish: () => void; handle: number } | null = null;
  private readonly scheduleFrame: (callback: FrameRequestCallback) => number;

  constructor(options: EditorFrameCoordinatorOptions = {}) {
    this.cancelFrame =
      options.cancelFrame ?? ((handle) => window.cancelAnimationFrame(handle));
    this.measure = options.measure ?? measureEditorOperation;
    this.scheduleFrame =
      options.scheduleFrame ??
      ((callback) => window.requestAnimationFrame(callback));
  }

  readonly handleLayout = (): void => {
    if (this.pending) return;
    let finish!: () => void;
    const completion = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const handle = this.scheduleFrame(() => {
      if (this.pending?.handle !== handle) return;
      this.pending = null;
      finish();
    });
    this.pending = { finish, handle };
    void this.measure("editor:resize-frame", () => completion);
  };

  cancel(): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    this.cancelFrame(pending.handle);
    pending.finish();
  }
}

export const editorSplitPaintCoordinator = import.meta.env.DEV
  ? new EditorSplitPaintCoordinator()
  : undefined;
export const editorResizeFrameCoordinator = import.meta.env.DEV
  ? new EditorResizeFrameCoordinator()
  : undefined;
