import { describe, expect, it } from "vitest";

import { isEditorFileDrag } from "./editor-drag-session";

describe("isEditorFileDrag", () => {
  it("does not classify a BlockNote table drag as a file drag", () => {
    expect(isEditorFileDrag([])).toBe(false);
  });

  it("recognizes a file-tree drag", () => {
    expect(isEditorFileDrag(["application/x-keep-notes-file"])).toBe(true);
  });

  it("recognizes a system file drag", () => {
    expect(isEditorFileDrag(["Files"])).toBe(true);
  });
});
