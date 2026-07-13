export type OutlineNavigationResult = boolean | "cancel";
interface OutlineNavigationContext {
  isRetry: boolean;
}
type OutlineNavigator = (
  blockId: string,
  context: OutlineNavigationContext,
) => OutlineNavigationResult;

const outlineNavigators = new Map<string, OutlineNavigator>();
const pendingOutlineNavigations = new Map<string, string>();
const pendingRetryTimers = new Map<string, ReturnType<typeof setTimeout>>();
const PENDING_NAVIGATION_RETRY_LIMIT = 120;
const PENDING_NAVIGATION_RETRY_DELAY_MS = 16;

function outlineNavigatorKey(groupId: string, tabId: string): string {
  return `${groupId}:${tabId}`;
}

export function registerEditorOutlineNavigator(
  groupId: string,
  tabId: string,
  navigator: OutlineNavigator,
): () => void {
  const key = outlineNavigatorKey(groupId, tabId);
  outlineNavigators.set(key, navigator);
  if (!flushPendingOutlineNavigation(key)) {
    schedulePendingOutlineNavigationRetry(key);
  }

  return () => {
    if (outlineNavigators.get(key) === navigator) {
      outlineNavigators.delete(key);
    }
  };
}

function flushPendingOutlineNavigation(key: string): boolean {
  const pendingBlockId = pendingOutlineNavigations.get(key);
  if (!pendingBlockId) return false;

  const navigator = outlineNavigators.get(key);
  if (!navigator) return false;

  const result = navigator(pendingBlockId, { isRetry: true });
  if (result === "cancel") {
    pendingOutlineNavigations.delete(key);
    clearPendingOutlineNavigationRetry(key);
    return true;
  }
  if (!result) return false;

  pendingOutlineNavigations.delete(key);
  clearPendingOutlineNavigationRetry(key);
  return true;
}

function clearPendingOutlineNavigationRetry(key: string): void {
  const timer = pendingRetryTimers.get(key);
  if (!timer) return;

  clearTimeout(timer);
  pendingRetryTimers.delete(key);
}

function schedulePendingOutlineNavigationRetry(key: string, attempt = 0): void {
  if (!pendingOutlineNavigations.has(key)) return;
  if (pendingRetryTimers.has(key)) return;
  if (attempt >= PENDING_NAVIGATION_RETRY_LIMIT) return;

  const timer = setTimeout(() => {
    pendingRetryTimers.delete(key);
    if (flushPendingOutlineNavigation(key)) return;
    schedulePendingOutlineNavigationRetry(key, attempt + 1);
  }, PENDING_NAVIGATION_RETRY_DELAY_MS);
  pendingRetryTimers.set(key, timer);
}

export function scrollEditorOutlineBlock(
  groupId: string,
  tabId: string,
  blockId: string,
): boolean {
  const key = outlineNavigatorKey(groupId, tabId);
  // 新的用户意图必须覆盖同一标签尚未完成的旧标题定位，旧 timer 不得稍后回放。
  pendingOutlineNavigations.delete(key);
  clearPendingOutlineNavigationRetry(key);
  const navigator = outlineNavigators.get(key);
  if (!navigator) {
    pendingOutlineNavigations.set(key, blockId);
    schedulePendingOutlineNavigationRetry(key);
    return false;
  }

  const result = navigator(blockId, { isRetry: false });
  if (result === "cancel") return false;
  if (!result) {
    pendingOutlineNavigations.set(key, blockId);
    schedulePendingOutlineNavigationRetry(key);
    return false;
  }

  return true;
}

export function flushPendingEditorOutlineNavigation(
  groupId: string,
  tabId: string,
): boolean {
  const key = outlineNavigatorKey(groupId, tabId);
  if (flushPendingOutlineNavigation(key)) return true;

  schedulePendingOutlineNavigationRetry(key);
  return false;
}
