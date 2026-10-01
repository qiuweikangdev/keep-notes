import { Schema } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { collectTransactionChangedRanges } from "./editor-transaction-ranges";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*" },
    text: {},
  },
  marks: { code: {} },
});

function createState() {
  return EditorState.create({
    schema,
    doc: schema.node("doc", null, [
      schema.node("paragraph", null, schema.text("first")),
      schema.node("paragraph", null, schema.text("second")),
    ]),
  });
}

describe("transaction changed ranges", () => {
  it("maps edits across later steps and transactions to the final document", () => {
    const state = createState();
    const first = state.tr.insertText("X", 10).insertText("before", 1);
    const next = state.apply(first);
    const second = next.tr.delete(2, 4);
    const { ranges, mapping } = collectTransactionChangedRanges([
      first,
      second,
    ]);
    const insertedPosition = second.doc.textContent.indexOf("X") + 3;
    expect(
      ranges.some(
        ({ from, to }) => insertedPosition >= from && insertedPosition <= to,
      ),
    ).toBe(true);
    expect(mapping.map(10, -1)).toBe(14);
    expect(
      ranges.every(
        ({ from, to }) =>
          from >= 0 && to <= second.doc.content.size && from <= to,
      ),
    ).toBe(true);
  });

  it("includes mark-only changes with an empty StepMap", () => {
    const state = createState();
    const transaction = state.tr.addMark(2, 4, schema.marks.code.create());
    let mappedRanges = 0;
    transaction.mapping.maps[0].forEach(() => mappedRanges++);
    expect(mappedRanges).toBe(0);
    expect(collectTransactionChangedRanges([transaction]).ranges).toEqual([
      { from: 1, to: 5 },
    ]);
  });

  it("merges overlapping edits and preserves separated ranges", () => {
    const state = createState();
    const transaction = state.tr
      .insertText("ab", 2)
      .insertText("c", 3)
      .insertText("z", 12);
    const { ranges } = collectTransactionChangedRanges([transaction]);
    expect(ranges).toHaveLength(2);
    expect(ranges[0].to).toBeLessThan(ranges[1].from);
  });

  it("does not scan for selection-only transactions", () => {
    expect(collectTransactionChangedRanges([createState().tr]).ranges).toEqual(
      [],
    );
  });
});
