import { describe, expect, it } from "vitest";

import { shouldApplyExternalFileChange } from "./editor-external-change";

describe("shouldApplyExternalFileChange", () => {
  it("ignores a filesystem event when the tab already has the same content", () => {
    expect(shouldApplyExternalFileChange("# note", "# note")).toBe(false);
  });

  it("applies a filesystem event when the content changed externally", () => {
    expect(shouldApplyExternalFileChange("# note", "# changed")).toBe(true);
  });
});
