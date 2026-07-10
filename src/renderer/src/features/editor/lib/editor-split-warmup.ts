import { LARGE_DOCUMENT_CHAR_LIMIT } from "./editor-large-document";

interface SplitWarmupDecision {
  documentLength: number;
  visibleDocumentCopies: number;
}

export function shouldPrepareSplitWarmup({
  documentLength,
  visibleDocumentCopies,
}: SplitWarmupDecision): boolean {
  // 大文档双面板已经占用两棵完整编辑器 DOM，不再补建第三个隐藏实例。
  return (
    documentLength < LARGE_DOCUMENT_CHAR_LIMIT || visibleDocumentCopies < 2
  );
}
