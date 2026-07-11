import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RichPaneScrollIdleWriter,
  RichPaneViewStateRegistry,
  toRichPaneKey,
} from "./rich-pane-view-state";

afterEach(() => {
  vi.useRealTimers();
});

describe("RichPaneViewStateRegistry", () => {
  it("builds a pane key from its group and tab", () => {
    expect(toRichPaneKey("group-1", "tab-1")).toBe("group-1:tab-1");
  });

  it("keeps independent pane view state", () => {
    const states = new RichPaneViewStateRegistry();
    states.patch("g1:t1", { scrollTop: 120, topBlockId: "block-a" });
    states.patch("g2:t2", { scrollTop: 760, topBlockId: "block-b" });

    expect(states.read("g1:t1").scrollTop).toBe(120);
    expect(states.read("g2:t2").scrollTop).toBe(760);
    expect(states.read("missing:tab")).toEqual({
      scrollTop: 0,
      topBlockId: null,
      topBlockOffset: 0,
      selection: null,
      width: 0,
    });
  });

  it("returns immutable view state snapshots", () => {
    const states = new RichPaneViewStateRegistry();
    states.patch("g1:t1", {
      scrollTop: 120,
      selection: {
        anchorBlockId: "block-a",
        anchorOffset: 2,
        headBlockId: "block-b",
        headOffset: 4,
      },
    });
    const snapshot = states.read("g1:t1");

    snapshot.scrollTop = 999;
    if (!snapshot.selection) throw new Error("Expected a selection snapshot");
    snapshot.selection.headOffset = 99;

    expect(states.read("g1:t1").scrollTop).toBe(120);
    expect(states.read("g1:t1").selection?.headOffset).toBe(4);
  });

  it("isolates a shared selection input between pane states", () => {
    const states = new RichPaneViewStateRegistry();
    const selection = {
      anchorBlockId: "block-a",
      anchorOffset: 2,
      headBlockId: "block-b",
      headOffset: 4,
    };
    states.patch("g1:t1", { selection });
    states.patch("g2:t2", { selection });

    selection.headOffset = 40;
    const firstSnapshot = states.read("g1:t1");
    if (!firstSnapshot.selection) {
      throw new Error("Expected the first pane selection");
    }
    firstSnapshot.selection.headOffset = 99;

    expect(states.read("g1:t1").selection?.headOffset).toBe(4);
    expect(states.read("g2:t2").selection?.headOffset).toBe(4);
  });

  it("deletes one pane without changing another pane", () => {
    const states = new RichPaneViewStateRegistry();
    states.patch("g1:t1", { scrollTop: 120 });
    states.patch("g2:t2", { scrollTop: 760 });

    states.delete("g1:t1");

    expect(states.read("g1:t1").scrollTop).toBe(0);
    expect(states.read("g2:t2").scrollTop).toBe(760);
  });

  it("clears all pane view state", () => {
    const states = new RichPaneViewStateRegistry();
    states.patch("g1:t1", { scrollTop: 120 });
    states.patch("g2:t2", { scrollTop: 760 });

    states.clear();

    expect(states.read("g1:t1").scrollTop).toBe(0);
    expect(states.read("g2:t2").scrollTop).toBe(0);
  });
});

describe("RichPaneScrollIdleWriter", () => {
  const firstOwner = {
    groupId: "g1",
    tabId: "t1",
    paneKey: "g1:t1" as const,
    path: "C:/notes/first.md",
  };

  it("coalesces a scroll burst while patching the pane registry synchronously", () => {
    vi.useFakeTimers();
    const states = new RichPaneViewStateRegistry();
    const persist = vi.fn();
    const writer = new RichPaneScrollIdleWriter({ states, persist });

    writer.record(firstOwner, 10);
    writer.record(firstOwner, 40);
    writer.record(firstOwner, 90);

    expect(states.read(firstOwner.paneKey).scrollTop).toBe(90);
    expect(persist).not.toHaveBeenCalled();
    vi.advanceTimersByTime(149);
    expect(persist).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(firstOwner, 90);
  });

  it("flushes an outgoing pane at a binding boundary and isolates the next owner", () => {
    vi.useFakeTimers();
    const states = new RichPaneViewStateRegistry();
    const persist = vi.fn();
    const writer = new RichPaneScrollIdleWriter({ states, persist });
    const nextOwner = {
      groupId: "g2",
      tabId: "t2",
      paneKey: "g2:t2" as const,
      path: "C:/notes/first.md",
    };

    writer.record(firstOwner, 120);
    writer.flushInactive(nextOwner);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenLastCalledWith(firstOwner, 120);
    writer.record(nextOwner, 640);
    vi.advanceTimersByTime(150);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith(nextOwner, 640);
  });

  it("cannot let an old timer write into a replacement binding with the same pane key", () => {
    vi.useFakeTimers();
    const states = new RichPaneViewStateRegistry();
    const persist = vi.fn();
    const writer = new RichPaneScrollIdleWriter({ states, persist });
    const replacementOwner = {
      ...firstOwner,
      path: "C:/notes/replacement.md",
    };

    writer.record(firstOwner, 75);
    writer.record(replacementOwner, 15);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenLastCalledWith(firstOwner, 75);
    vi.advanceTimersByTime(150);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith(replacementOwner, 15);
    vi.runOnlyPendingTimers();
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("flushes all pending pane owners exactly once when destroyed", () => {
    vi.useFakeTimers();
    const states = new RichPaneViewStateRegistry();
    const persist = vi.fn();
    const writer = new RichPaneScrollIdleWriter({ states, persist });
    const secondOwner = {
      groupId: "g2",
      tabId: "t2",
      paneKey: "g2:t2" as const,
      path: "C:/notes/second.md",
    };

    writer.record(firstOwner, 125);
    writer.record(secondOwner, 250);
    writer.destroy();

    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenCalledWith(firstOwner, 125);
    expect(persist).toHaveBeenCalledWith(secondOwner, 250);
    vi.runOnlyPendingTimers();
    expect(persist).toHaveBeenCalledTimes(2);
    writer.record(firstOwner, 999);
    expect(states.read(firstOwner.paneKey).scrollTop).toBe(125);
  });
});
