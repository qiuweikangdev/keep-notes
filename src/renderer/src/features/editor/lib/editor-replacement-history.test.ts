import { describe, expect, it } from "vitest";
import { EditorReplacementHistory } from "./editor-replacement-history";

describe("replacement undo history", () => {
  it("undoes successive replacements in order", () => {
    const history = new EditorReplacementHistory();
    history.push("original", "first");
    history.push("first", "second");
    expect(history.pop("second")).toBe("first");
    expect(history.pop("first")).toBe("original");
    expect(history.pop("original")).toBeNull();
  });

  it("preserves edits made after a replacement until they have been undone", () => {
    const history = new EditorReplacementHistory();
    history.push("original", "replaced");
    expect(history.pop("replaced with a new edit")).toBeNull();
    expect(history.pop("replaced")).toBe("original");
  });

  it("restores an empty original document and clears history on a new document", () => {
    const history = new EditorReplacementHistory();
    history.push("", "replaced");
    expect(history.pop("replaced")).toBe("");
    history.push("original", "replaced");
    history.clear();
    expect(history.pop("replaced")).toBeNull();
  });
});
