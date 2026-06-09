import { describe, expect, it } from "vitest";

import { toGitRelativePath } from "./editor-git-actions";

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
});
