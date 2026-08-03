export const LARGE_DOCUMENT_CHAR_LIMIT = 10000;
export const LARGE_DOCUMENT_SERIALIZATION_QUIET_PERIOD_MS = 800;

export interface EditorIdleSchedulerEnvironment {
  setTimeout: typeof window.setTimeout;
  clearTimeout: typeof window.clearTimeout;
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
}

export function isLargeEditorDocument(content: string): boolean {
  return content.length >= LARGE_DOCUMENT_CHAR_LIMIT;
}

export function getEditorSerializationQuietPeriod(content: string): number {
  return isLargeEditorDocument(content)
    ? LARGE_DOCUMENT_SERIALIZATION_QUIET_PERIOD_MS
    : 0;
}

export function scheduleEditorIdleTask(
  callback: () => void,
  timeout = 1200,
  quietPeriodMs = 0,
  environment: EditorIdleSchedulerEnvironment = window,
): () => void {
  let delayHandle: number | null = null;
  let idleHandle: number | null = null;
  let canceled = false;

  const run = () => {
    if (canceled) return;
    delayHandle = null;
    idleHandle = null;
    callback();
  };

  const requestIdleWork = () => {
    delayHandle = null;
    if (canceled) return;

    if (typeof environment.requestIdleCallback === "function") {
      idleHandle = environment.requestIdleCallback(run, { timeout });
      return;
    }

    delayHandle = environment.setTimeout(run, timeout);
  };

  // 安静期只负责防抖；到期后再进入浏览器空闲队列，避免抢占连续输入。
  if (quietPeriodMs > 0) {
    delayHandle = environment.setTimeout(requestIdleWork, quietPeriodMs);
  } else {
    requestIdleWork();
  }

  return () => {
    canceled = true;
    if (delayHandle !== null) environment.clearTimeout(delayHandle);
    if (idleHandle !== null) environment.cancelIdleCallback?.(idleHandle);
    delayHandle = null;
    idleHandle = null;
  };
}

export function shouldFlushRichEditorBeforeAction(content: string): boolean {
  return !isLargeEditorDocument(content);
}
