import { describe, expect, it } from "vitest";

import {
  shouldApplyExternalFileChange,
  shouldDeferExternalFileChange,
} from "./editor-external-change";

describe("shouldApplyExternalFileChange", () => {
  it("ignores a filesystem event when the tab already has the same content", () => {
    expect(shouldApplyExternalFileChange("# note", "# note")).toBe(false);
  });

  it("applies a filesystem event when the content changed externally", () => {
    expect(shouldApplyExternalFileChange("# note", "# changed")).toBe(true);
  });

  it("defers a filesystem event while the tab has unsaved edits", () => {
    expect(shouldDeferExternalFileChange("# local", "# external", true)).toBe(
      true,
    );
    expect(shouldDeferExternalFileChange("# note", "# note", true)).toBe(false);
    expect(shouldDeferExternalFileChange("# note", "# external", false)).toBe(
      false,
    );
  });
});
