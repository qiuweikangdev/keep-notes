export const EXTERNAL_FILE_CONFLICT_MESSAGE =
  "文件已被外部修改，已保留本地未保存内容；保存后将覆盖外部版本。";

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
