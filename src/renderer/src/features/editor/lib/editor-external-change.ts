export function shouldApplyExternalFileChange(
  currentContent: string,
  incomingContent: string,
): boolean {
  return currentContent !== incomingContent;
}
