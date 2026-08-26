import { beforeEach, describe, expect, it, vi } from "vitest";
import { CodeResult } from "../shared/types";
import {
  commit,
  deleteBranch,
  discardChanges,
  getFileHeadContent,
  push,
  renameBranch,
} from "./git";

const gitMocks = vi.hoisted(() => ({
  add: vi.fn(),
  branchLocal: vi.fn(),
  checkout: vi.fn(),
  commit: vi.fn(),
  deleteLocalBranch: vi.fn(),
  raw: vi.fn(),
  simpleGit: vi.fn(),
  status: vi.fn(),
}));

vi.mock("simple-git", () => ({
  simpleGit: gitMocks.simpleGit,
}));

describe("git branch operations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    gitMocks.simpleGit.mockReturnValue({
      branchLocal: gitMocks.branchLocal,
      deleteLocalBranch: gitMocks.deleteLocalBranch,
      raw: gitMocks.raw,
    });
  });

  it("renames a local branch", async () => {
    const result = await renameBranch("/notes", "feature/old", "feature/new");

    expect(gitMocks.raw).toHaveBeenCalledWith([
      "branch",
      "-m",
      "feature/old",
      "feature/new",
    ]);
    expect(result).toEqual({
      code: CodeResult.Success,
      message: "已将分支 feature/old 重命名为 feature/new",
    });
  });

  it("refuses to delete the current branch", async () => {
    gitMocks.branchLocal.mockResolvedValue({ current: "develop" });

    const result = await deleteBranch("/notes", "develop");

    expect(gitMocks.deleteLocalBranch).not.toHaveBeenCalled();
    expect(result).toEqual({
      code: CodeResult.Fail,
      message: "不能删除当前分支，请先切换到其他分支",
    });
  });

  it("uses Git safe deletion for a non-current branch", async () => {
    gitMocks.branchLocal.mockResolvedValue({ current: "develop" });

    const result = await deleteBranch("/notes", "feature/merged");

    expect(gitMocks.deleteLocalBranch).toHaveBeenCalledWith("feature/merged");
    expect(result).toEqual({
      code: CodeResult.Success,
      message: "已删除分支: feature/merged",
    });
  });
});

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

  it("pushes the current HEAD without resolving the local branch", async () => {
    const result = await commit("/notes", {
      message: "test: push current head",
      files: [],
      push: true,
    });

    expect(gitMocks.branchLocal).not.toHaveBeenCalled();
    expect(gitMocks.raw).toHaveBeenCalledWith(["push", "origin", "HEAD"]);
    expect(result.code).toBe(CodeResult.Success);
  });

  it("uses the current HEAD for standalone pushes", async () => {
    const result = await push("/notes");

    expect(gitMocks.branchLocal).not.toHaveBeenCalled();
    expect(gitMocks.raw).toHaveBeenCalledWith(["push", "origin", "HEAD"]);
    expect(result.code).toBe(CodeResult.Success);
  });
});
