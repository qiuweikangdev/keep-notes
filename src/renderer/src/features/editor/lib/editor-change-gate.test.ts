import { describe, expect, it } from "vitest";

import { EditorChangeGate } from "./editor-change-gate";

describe("EditorChangeGate", () => {
  it("ignores programmatic document changes", () => {
    const gate = new EditorChangeGate();

    gate.markUserIntent();
    gate.resetAfterProgrammaticChange();

    expect(gate.capturePendingRevision()).toBeNull();
  });

  it("allows a change only after explicit user intent", () => {
    const gate = new EditorChangeGate();

    gate.markUserIntent();
    const revision = gate.capturePendingRevision();

    expect(revision).toBe(1);
    gate.markSerialized(revision!);
    expect(gate.capturePendingRevision()).toBeNull();
  });

  it("does not lose a newer edit while an older serialization is running", () => {
    const gate = new EditorChangeGate();
    gate.markUserIntent();
    const firstRevision = gate.capturePendingRevision();
    gate.markUserIntent();

    gate.markSerialized(firstRevision!);

    expect(gate.capturePendingRevision()).toBe(2);
  });
});
