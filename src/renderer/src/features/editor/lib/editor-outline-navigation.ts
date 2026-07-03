type OutlineNavigator = (blockId: string) => boolean;

const outlineNavigators = new Map<string, OutlineNavigator>();
const pendingOutlineNavigations = new Map<string, string>();

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
  flushPendingOutlineNavigation(key);

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
  return true;
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
    return false;
  }

  if (!navigator(blockId)) {
    pendingOutlineNavigations.set(key, blockId);
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
  return flushPendingOutlineNavigation(outlineNavigatorKey(groupId, tabId));
}
