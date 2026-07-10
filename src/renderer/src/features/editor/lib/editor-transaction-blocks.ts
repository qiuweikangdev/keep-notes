import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

export interface ChangedTopLevelBlocks {
  changedIds: Set<string>;
  structureChanged: boolean;
  order: string[];
}

function topLevelBlockIds(doc: ProseMirrorNode): string[] {
  const blockGroup = doc.firstChild;
  if (!blockGroup || blockGroup.type.name !== "blockGroup") return [];

  const ids: string[] = [];
  blockGroup.forEach((node) => {
    if (
      node.type.name === "blockContainer" &&
      typeof node.attrs.id === "string"
    ) {
      ids.push(node.attrs.id);
    }
  });
  return ids;
}

function addContainingTopLevelBlock(
  position: ResolvedPos,
  ids: Set<string>,
): void {
  for (let depth = 1; depth <= position.depth; depth += 1) {
    const node = position.node(depth);
    if (
      node.type.name === "blockContainer" &&
      typeof node.attrs.id === "string"
    ) {
      ids.add(node.attrs.id);
      return;
    }
  }
}

function blockIdsAcrossRange(
  doc: ProseMirrorNode,
  start: number,
  end: number,
): Set<string> {
  const contentSize = doc.content.size;
  const clampedStart = Math.min(contentSize, Math.max(0, start));
  const clampedEnd = Math.min(contentSize, Math.max(0, end));
  const from = Math.min(clampedStart, clampedEnd);
  const to = Math.max(clampedStart, clampedEnd);
  const ids = new Set<string>();

  // StepMap 范围可能落在文本内部或块边缘；边界所在的顶层块也必须参与变更判断。
  addContainingTopLevelBlock(doc.resolve(from), ids);
  addContainingTopLevelBlock(doc.resolve(to), ids);

  const rootBlockGroup = doc.firstChild;
  doc.nodesBetween(from, to, (node, _position, parent) => {
    if (
      parent === rootBlockGroup &&
      node.type.name === "blockContainer" &&
      typeof node.attrs.id === "string"
    ) {
      ids.add(node.attrs.id);
    }
  });

  return ids;
}

function collectChangedIdsAcrossRange(
  before: ProseMirrorNode,
  after: ProseMirrorNode,
  oldStart: number,
  oldEnd: number,
  newStart: number,
  newEnd: number,
  changedIds: Set<string>,
): boolean {
  const oldIds = blockIdsAcrossRange(before, oldStart, oldEnd);
  const newIds = blockIdsAcrossRange(after, newStart, newEnd);
  oldIds.forEach((id) => changedIds.add(id));
  newIds.forEach((id) => changedIds.add(id));
  return [...oldIds].join("\u001f") !== [...newIds].join("\u001f");
}

export function collectChangedTopLevelBlocks(
  transaction: Transaction,
): ChangedTopLevelBlocks {
  const changedIds = new Set<string>();
  let structureChanged = false;

  // 每个 step 必须与其对应的前后文档比较，不能把整篇文档转换为 BlockNote blocks。
  transaction.steps.forEach((step, index) => {
    const before = transaction.docs[index];
    const after = transaction.docs[index + 1] ?? transaction.doc;
    let hasMappedRange = false;
    step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
      hasMappedRange = true;
      if (
        collectChangedIdsAcrossRange(
          before,
          after,
          oldStart,
          oldEnd,
          newStart,
          newEnd,
          changedIds,
        )
      ) {
        structureChanged = true;
      }
    });

    if (hasMappedRange || before.eq(after)) return;

    // AddMarkStep / RemoveMarkStep 的 StepMap 为空，需从前后 ProseMirror 文档差异定位受影响块。
    const diffStart = before.content.findDiffStart(after.content);
    if (diffStart === null) return;
    const diffEnd = before.content.findDiffEnd(after.content);
    if (
      collectChangedIdsAcrossRange(
        before,
        after,
        diffStart,
        diffEnd?.a ?? diffStart,
        diffStart,
        diffEnd?.b ?? diffStart,
        changedIds,
      )
    ) {
      structureChanged = true;
    }
  });

  return {
    changedIds,
    structureChanged,
    order: topLevelBlockIds(transaction.doc),
  };
}
