type OutlineNavigator = (blockId: string) => void;

const outlineNavigators = new Map<string, OutlineNavigator>();

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

  return () => {
    if (outlineNavigators.get(key) === navigator) {
      outlineNavigators.delete(key);
    }
  };
}

export function scrollEditorOutlineBlock(
  groupId: string,
  tabId: string,
  blockId: string,
): boolean {
  const navigator = outlineNavigators.get(outlineNavigatorKey(groupId, tabId));
  if (!navigator) return false;

  navigator(blockId);
  return true;
}
