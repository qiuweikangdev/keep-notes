type OutlineNavigator = (blockId: string) => boolean;

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

  if (!navigator(pendingBlockId)) return false;

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
  const navigator = outlineNavigators.get(key);
  if (!navigator) {
    pendingOutlineNavigations.set(key, blockId);
    schedulePendingOutlineNavigationRetry(key);
    return false;
  }

  if (!navigator(blockId)) {
    pendingOutlineNavigations.set(key, blockId);
    schedulePendingOutlineNavigationRetry(key);
    return false;
  }

  if (pendingOutlineNavigations.get(key) === blockId) {
    pendingOutlineNavigations.delete(key);
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
