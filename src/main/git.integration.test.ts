import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { expect, it, vi } from "vitest";
import { CodeResult } from "../shared/types";
import { commit, push } from "./git";

const execute = promisify(execFile);

it("commits and pushes to a local remote with the inherited hook environment", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "keep-notes-git-chain-"),
  );
  const workingTree = path.join(root, "work");
  const remote = path.join(root, "remote.git");
  const git = (args: string[]) => execute("git", args, { cwd: root });

  try {
    await git(["init", "--bare", remote]);
    await git(["init", "--initial-branch=main", workingTree]);
    await git(["-C", workingTree, "config", "user.name", "Git chain test"]);
    await git(["-C", workingTree, "config", "user.email", "test@invalid.test"]);
    await git(["-C", workingTree, "config", "core.hooksPath", ".git/hooks"]);
    await git(["-C", workingTree, "config", "commit.gpgsign", "false"]);
    await git(["-C", workingTree, "remote", "add", "origin", remote]);
    const hook = path.join(workingTree, ".git/hooks/pre-push");
    // hook 不输出环境内容；旧链路丢失此变量时会拒绝推送。
    await fs.writeFile(
      hook,
      '#!/bin/sh\ntest "$KEEP_NOTES_GIT_ENV_PROBE" = "preserved"\n',
      { mode: 0o755 },
    );
    vi.stubEnv("KEEP_NOTES_GIT_ENV_PROBE", "preserved");
    // 显式的空 pager 也是继承环境，不能被 simple-git 的校验错误拒绝。
    vi.stubEnv("PAGER", "");
    await fs.writeFile(path.join(workingTree, "note.md"), "first version\n");

    const result = await commit(workingTree, {
      message: "test: exercise commit and push",
      files: ["note.md"],
      push: true,
    });
    expect(result.code).toBe(CodeResult.Success);
    const localHead = await git(["-C", workingTree, "rev-parse", "HEAD"]);
    const remoteHead = await git([
      "--git-dir",
      remote,
      "rev-parse",
      "refs/heads/main",
    ]);
    expect(remoteHead.stdout.trim()).toBe(localHead.stdout.trim());

    expect((await push(workingTree)).code).toBe(CodeResult.Success);
    const commits = await git([
      "-C",
      workingTree,
      "rev-list",
      "--count",
      "HEAD",
    ]);
    expect(commits.stdout.trim()).toBe("1");
  } finally {
    vi.unstubAllEnvs();
    await fs.rm(root, { recursive: true, force: true });
  }
});
