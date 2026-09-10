import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { AddMarkStep, RemoveMarkStep } from "@tiptap/pm/transform";

export interface EditorOutlineSnapshot {
  headings: Array<{ id: string; text: string; level: number }>;
  activeHeadingIdByBlockId: ReadonlyMap<string, string | null>;
}

/** 文档元数据独立于 Markdown 保存，普通输入只处理当前文本块。 */
export class EditorDocumentIndex {
  private doc: ProseMirrorNode | null = null;
  private headingIndices = new Map<string, number>();
  private outline: EditorOutlineSnapshot = {
    headings: [],
    activeHeadingIdByBlockId: new Map(),
  };
  revision = 0;
  textLength = 0;

  read(doc: ProseMirrorNode): EditorOutlineSnapshot {
    if (this.doc !== doc) this.rebuild(doc);
    return this.outline;
  }

  apply(transaction: Transaction): void {
    if (!transaction.docChanged || this.doc === transaction.doc) return;
    if (this.doc !== transaction.before) {
      this.rebuild(transaction.doc);
      return;
    }

    const updates = new Map<string, string>();
    let lengthDelta = 0;
    let requiresRebuild = false;
    transaction.steps.forEach((step, index) => {
      const before = transaction.docs[index];
      const after = transaction.docs[index + 1] ?? transaction.doc;
      let hasRange = false;
      step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
        hasRange = true;
        const from = before.resolve(oldStart);
        const to = before.resolve(oldEnd);
        const nextFrom = after.resolve(newStart);
        const nextTo = after.resolve(newEnd);
        // 跨块粘贴、移动和层级变化走结构重建；文字和行内格式不扫描全文。
        if (
          !from.sameParent(to) ||
          !nextFrom.sameParent(nextTo) ||
          !from.parent.isTextblock ||
          !nextFrom.parent.isTextblock ||
          !from.parent.sameMarkup(nextFrom.parent) ||
          from.depth < 1 ||
          nextFrom.depth < 1 ||
          from.node(from.depth - 1).attrs.id !==
            nextFrom.node(nextFrom.depth - 1).attrs.id
        ) {
          requiresRebuild = true;
          return;
        }
        lengthDelta +=
          after.textBetween(newStart, newEnd, "").length -
          before.textBetween(oldStart, oldEnd, "").length;
        if (nextFrom.parent.type.name === "heading") {
          updates.set(
            nextFrom.node(nextFrom.depth - 1).attrs.id,
            nextFrom.parent.textContent,
          );
        }
      });
      // 无映射的 mark 不改变标题文字；其他属性事务可能改变标题等级或块类型。
      if (
        !hasRange &&
        !(step instanceof AddMarkStep) &&
        !(step instanceof RemoveMarkStep)
      ) {
        requiresRebuild = true;
      }
    });
    if (requiresRebuild) {
      this.rebuild(transaction.doc);
      return;
    }
    this.doc = transaction.doc;
    this.revision += 1;
    this.textLength += lengthDelta;
    let headings = this.outline.headings;
    for (const [id, text] of updates) {
      const index = this.headingIndices.get(id);
      if (index === undefined || headings[index].text === text) continue;
      if (headings === this.outline.headings) headings = headings.slice();
      headings[index] = { ...headings[index], text };
    }
    if (headings !== this.outline.headings)
      this.outline = { ...this.outline, headings };
  }

  private rebuild(doc: ProseMirrorNode): void {
    const headings: EditorOutlineSnapshot["headings"] = [];
    const activeHeadingIdByBlockId = new Map<string, string | null>();
    this.headingIndices = new Map();
    let activeHeadingId: string | null = null;
    doc.descendants((node) => {
      if (node.type.name !== "blockContainer") return;
      const id = node.attrs.id as string;
      if (node.firstChild?.type.name === "heading") {
        activeHeadingId = id;
        this.headingIndices.set(id, headings.length);
        headings.push({
          id,
          text: node.firstChild.textContent,
          level: node.firstChild.attrs.level ?? 1,
        });
      }
      activeHeadingIdByBlockId.set(id, activeHeadingId);
    });
    this.doc = doc;
    this.textLength = doc.textContent.length;
    this.revision += 1;
    this.outline = { headings, activeHeadingIdByBlockId };
  }
}
