import { BlockNoteEditor } from "@blocknote/core";
import type { Transaction } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { collectChangedTopLevelBlocks } from "./editor-transaction-blocks";

function createEditor() {
  return BlockNoteEditor.create({
    initialContent: [
      { id: "block-a", type: "paragraph", content: "alpha" },
      { id: "block-b", type: "paragraph", content: "beta" },
    ],
  });
}

function captureTransaction(
  editor: ReturnType<typeof createEditor>,
  change: () => void,
): Transaction {
  let captured: Transaction | null = null;
  const handleTransaction = (event: { transaction: Transaction }) => {
    if (event.transaction.docChanged) captured = event.transaction;
  };
  // oxlint-disable-next-line eslint/no-underscore-dangle
  editor._tiptapEditor.on("transaction", handleTransaction);
  change();
  // oxlint-disable-next-line eslint/no-underscore-dangle
  editor._tiptapEditor.off("transaction", handleTransaction);

  if (!captured) throw new Error("Expected BlockNote to emit a transaction");
  return captured;
}

function hasMappedRange(transaction: Transaction): boolean {
  return transaction.steps.some((step) => {
    let hasRange = false;
    step.getMap().forEach(() => {
      hasRange = true;
    });
    return hasRange;
  });
}

describe("collectChangedTopLevelBlocks", () => {
  it("collects the containing block for a text transaction", () => {
    const editor = createEditor();
    const transaction = captureTransaction(editor, () => {
      editor.updateBlock("block-a", { content: "updated" });
    });

    expect(collectChangedTopLevelBlocks(transaction)).toMatchObject({
      structureChanged: false,
      order: ["block-a", "block-b"],
    });
    expect(collectChangedTopLevelBlocks(transaction).changedIds).toEqual(
      new Set(["block-a"]),
    );
  });

  it("collects all selected blocks for mark-only style transactions", () => {
    const editor = createEditor();
    const addMarkTransaction = captureTransaction(editor, () => {
      // oxlint-disable-next-line eslint/no-underscore-dangle
      editor._tiptapEditor.commands.selectAll();
      editor.addStyles({ bold: true });
    });

    expect(
      addMarkTransaction.steps.map((step) => step.constructor.name),
    ).toEqual(["AddMarkStep", "AddMarkStep"]);
    expect(hasMappedRange(addMarkTransaction)).toBe(false);
    expect(collectChangedTopLevelBlocks(addMarkTransaction)).toEqual({
      changedIds: new Set(["block-a", "block-b"]),
      structureChanged: false,
      order: ["block-a", "block-b"],
    });

    const removeMarkTransaction = captureTransaction(editor, () => {
      // oxlint-disable-next-line eslint/no-underscore-dangle
      editor._tiptapEditor.commands.selectAll();
      editor.removeStyles({ bold: true });
    });

    expect(
      removeMarkTransaction.steps.map((step) => step.constructor.name),
    ).toEqual(["RemoveMarkStep"]);
    expect(hasMappedRange(removeMarkTransaction)).toBe(false);
    expect(collectChangedTopLevelBlocks(removeMarkTransaction)).toEqual({
      changedIds: new Set(["block-a", "block-b"]),
      structureChanged: false,
      order: ["block-a", "block-b"],
    });
  });

  it("reports the exact final order after inserting a block", () => {
    const editor = createEditor();
    const transaction = captureTransaction(editor, () => {
      editor.insertBlocks(
        [{ id: "block-c", type: "paragraph", content: "gamma" }],
        "block-a",
        "after",
      );
    });

    expect(collectChangedTopLevelBlocks(transaction)).toMatchObject({
      structureChanged: true,
      order: ["block-a", "block-c", "block-b"],
    });
  });

  it("reports the exact final order after removing a block", () => {
    const editor = createEditor();
    const transaction = captureTransaction(editor, () => {
      editor.removeBlocks(["block-a"]);
    });

    expect(collectChangedTopLevelBlocks(transaction)).toMatchObject({
      structureChanged: true,
      order: ["block-b"],
    });
  });

  it("reports the exact final order after moving a block", () => {
    const editor = createEditor();
    const transaction = captureTransaction(editor, () => {
      editor.moveBlocksDown("block-a");
    });

    expect(collectChangedTopLevelBlocks(transaction)).toMatchObject({
      structureChanged: true,
      order: ["block-b", "block-a"],
    });
  });
});
