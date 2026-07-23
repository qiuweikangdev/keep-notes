import { beforeEach, describe, expect, it, vi } from "vitest";
import { CodeResult } from "../shared/types";
import { commit, discardChanges, getFileHeadContent } from "./git";

const gitMocks = vi.hoisted(() => ({
  add: vi.fn(),
  checkout: vi.fn(),
  commit: vi.fn(),
  raw: vi.fn(),
  simpleGit: vi.fn(),
  status: vi.fn(),
}));

vi.mock("simple-git", () => ({
  simpleGit: gitMocks.simpleGit,
}));

describe("git file content", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    gitMocks.simpleGit.mockReturnValue({
      add: gitMocks.add,
      checkout: gitMocks.checkout,
      commit: gitMocks.commit,
      raw: gitMocks.raw,
      status: gitMocks.status,
    });
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

describe("git working tree operations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    gitMocks.simpleGit.mockReturnValue({
      add: gitMocks.add,
      checkout: gitMocks.checkout,
      commit: gitMocks.commit,
      raw: gitMocks.raw,
      status: gitMocks.status,
    });
  });

  it("discards only the working tree changes of a partially staged file", async () => {
    gitMocks.status.mockResolvedValue({
      created: [],
      not_added: [],
      staged: ["partially-staged.md"],
    });

    const result = await discardChanges("/notes", "partially-staged.md");

    expect(gitMocks.checkout).toHaveBeenCalledWith([
      "--",
      "partially-staged.md",
    ]);
    expect(result).toEqual({
      code: CodeResult.Success,
      message: "已放弃工作区更改",
    });
  });

  it("commits the current index without staging remaining changes", async () => {
    const result = await commit("/notes", {
      message: "test: keep staged boundary",
      files: [],
    });

    expect(gitMocks.add).not.toHaveBeenCalled();
    expect(gitMocks.commit).toHaveBeenCalledWith("test: keep staged boundary");
    expect(result.code).toBe(CodeResult.Success);
  });

  it("stages all working tree changes when commit files are omitted", async () => {
    const result = await commit("/notes", {
      message: "test: include working tree",
    });

    expect(gitMocks.add).toHaveBeenCalledWith(".");
    expect(gitMocks.commit).toHaveBeenCalledWith("test: include working tree");
    expect(result.code).toBe(CodeResult.Success);
  });
});
