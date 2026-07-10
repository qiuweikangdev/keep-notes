import { describe, expect, it } from "vitest";

import {
  RichPaneViewStateRegistry,
  toRichPaneKey,
} from "./rich-pane-view-state";

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
