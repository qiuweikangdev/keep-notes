import type { EditorTab } from "@/store/editor.store";
import { normalizeRichDocumentPath } from "./rich-document-surface-registry";

const UNTITLED_DOCUMENT_PREFIX = "keep-notes-untitled://";

type EditorDocumentIdentity = Pick<
  EditorTab,
  "filePath" | "id" | "pendingFilePath"
>;

/**
 * 富文本会话需要稳定身份；未命名标签使用仅存在于渲染进程的虚拟路径。
 */
export function getEditorDocumentPath(tab: EditorDocumentIdentity): string {
  // 新标签加载文件时先绑定目标路径，避免未命名会话把空内容回写到编辑器。
  // 已打开文件切换期间仍保留当前路径，待加载完成后再原子切换。
  return (
    tab.filePath ??
    tab.pendingFilePath ??
    `${UNTITLED_DOCUMENT_PREFIX}${tab.id}`
  );
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
