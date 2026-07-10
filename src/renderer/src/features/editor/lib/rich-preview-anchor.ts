export interface RichPreviewAnchor {
  blockId: string;
  textOffset: number;
}

function getClosestBlockWrapper(target: Node): HTMLElement | null {
  const element =
    target.nodeType === Node.ELEMENT_NODE
      ? (target as Element)
      : target.parentElement;
  const wrapper = element?.closest<HTMLElement>("[data-block-id]") ?? null;
  return wrapper?.dataset.blockId ? wrapper : null;
}

function clampTextOffset(offset: number, length: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.min(Math.max(Math.trunc(offset), 0), length);
}

export function resolveRichPreviewAnchor(
  target: Node,
  localOffset: number,
): RichPreviewAnchor | null {
  const wrapper = getClosestBlockWrapper(target);
  const blockId = wrapper?.dataset.blockId;
  if (!wrapper || !blockId) return null;

  if (target.nodeType !== Node.TEXT_NODE || !wrapper.contains(target)) {
    return { blockId, textOffset: 0 };
  }

  const walker = wrapper.ownerDocument.createTreeWalker(
    wrapper,
    NodeFilter.SHOW_TEXT,
  );
  let textOffset = 0;

  // 只累计用户可见文本；HTML 模板缩进形成的纯空白节点不属于编辑器文本偏移。
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node === target) {
      return {
        blockId,
        textOffset:
          textOffset +
          clampTextOffset(localOffset, node.textContent?.length ?? 0),
      };
    }
    if (node.textContent?.trim()) textOffset += node.textContent.length;
  }

  return { blockId, textOffset: 0 };
}
