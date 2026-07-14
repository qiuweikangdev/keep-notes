import type { EditorTab } from "@/store/editor.store";
import { normalizeRichDocumentPath } from "./rich-document-surface-registry";

const UNTITLED_DOCUMENT_PREFIX = "keep-notes-untitled://";

type EditorDocumentIdentity = Pick<EditorTab, "filePath" | "id">;

/**
 * 富文本会话需要稳定身份；未命名标签使用仅存在于渲染进程的虚拟路径。
 */
export function getEditorDocumentPath(tab: EditorDocumentIdentity): string {
  return tab.filePath ?? `${UNTITLED_DOCUMENT_PREFIX}${tab.id}`;
}

export function isUntitledDocumentPath(path: string): boolean {
  return normalizeRichDocumentPath(path).startsWith(UNTITLED_DOCUMENT_PREFIX);
}

export function matchesEditorDocumentPath(
  tab: EditorDocumentIdentity,
  path: string,
): boolean {
  return (
    normalizeRichDocumentPath(getEditorDocumentPath(tab)) ===
    normalizeRichDocumentPath(path)
  );
}
