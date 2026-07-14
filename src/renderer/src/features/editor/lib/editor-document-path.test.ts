import { describe, expect, it } from "vitest";
import {
  getEditorDocumentPath,
  isUntitledDocumentPath,
  matchesEditorDocumentPath,
} from "./editor-document-path";

describe("editor document path", () => {
  it("keeps real file paths as the rich document identity", () => {
    const tab = { id: "tab-1", filePath: "C:\\notes\\readme.md" };

    expect(getEditorDocumentPath(tab)).toBe("C:\\notes\\readme.md");
    expect(matchesEditorDocumentPath(tab, "C:/notes/readme.md")).toBe(true);
  });

  it("creates a stable non-file identity for an unnamed tab", () => {
    const tab = { id: "tab-1", filePath: null };
    const path = getEditorDocumentPath(tab);

    expect(path).toBe("keep-notes-untitled://tab-1");
    expect(isUntitledDocumentPath(path)).toBe(true);
    expect(matchesEditorDocumentPath(tab, path)).toBe(true);
  });
});
