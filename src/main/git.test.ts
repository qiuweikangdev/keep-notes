import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  env: vi.fn(),
  raw: vi.fn(),
  simpleGit: vi.fn(),
  status: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

vi.mock("simple-git", () => ({
  simpleGit: gitMocks.simpleGit,
}));

describe("git branch operations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    gitMocks.simpleGit.mockReturnValue({
      branchLocal: gitMocks.branchLocal,
      deleteLocalBranch: gitMocks.deleteLocalBranch,
      env: gitMocks.env,
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
      env: gitMocks.env,
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
      env: gitMocks.env,
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
    expect(gitMocks.simpleGit).toHaveBeenCalledTimes(2);
    expect(gitMocks.simpleGit.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        config: expect.arrayContaining([
          "http.lowSpeedLimit=1",
          "http.lowSpeedTime=30",
        ]),
        timeout: { block: 120_000 },
      }),
    );
    const environment = gitMocks.env.mock.calls[0]?.[0] as
      | NodeJS.ProcessEnv
      | undefined;
    expect(environment?.GIT_TERMINAL_PROMPT).toBe("0");
    expect(result.code).toBe(CodeResult.Success);
  });

  it("uses the current HEAD for standalone pushes", async () => {
    const result = await push("/notes");

    expect(gitMocks.branchLocal).not.toHaveBeenCalled();
    expect(gitMocks.raw).toHaveBeenCalledWith(["push", "origin", "HEAD"]);
    expect(result.code).toBe(CodeResult.Success);
  });

  it("preserves the inherited environment needed by proxies and SSH authentication", async () => {
    vi.stubEnv("HTTPS_PROXY", "http://proxy.invalid:8080");
    vi.stubEnv("SSH_AUTH_SOCK", "/tmp/keep-notes-test-agent.sock");
    vi.stubEnv("PATH", "/keep-notes-test/bin");
    vi.stubEnv("GIT_SSH_COMMAND", "ssh -o BatchMode=yes");
    vi.stubEnv("GIT_ASKPASS", "/keep-notes-test/askpass");
    vi.stubEnv("PAGER", "");

    await push("/notes");

    const environment = gitMocks.env.mock.calls[0]?.[0] as
      | NodeJS.ProcessEnv
      | undefined;
    // 逐项断言测试注入的值，失败时也不把整个进程环境输出到测试日志。
    expect(environment?.HTTPS_PROXY).toBe("http://proxy.invalid:8080");
    expect(environment?.SSH_AUTH_SOCK).toBe("/tmp/keep-notes-test-agent.sock");
    expect(environment?.PATH).toBe("/keep-notes-test/bin");
    expect(environment?.GIT_SSH_COMMAND).toBe("ssh -o BatchMode=yes");
    expect(environment?.GIT_ASKPASS).toBe("/keep-notes-test/askpass");
    expect(environment?.GIT_TERMINAL_PROMPT).toBe("0");
    expect(gitMocks.simpleGit).toHaveBeenCalledWith(
      expect.objectContaining({
        unsafe: expect.objectContaining({
          allowUnsafeSshCommand: true,
          allowUnsafeAskPass: true,
          allowUnsafePager: true,
        }),
      }),
    );
  });

  it("reports that the local commit succeeded when the following push fails", async () => {
    gitMocks.raw.mockRejectedValueOnce(new Error("network unavailable"));

    const result = await commit("/notes", {
      message: "test: preserve local commit",
      files: [],
      push: true,
    });

    expect(gitMocks.commit).toHaveBeenCalledOnce();
    expect(result).toEqual({
      code: CodeResult.Fail,
      message: "提交成功，但推送失败：Error: network unavailable",
    });
  });

  it("returns a retryable message when a remote operation times out", async () => {
    gitMocks.raw.mockRejectedValueOnce(
      new Error("GitPluginError: block timeout reached"),
    );

    const result = await push("/notes");

    expect(result).toEqual({
      code: CodeResult.Fail,
      message: "GitHub 远程操作超时，请检查网络、代理或 GitHub 凭据后重试",
    });
  });
});
