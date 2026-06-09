import { describe, expect, it } from "vitest";

import { hasNoHeadVersion, toGitRelativePath } from "./editor-git-actions";

describe("toGitRelativePath", () => {
  it("returns a forward-slash path relative to the repository root", () => {
    expect(
      toGitRelativePath(
        "D:\\workspace\\notes",
        "D:\\workspace\\notes\\docs\\readme.md",
      ),
    ).toBe("docs/readme.md");
  });

  it("keeps an already relative path normalized", () => {
    expect(toGitRelativePath("D:\\workspace\\notes", "docs\\readme.md")).toBe(
      "docs/readme.md",
    );
  });

  it("detects files that do not have a HEAD version", () => {
    expect(
      hasNoHeadVersion(
        {
          created: [],
          not_added: ["docs/new-note.md"],
        },
        "docs\\new-note.md",
      ),
    ).toBe(true);
  });

  it("does not treat an ordinary modified file as a new file", () => {
    expect(
      hasNoHeadVersion(
        {
          created: [],
          not_added: [],
        },
        "docs/readme.md",
      ),
    ).toBe(false);
  });
});
