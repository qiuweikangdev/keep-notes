import type { UntitledCloseAction } from "@shared/types";

export interface UntitledCloseConfirmationRequest {
  temporaryTitle?: string;
}

interface PendingRequest extends UntitledCloseConfirmationRequest {
  resolve: (action: UntitledCloseAction) => void;
}

type RequestListener = (
  request: UntitledCloseConfirmationRequest | null,
) => void;

const listeners = new Set<RequestListener>();
let activeRequest: PendingRequest | null = null;
const queuedRequests: PendingRequest[] = [];

function notify(request: PendingRequest | null): void {
  const publicRequest = request
    ? { temporaryTitle: request.temporaryTitle }
    : null;
  listeners.forEach((listener) => listener(publicRequest));
}

function activateNextRequest(): void {
  const nextRequest = queuedRequests.shift() ?? null;
  activeRequest = nextRequest;
  notify(activeRequest);
}

export function hasUntitledCloseConfirmationListener(): boolean {
  return listeners.size > 0;
}

export function requestUntitledCloseConfirmation(
  temporaryTitle?: string,
): Promise<UntitledCloseAction> {
  return new Promise((resolve) => {
    const request: PendingRequest = { temporaryTitle, resolve };
    if (activeRequest) {
      queuedRequests.push(request);
      return;
    }

    activeRequest = request;
    notify(activeRequest);
  });
}

export function subscribeUntitledCloseConfirmation(
  listener: RequestListener,
): () => void {
  listeners.add(listener);
  if (activeRequest) {
    listener({ temporaryTitle: activeRequest.temporaryTitle });
  }

  return () => {
    listeners.delete(listener);
  };
}

export function completeUntitledCloseConfirmation(
  action: UntitledCloseAction,
): void {
  if (!activeRequest) return;

  const request = activeRequest;
  activeRequest = null;
  request.resolve(action);
  notify(null);

  if (queuedRequests.length > 0) {
    // 先让当前 Dialog 完成关闭，再展示排队中的下一条确认请求。
    queueMicrotask(activateNextRequest);
  }
}
