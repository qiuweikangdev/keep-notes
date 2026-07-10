import { BlockNoteEditor } from "@blocknote/core";
import { describe, expect, it, vi } from "vitest";

import { EditorInstanceRegistry } from "./editor-instance-registry";

function createEditor(content = "initial") {
  return BlockNoteEditor.create({
    initialContent: [
      {
        id: "shared-block",
        type: "paragraph",
        content,
      },
    ],
  });
}

describe("EditorInstanceRegistry", () => {
  it("batches standby document transactions outside the input path", () => {
    const scheduled: Array<() => void> = [];
    const registry = new EditorInstanceRegistry({
      schedule: (callback) => {
        scheduled.push(callback);
        return () => {};
      },
    });
    const source = createEditor();
    const target = createEditor();
    const onSynchronizationPending = vi.fn();
    const onSynchronized = vi.fn();
    registry.register({
      groupId: "group-1",
      tabId: "tab-1",
      path: "note.md",
      editor: source,
    });
    registry.register({
      groupId: "group-warmup",
      tabId: "tab-warmup",
      path: "note.md",
      editor: target,
      standby: true,
      mirrorSourceGroupId: "group-1",
      mirrorSourceTabId: "tab-1",
      onSynchronizationPending,
      onSynchronized,
    });

    expect(target._tiptapEditor.state.doc.toJSON()).toEqual(
      source._tiptapEditor.state.doc.toJSON(),
    );

    source.updateBlock("shared-block", { content: "updated" });

    expect(target.document[0].content).not.toEqual(source.document[0].content);
    expect(onSynchronizationPending).toHaveBeenCalledOnce();
    expect(scheduled).toHaveLength(1);

    scheduled[0]();

    expect(target.document[0].content).toEqual(source.document[0].content);
    expect(onSynchronized).toHaveBeenCalledOnce();
  });

  it("does not mirror a mirrored transaction back to its source", () => {
    const scheduled: Array<() => void> = [];
    const registry = new EditorInstanceRegistry({
      schedule: (callback) => {
        scheduled.push(callback);
        return () => {};
      },
    });
    const source = createEditor();
    const target = createEditor();
    const sourceTransaction = vi.fn();
    source._tiptapEditor.on("transaction", sourceTransaction);
    registry.register({
      groupId: "group-1",
      tabId: "tab-1",
      path: "note.md",
      editor: source,
    });
    registry.register({
      groupId: "group-warmup",
      tabId: "tab-warmup",
      path: "note.md",
      editor: target,
      standby: true,
      mirrorSourceGroupId: "group-1",
      mirrorSourceTabId: "tab-1",
    });

    source.updateBlock("shared-block", { content: "updated" });
    scheduled[0]();

    expect(sourceTransaction).toHaveBeenCalledTimes(1);
  });

  it("keeps a claimed visible peer in the same batched synchronization group", () => {
    const scheduled: Array<() => void> = [];
    const registry = new EditorInstanceRegistry({
      schedule: (callback) => {
        scheduled.push(callback);
        return () => {};
      },
    });
    const source = createEditor();
    const claimedPeer = createEditor();
    registry.register({
      groupId: "group-1",
      tabId: "tab-1",
      path: "note.md",
      editor: source,
    });
    registry.register({
      groupId: "group-2",
      tabId: "tab-2",
      path: "note.md",
      editor: claimedPeer,
      standby: true,
      mirrorSourceGroupId: "group-1",
      mirrorSourceTabId: "tab-1",
    });
    registry.setStandby("group-2", "tab-2", false);

    source.updateBlock("shared-block", { content: "updated" });

    expect(claimedPeer.document[0].content).not.toEqual(
      source.document[0].content,
    );
    expect(registry.getSynchronizedTabIds("group-1", "tab-1")).toEqual([
      "tab-1",
      "tab-2",
    ]);
    registry.flushPending("group-2", "tab-2");
    expect(claimedPeer.document[0].content).toEqual(source.document[0].content);

    claimedPeer.updateBlock("shared-block", { content: "edited in peer" });
    expect(source.document[0].content).not.toEqual(
      claimedPeer.document[0].content,
    );
    registry.flushPending("group-1", "tab-1");
    expect(source.document[0].content).toEqual(claimedPeer.document[0].content);
  });

  it("does not publish warmup status for a claimed visible peer", () => {
    const scheduled: Array<() => void> = [];
    const registry = new EditorInstanceRegistry({
      schedule: (callback) => {
        scheduled.push(callback);
        return () => {};
      },
    });
    const source = createEditor();
    const peer = createEditor();
    const onSynchronizationPending = vi.fn();

    registry.register({
      groupId: "group-1",
      tabId: "tab-1",
      path: "note.md",
      editor: source,
    });
    registry.register({
      groupId: "group-2",
      tabId: "tab-2",
      path: "note.md",
      editor: peer,
      standby: true,
      mirrorSourceGroupId: "group-1",
      mirrorSourceTabId: "tab-1",
      onSynchronizationPending,
    });
    registry.setStandby("group-2", "tab-2", false);

    source.updateBlock("shared-block", { content: "updated" });

    expect(onSynchronizationPending).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
  });

  it("reports a stale peer instead of claiming a divergent document", () => {
    const registry = new EditorInstanceRegistry();
    const source = createEditor("a much longer source document");
    const target = createEditor("x");
    const onDesynchronized = vi.fn();
    registry.register({
      groupId: "group-1",
      tabId: "tab-1",
      path: "note.md",
      editor: source,
    });
    registry.register({
      groupId: "group-warmup",
      tabId: "tab-warmup",
      path: "note.md",
      editor: target,
      standby: true,
      mirrorSourceGroupId: "group-1",
      mirrorSourceTabId: "tab-1",
      onDesynchronized,
    });

    source.updateBlock("shared-block", {
      content: "a much longer source document with another change",
    });

    expect(onDesynchronized).toHaveBeenCalledOnce();
  });

  it("returns the live block snapshot of a registered source editor", () => {
    const registry = new EditorInstanceRegistry();
    const source = createEditor();
    registry.register({
      groupId: "group-1",
      tabId: "tab-1",
      path: "note.md",
      editor: source,
    });

    source.updateBlock("shared-block", { content: "latest" });

    expect(registry.getDocumentSnapshot("group-1", "tab-1")).toEqual(
      source.document,
    );
  });
});
