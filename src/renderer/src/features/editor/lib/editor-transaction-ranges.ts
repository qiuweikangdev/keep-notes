import type { Transaction } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";

export function collectTransactionChangedRanges(
  transactions: readonly Transaction[],
) {
  const mapping = new Mapping();
  transactions.forEach((transaction) =>
    mapping.appendMapping(transaction.mapping),
  );
  const ranges: Array<{ from: number; to: number }> = [];
  let mapOffset = 0;
  const docSize = transactions.at(-1)?.doc.content.size ?? 0;

  transactions.forEach((transaction) => {
    transaction.steps.forEach((step, stepIndex) => {
      const laterMapping = mapping.slice(mapOffset + stepIndex + 1);
      const addRange = (start: number, end: number) => {
        // 每一步的位置都映射到最终文档；扩展边缘以包含删除后重新拼接的文本节点。
        const from = laterMapping.map(start, -1);
        const to = laterMapping.map(end, 1);
        ranges.push({
          from: Math.max(0, Math.min(from, to) - 1),
          to: Math.min(docSize, Math.max(from, to) + 1),
        });
      };
      let hasRange = false;
      step.getMap().forEach((_oldFrom, _oldTo, from, to) => {
        hasRange = true;
        addRange(from, to);
      });
      if (hasRange) return;

      // 样式和属性步骤可能没有 StepMap，仍需检查真正改变的局部内容。
      const before = transaction.docs[stepIndex];
      const after = transaction.docs[stepIndex + 1] ?? transaction.doc;
      const start = before.content.findDiffStart(after.content);
      if (start !== null) {
        addRange(start, before.content.findDiffEnd(after.content)?.b ?? start);
      }
    });
    mapOffset += transaction.mapping.maps.length;
  });

  const merged: typeof ranges = [];
  for (const range of ranges.toSorted(
    (left, right) => left.from - right.from,
  )) {
    const previous = merged.at(-1);
    if (previous && range.from <= previous.to) {
      previous.to = Math.max(previous.to, range.to);
    } else {
      merged.push(range);
    }
  }
  return { ranges: merged, mapping };
}
