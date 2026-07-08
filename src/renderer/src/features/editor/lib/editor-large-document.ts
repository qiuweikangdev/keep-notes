export const LARGE_DOCUMENT_CHAR_LIMIT = 10000;

export function isLargeEditorDocument(content: string): boolean {
  return content.length >= LARGE_DOCUMENT_CHAR_LIMIT;
}

export function shouldFlushRichEditorBeforeAction(content: string): boolean {
  return !isLargeEditorDocument(content);
}
