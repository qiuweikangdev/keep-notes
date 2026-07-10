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

  // BlockNote 输出紧凑的块 HTML，因此所有文本节点（包括独立空格）都是语义内容。
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node === target) {
      return {
        blockId,
        textOffset:
          textOffset +
          clampTextOffset(localOffset, node.textContent?.length ?? 0),
      };
    }
    textOffset += node.textContent?.length ?? 0;
  }

  return { blockId, textOffset: 0 };
}
