export function normalizeDiffContent(content: string): string {
  // 差异比较只关心文本内容，先统一平台换行符，避免 CRLF/LF 被渲染成整文件改动。
  return content.replace(/\r\n?/g, "\n");
}

export function areDiffContentsEqual(
  oldContent: string,
  newContent: string,
): boolean {
  return normalizeDiffContent(oldContent) === normalizeDiffContent(newContent);
}
