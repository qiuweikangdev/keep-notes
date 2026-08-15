export function shouldApplyExternalFileChange(
  currentContent: string,
  incomingContent: string,
): boolean {
  return currentContent !== incomingContent;
}

export function shouldDeferExternalFileChange(
  currentContent: string,
  incomingContent: string,
  isDirty: boolean,
): boolean {
  return (
    isDirty && shouldApplyExternalFileChange(currentContent, incomingContent)
  );
}
