import { beforeEach, describe, expect, it, vi } from "vitest";
import { CodeResult } from "../shared/types";
import { getFileHeadContent } from "./git";

const gitMocks = vi.hoisted(() => ({
  raw: vi.fn(),
  simpleGit: vi.fn(),
}));

vi.mock("simple-git", () => ({
  simpleGit: gitMocks.simpleGit,
}));

describe("git file content", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    gitMocks.simpleGit.mockReturnValue({ raw: gitMocks.raw });
  });

  it("reads the staged file content from the Git index", async () => {
    gitMocks.raw.mockResolvedValue("index content");

    const result = await getFileHeadContent(
      "D:/notes",
      "docs\\changed.md",
      "INDEX",
    );

    expect(gitMocks.raw).toHaveBeenCalledWith(["show", ":docs/changed.md"]);
    expect(result).toEqual({
      code: CodeResult.Success,
      data: "index content",
    });
  });
});
