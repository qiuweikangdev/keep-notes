import { BlockNoteEditor } from "@blocknote/core";
import type { Transaction } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";

import { RichPreviewCache } from "./rich-preview-cache";

function createHarness() {
  const source = BlockNoteEditor.create({
    initialContent: [
      { id: "block-a", type: "paragraph", content: "alpha" },
      { id: "block-b", type: "paragraph", content: "beta" },
    ],
  });
  const scheduled: Array<() => void> = [];
  const cancellations: Array<ReturnType<typeof vi.fn>> = [];
  const exportedIds: string[] = [];
  const exportBlocks = source.blocksToFullHTML.bind(source);
  const getBlock = vi.spyOn(source, "getBlock");
  const blocksToFullHTML = vi
    .spyOn(source, "blocksToFullHTML")
    .mockImplementation((blocks) => {
      for (const block of blocks ?? source.document) {
        if (typeof block.id === "string") exportedIds.push(block.id);
      }
      return exportBlocks(blocks);
    });
  const cache = new RichPreviewCache(source, {
    schedule: (callback) => {
      const cancel = vi.fn();
      scheduled.push(callback);
      cancellations.push(cancel);
      return cancel;
    },
  });
  cache.seed(source.document);
  exportedIds.length = 0;
  getBlock.mockClear();
  blocksToFullHTML.mockClear();

  const handleTransaction = (event: { transaction: Transaction }) => {
    cache.handleTransaction(event.transaction);
  };
  // oxlint-disable-next-line eslint/no-underscore-dangle
  source._tiptapEditor.on("transaction", handleTransaction);

  return {
    source,
    cache,
    scheduled,
    cancellations,
    exportedIds,
    getBlock,
    blocksToFullHTML,
  };
}

describe("RichPreviewCache", () => {
  it("merges repeated block edits into one frame export", () => {
    const {
      source,
      cache,
      scheduled,
      exportedIds,
      getBlock,
      blocksToFullHTML,
    } = createHarness();

    source.updateBlock("block-a", { content: "updated" });
    source.updateBlock("block-a", { content: "updated twice" });

    expect(scheduled).toHaveLength(1);
    expect(cache.getSnapshot().revision).toBe(0);
    expect(getBlock).not.toHaveBeenCalled();
    expect(blocksToFullHTML).not.toHaveBeenCalled();

    scheduled[0]();

    expect(cache.getSnapshot().revision).toBe(1);
    expect(exportedIds).toEqual(["block-a"]);
    expect(getBlock).toHaveBeenCalledTimes(1);
    expect(blocksToFullHTML).toHaveBeenCalledTimes(1);
    expect(cache.getBlockSnapshot("block-a")?.html).toContain("updated twice");
  });

  it("exports every changed block only once in the same frame", () => {
    const {
      source,
      cache,
      scheduled,
      exportedIds,
      getBlock,
      blocksToFullHTML,
    } = createHarness();

    source.updateBlock("block-a", { content: "updated" });
    source.updateBlock("block-b", { content: "changed" });
    source.updateBlock("block-a", { content: "updated twice" });
    scheduled[0]();

    expect(exportedIds).toEqual(["block-a", "block-b"]);
    expect(getBlock).toHaveBeenCalledTimes(2);
    expect(blocksToFullHTML).toHaveBeenCalledTimes(2);
    expect(cache.getBlockSnapshot("block-a")?.html).toContain("updated twice");
    expect(cache.getBlockSnapshot("block-b")?.html).toContain("changed");
  });

  it("refreshes every block affected by a mark-only transaction", () => {
    const {
      source,
      cache,
      scheduled,
      exportedIds,
      getBlock,
      blocksToFullHTML,
    } = createHarness();

    // oxlint-disable-next-line eslint/no-underscore-dangle
    source._tiptapEditor.commands.selectAll();
    source.addStyles({ bold: true });

    expect(scheduled).toHaveLength(1);
    expect(cache.getSnapshot().revision).toBe(0);
    expect(getBlock).not.toHaveBeenCalled();
    expect(blocksToFullHTML).not.toHaveBeenCalled();

    scheduled[0]();

    expect(exportedIds).toEqual(["block-a", "block-b"]);
    expect(getBlock).toHaveBeenCalledTimes(2);
    expect(blocksToFullHTML).toHaveBeenCalledTimes(2);
    expect(cache.getBlockSnapshot("block-a")?.html).toContain(
      "<strong>alpha</strong>",
    );
    expect(cache.getBlockSnapshot("block-b")?.html).toContain(
      "<strong>beta</strong>",
    );
  });

  it("updates order and HTML when a block is inserted", () => {
    const { source, cache, scheduled } = createHarness();
    const documentListener = vi.fn();
    const insertedListener = vi.fn();
    cache.subscribe(documentListener);
    cache.subscribeBlock("block-c", insertedListener);

    source.insertBlocks(
      [{ id: "block-c", type: "paragraph", content: "gamma" }],
      "block-a",
      "after",
    );
    scheduled[0]();

    expect(cache.getSnapshot().order).toEqual([
      "block-a",
      "block-c",
      "block-b",
    ]);
    expect(cache.getBlockSnapshot("block-c")?.html).toContain("gamma");
    expect(insertedListener).toHaveBeenCalledOnce();
    expect(documentListener).toHaveBeenCalledOnce();
  });

  it("removes deleted HTML and only notifies the changed block", () => {
    const { source, cache, scheduled } = createHarness();
    const documentListener = vi.fn();
    const removedListener = vi.fn();
    const unchangedListener = vi.fn();
    cache.subscribe(documentListener);
    cache.subscribeBlock("block-a", removedListener);
    cache.subscribeBlock("block-b", unchangedListener);

    source.removeBlocks(["block-a"]);
    scheduled[0]();

    expect(cache.getSnapshot().order).toEqual(["block-b"]);
    expect(cache.getBlockSnapshot("block-a")).toBeNull();
    expect(removedListener).toHaveBeenCalledOnce();
    expect(unchangedListener).not.toHaveBeenCalled();
    expect(documentListener).toHaveBeenCalledOnce();
  });

  it("uses the final order when structural changes share a frame", () => {
    const { source, cache, scheduled, exportedIds } = createHarness();

    source.insertBlocks(
      [{ id: "block-c", type: "paragraph", content: "gamma" }],
      "block-a",
      "after",
    );
    source.removeBlocks(["block-b"]);

    expect(scheduled).toHaveLength(1);
    scheduled[0]();

    expect(cache.getSnapshot().order).toEqual(["block-a", "block-c"]);
    expect(cache.getBlockSnapshot("block-b")).toBeNull();
    expect(cache.getBlockSnapshot("block-c")?.html).toContain("gamma");
    expect(exportedIds).toEqual(["block-c"]);
  });

  it("publishes once per frame and keeps snapshot identity until flush", () => {
    const { source, cache, scheduled } = createHarness();
    const documentListener = vi.fn();
    const changedListener = vi.fn();
    const unchangedListener = vi.fn();
    cache.subscribe(documentListener);
    cache.subscribeBlock("block-a", changedListener);
    cache.subscribeBlock("block-b", unchangedListener);
    const initialSnapshot = cache.getSnapshot();
    const initialChangedBlock = cache.getBlockSnapshot("block-a");
    const initialUnchangedBlock = cache.getBlockSnapshot("block-b");

    source.updateBlock("block-a", { content: "first" });
    expect(cache.getSnapshot()).toBe(initialSnapshot);
    expect(cache.getBlockSnapshot("block-a")).toBe(initialChangedBlock);
    expect(cache.getBlockSnapshot("block-b")).toBe(initialUnchangedBlock);
    source.updateBlock("block-a", { content: "second" });
    expect(cache.getSnapshot()).toBe(initialSnapshot);
    expect(cache.getBlockSnapshot("block-a")).toBe(initialChangedBlock);
    expect(cache.getBlockSnapshot("block-b")).toBe(initialUnchangedBlock);

    scheduled[0]();

    expect(cache.getSnapshot()).not.toBe(initialSnapshot);
    expect(cache.getBlockSnapshot("block-a")).not.toBe(initialChangedBlock);
    expect(cache.getBlockSnapshot("block-b")).toBe(initialUnchangedBlock);
    expect(documentListener).toHaveBeenCalledOnce();
    expect(changedListener).toHaveBeenCalledOnce();
    expect(unchangedListener).not.toHaveBeenCalled();
  });

  it("uses identity-safe subscription cleanup", () => {
    const { source, cache, scheduled } = createHarness();
    const listener = vi.fn();
    const unsubscribeFirst = cache.subscribe(listener);
    const unsubscribeSecond = cache.subscribe(listener);

    unsubscribeFirst();
    unsubscribeFirst();
    source.updateBlock("block-a", { content: "updated" });
    scheduled[0]();
    expect(listener).toHaveBeenCalledOnce();

    unsubscribeSecond();
    source.updateBlock("block-a", { content: "updated again" });
    scheduled[1]();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("cancels pending work and clears listeners when destroyed", () => {
    const {
      source,
      cache,
      scheduled,
      cancellations,
      getBlock,
      blocksToFullHTML,
    } = createHarness();
    const documentListener = vi.fn();
    const blockListener = vi.fn();
    cache.subscribe(documentListener);
    cache.subscribeBlock("block-a", blockListener);
    const initialSnapshot = cache.getSnapshot();

    source.updateBlock("block-a", { content: "updated" });
    cache.destroy();

    expect(cancellations[0]).toHaveBeenCalledOnce();
    scheduled[0]();
    source.updateBlock("block-a", { content: "ignored" });
    expect(scheduled).toHaveLength(1);
    expect(cache.getSnapshot()).toBe(initialSnapshot);
    expect(getBlock).not.toHaveBeenCalled();
    expect(blocksToFullHTML).not.toHaveBeenCalled();
    expect(documentListener).not.toHaveBeenCalled();
    expect(blockListener).not.toHaveBeenCalled();
  });
});
