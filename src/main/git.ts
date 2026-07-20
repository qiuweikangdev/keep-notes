import { simpleGit, SimpleGit, StatusResult, BranchSummary } from "simple-git";
import dayjs from "dayjs";
import path from "node:path";
import { CodeResult } from "../shared/types";
import type {
  ApiResponse,
  GitConfig,
  GitStatus,
  GitBranch,
  GitCommitOptions,
  GitDetectResult,
  GitCommitChangedFile,
  GitCommitDetail,
  GitCommitFileContent,
  GitCommitFileStatus,
  GitCommitLogItem,
} from "../shared/types";

// 获取 Git 实例
function getGitInstance(baseDir: string): SimpleGit {
  return simpleGit({
    baseDir,
    binary: "git",
    // 仅为当前 Git 子进程关闭路径转义，避免读取状态时反复写入 .git/config。
    config: ["core.quotepath=false"],
  });
}

const normalizeGitPath = (p: string) => p.replace(/\\/g, "/");

const getGitErrorMessage = (e: unknown) =>
  e instanceof Error ? e.toString() : String(e);

const toCommitFileStatus = (statusCode: string): GitCommitFileStatus => {
  const status = statusCode.charAt(0);
  if (
    status === "A" ||
    status === "M" ||
    status === "D" ||
    status === "R" ||
    status === "C" ||
    status === "U"
  ) {
    return status;
  }
  return "M";
};

const readCommitFileContent = async (
  git: SimpleGit,
  ref: string,
  filePath: string,
) => {
  try {
    return await git.raw(["show", `${ref}:${normalizeGitPath(filePath)}`]);
  } catch {
    return "";
  }
};

// 检测是否为 Git 仓库
export async function detectGitRepo(
  dirPath: string,
): Promise<ApiResponse<GitDetectResult>> {
  try {
    const git = getGitInstance(dirPath);
    const isRepo = await git.checkIsRepo();
    return {
      code: CodeResult.Success,
      data: {
        isGitRepo: isRepo,
        currentPath: dirPath,
      },
    };
  } catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
      data: {
        isGitRepo: false,
        currentPath: dirPath,
      },
    };
  }
}

// 获取当前分支
export async function getCurrentBranch(
  dirPath: string,
): Promise<ApiResponse<string>> {
  try {
    const git = getGitInstance(dirPath);
    const branch = await git.branchLocal();
    return {
      code: CodeResult.Success,
      data: branch.current,
    };
  } catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
    };
  }
}

// 获取所有分支
export async function getBranches(
  dirPath: string,
): Promise<ApiResponse<GitBranch[]>> {
  try {
    const git = getGitInstance(dirPath);
    const branchSummary: BranchSummary = await git.branchLocal();
    const branches: GitBranch[] = branchSummary.all.map((branchName) => ({
      name: branchName,
      current: branchName === branchSummary.current,
    }));
    return {
      code: CodeResult.Success,
      data: branches,
    };
  } catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
    };
  }
}

// 切换分支
export async function switchBranch(
  dirPath: string,
  branchName: string,
): Promise<ApiResponse> {
  try {
    const git = getGitInstance(dirPath);
    await git.checkout(branchName);
    return {
      code: CodeResult.Success,
      message: `已切换到分支: ${branchName}`,
    };
  } catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
    };
  }
}

// 创建新分支
export async function createBranch(
  dirPath: string,
  branchName: string,
): Promise<ApiResponse> {
  try {
    const git = getGitInstance(dirPath);
    await git.checkoutLocalBranch(branchName);
    return {
      code: CodeResult.Success,
      message: `已创建并切换到分支: ${branchName}`,
    };
  } catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
    };
  }
}

// 获取 Git 状态
export async function getStatus(
  dirPath: string,
): Promise<ApiResponse<GitStatus>> {
  try {
    const git = getGitInstance(dirPath);
    const status: StatusResult = await git.status();

    // 确保路径使用正斜杠
    const normalizePath = (p: string) => p.replace(/\\/g, "/");

    return {
      code: CodeResult.Success,
      data: {
        current: status.current || "",
        tracking: status.tracking || "",
        files: status.files.map((f) => ({
          path: normalizePath(f.path),
          index: f.index,
          working_dir: f.working_dir,
        })),
        ahead: status.ahead,
        behind: status.behind,
        created: status.created.map(normalizePath),
        not_added: status.not_added.map(normalizePath),
        modified: status.modified.map(normalizePath),
        deleted: status.deleted.map(normalizePath),
        renamed: status.renamed.map((r) => ({
          from: normalizePath(r.from),
          to: normalizePath(r.to),
        })),
        staged: status.staged.map(normalizePath),
        conflicted: status.conflicted.map(normalizePath),
      },
    };
  } catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
    };
  }
}

// 添加文件到暂存区
export async function addFiles(
  dirPath: string,
  files: string[],
): Promise<ApiResponse> {
  try {
    const git = getGitInstance(dirPath);
    if (files.length === 0) {
      await git.add(".");
    } else {
      await git.add(files);
    }
    return {
      code: CodeResult.Success,
      message: "文件已添加到暂存区",
    };
  } catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
    };
  }
}

// 取消文件暂存
export async function unstageFiles(
  dirPath: string,
  files: string[],
): Promise<ApiResponse> {
  try {
    const git = getGitInstance(dirPath);
    await git.reset(["HEAD", ...files]);
    return {
      code: CodeResult.Success,
      message: "已取消暂存",
    };
  } catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
    };
  }
}

// 提交更改
export async function commit(
  dirPath: string,
  options: GitCommitOptions,
): Promise<ApiResponse> {
  try {
    const git = getGitInstance(dirPath);
    const commitMessage =
      options.message || dayjs().format("YYYY-MM-DD HH:mm:ss");

    // 如果指定了文件，只添加这些文件；否则添加所有文件
    if (options.files && options.files.length > 0) {
      await git.add(options.files);
    } else {
      await git.add(".");
    }

    // 提交
    await git.commit(commitMessage);

    // 如果需要推送
    if (options.push) {
      const branchSummary = await git.branchLocal();
      const currentBranch = branchSummary.current;
      await git.push("origin", currentBranch);
    }

    return {
      code: CodeResult.Success,
      message: options.push ? "提交并推送成功" : "提交成功",
    };
  } catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
    };
  }
}

// 推送到远程
export async function push(dirPath: string): Promise<ApiResponse> {
  try {
    const git = getGitInstance(dirPath);
    const branchSummary = await git.branchLocal();
    const currentBranch = branchSummary.current;
    await git.push("origin", currentBranch);
    return {
      code: CodeResult.Success,
      message: "推送成功",
    };
  } catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
    };
  }
}

// 从远程拉取
export async function pull(dirPath: string): Promise<ApiResponse> {
  try {
    const git = getGitInstance(dirPath);
    await git.pull();
    return {
      code: CodeResult.Success,
      message: "拉取成功",
    };
  } catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
    };
  }
}

// 获取 Git 提交历史
export async function getCommitHistory(
  dirPath: string,
  skip = 0,
  limit = 5,
): Promise<ApiResponse<GitCommitLogItem[]>> {
  try {
    const git = getGitInstance(dirPath);
    const safeSkip = Math.max(0, skip);
    const safeLimit = Math.max(1, limit);
    const output = await git.raw([
      "log",
      `--skip=${safeSkip}`,
      `--max-count=${safeLimit}`,
      "--date=iso-strict",
      "--pretty=format:%H%x1f%h%x1f%an%x1f%ae%x1f%ad%x1f%s",
    ]);

    // 使用不可见分隔符解析，避免提交信息中的空格影响字段拆分。
    const commits = output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [hash, shortHash, authorName, authorEmail, date, subject] =
          line.split("\x1f");
        return {
          hash,
          shortHash,
          authorName,
          authorEmail,
          date,
          subject,
        };
      });

    return {
      code: CodeResult.Success,
      data: commits,
    };
  } catch (e: unknown) {
    const message = getGitErrorMessage(e);
    if (
      message.includes("does not have any commits") ||
      message.includes("your current branch") ||
      message.includes("ambiguous argument 'HEAD'")
    ) {
      return {
        code: CodeResult.Success,
        data: [],
      };
    }

    return {
      code: CodeResult.Fail,
      message,
    };
  }
}

// 获取 Git 提交详情
export async function getCommitDetail(
  dirPath: string,
  hash: string,
): Promise<ApiResponse<GitCommitDetail>> {
  try {
    const git = getGitInstance(dirPath);
    const metadataOutput = await git.raw([
      "show",
      "--quiet",
      "--date=iso-strict",
      "--pretty=format:%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%ad%x1f%s%x1e%B",
      hash,
    ]);
    const [metadataRaw, body = ""] = metadataOutput.split("\x1e");
    const [
      fullHash,
      shortHash,
      parentsRaw,
      authorName,
      authorEmail,
      committerName,
      committerEmail,
      date,
      subject,
    ] = metadataRaw.split("\x1f");
    const statusOutput = await git.raw([
      "show",
      "--name-status",
      "--format=",
      "--find-renames",
      hash,
    ]);
    const numstatOutput = await git.raw([
      "show",
      "--numstat",
      "--format=",
      "--find-renames",
      hash,
    ]);
    const statsByPath = new Map<
      string,
      Pick<GitCommitChangedFile, "additions" | "deletions">
    >();

    // numstat 提供每个文件的增删行数，二进制文件会返回 "-"，统一按 0 处理。
    numstatOutput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const parts = line.split("\t");
        if (parts.length < 3) return;

        const additions = Number.parseInt(parts[0], 10);
        const deletions = Number.parseInt(parts[1], 10);
        const filePath = normalizeGitPath(parts[parts.length - 1]);
        statsByPath.set(filePath, {
          additions: Number.isFinite(additions) ? additions : 0,
          deletions: Number.isFinite(deletions) ? deletions : 0,
        });
      });

    // name-status 负责识别 A/M/D/R 等状态，重命名记录包含 old/new 两个路径。
    const files: GitCommitChangedFile[] = statusOutput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split("\t");
        const status = toCommitFileStatus(parts[0] || "M");
        const oldPath =
          status === "R" || status === "C"
            ? normalizeGitPath(parts[1] || "")
            : undefined;
        const filePath = normalizeGitPath(
          status === "R" || status === "C" ? parts[2] || "" : parts[1] || "",
        );
        const stats = statsByPath.get(filePath) || {
          additions: 0,
          deletions: 0,
        };

        return {
          path: filePath,
          oldPath,
          status,
          additions: stats.additions,
          deletions: stats.deletions,
        };
      });

    return {
      code: CodeResult.Success,
      data: {
        hash: fullHash,
        shortHash,
        parents: parentsRaw ? parentsRaw.split(" ").filter(Boolean) : [],
        authorName,
        authorEmail,
        committerName,
        committerEmail,
        date,
        subject,
        body: body.trim(),
        files,
      },
    };
  } catch (e: unknown) {
    return {
      code: CodeResult.Fail,
      message: getGitErrorMessage(e),
    };
  }
}

// 获取提交中文件变更前后的内容
export async function getCommitFileContent(
  dirPath: string,
  hash: string,
  filePath: string,
  status: GitCommitFileStatus,
  oldPath?: string,
): Promise<ApiResponse<GitCommitFileContent>> {
  try {
    const git = getGitInstance(dirPath);
    const parentsOutput = await git.raw([
      "rev-list",
      "--parents",
      "-n",
      "1",
      hash,
    ]);
    const [, firstParent] = parentsOutput.trim().split(/\s+/);
    const contentPath = normalizeGitPath(filePath);
    const previousPath = normalizeGitPath(oldPath || filePath);

    // 历史记录对比以第一父提交为基准；新增/删除文件分别用空内容表示另一侧。
    const oldContent =
      firstParent && status !== "A"
        ? await readCommitFileContent(git, firstParent, previousPath)
        : "";
    const newContent =
      status !== "D" ? await readCommitFileContent(git, hash, contentPath) : "";

    return {
      code: CodeResult.Success,
      data: {
        oldContent,
        newContent,
      },
    };
  } catch (e: unknown) {
    return {
      code: CodeResult.Fail,
      message: getGitErrorMessage(e),
    };
  }
}

// 获取文件差异
export async function getFileDiff(
  dirPath: string,
  filePath: string,
): Promise<ApiResponse<string>> {
  try {
    const git = getGitInstance(dirPath);
    const diff = await git.diff([filePath]);
    return {
      code: CodeResult.Success,
      data: diff,
    };
  } catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
    };
  }
}

// 获取文件在 HEAD 中的内容
export async function getFileHeadContent(
  dirPath: string,
  filePath: string,
): Promise<ApiResponse<string>> {
  try {
    const git = getGitInstance(dirPath);
    const relativePath = path.isAbsolute(filePath)
      ? path.relative(dirPath, filePath)
      : filePath;
    const gitPath = relativePath.replace(/\\/g, "/");
    const content = await git.raw(["show", `HEAD:${gitPath}`]);

    return {
      code: CodeResult.Success,
      data: content,
    };
  } catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
    };
  }
}

// 放弃更改
export async function discardChanges(
  dirPath: string,
  filePath: string,
): Promise<ApiResponse> {
  try {
    const git = getGitInstance(dirPath);
    const status = await git.status();

    // 判断文件属于哪种状态
    const isUntracked =
      status.not_added.includes(filePath) || status.created.includes(filePath);
    const isStaged = status.staged.includes(filePath);

    if (isUntracked) {
      // 未跟踪的文件直接删除
      const path = require("path") as typeof import("path");
      const fullPath = path.join(dirPath, filePath);
      const fs = require("fs") as typeof import("fs");
      await fs.promises.unlink(fullPath);
    } else if (isStaged) {
      // 已暂存：先取消暂存，再放弃更改
      await git.reset(["HEAD", filePath]);
      await git.checkout(["--", filePath]);
    } else {
      // 已修改但未暂存
      await git.checkout(["--", filePath]);
    }

    return {
      code: CodeResult.Success,
      message: "已放弃更改",
    };
  } catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
    };
  }
}

// 打开文件
export async function openFile(
  dirPath: string,
  filePath: string,
): Promise<ApiResponse<string>> {
  try {
    const path = require("path");
    const fullPath = path.join(dirPath, filePath);
    return {
      code: CodeResult.Success,
      data: fullPath,
    };
  } catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
    };
  }
}

// 保留原有的 download 和 upload 函数以保持向后兼容
export async function download(gitConfig: GitConfig): Promise<ApiResponse> {
  const git = getGitInstance(gitConfig.dir);
  try {
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      await git.clone(gitConfig.repoUrl, gitConfig.dir);
    } else {
      await git.pull();
    }
    return {
      code: CodeResult.Success,
      message: "下载成功！",
    };
  } catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
    };
  }
}

export async function upload(gitConfig: GitConfig): Promise<ApiResponse> {
  const git = getGitInstance(gitConfig.dir);
  try {
    const isRepo = await git.checkIsRepo();
    const commitMessage = dayjs().format("YYYY-MM-DD HH:mm:ss");

    if (!isRepo) {
      await git
        .init()
        .addConfig("user.name", gitConfig.username)
        .addConfig("user.email", gitConfig.email);
    } else {
      const status = await git.status();
      if (status.files.length === 0) {
        return {
          code: CodeResult.Fail,
          message: "没有文件发生变化",
        };
      }
    }

    // Git 的拉取、暂存、提交和推送彼此依赖，并发执行会产生索引锁竞争或推送到旧提交。
    await git.pull();
    await git.addConfig("user.name", gitConfig.username);
    await git.addConfig("user.email", gitConfig.email);
    await git.add(".");
    await git.commit(commitMessage);
    await git.push("origin", "HEAD");

    return {
      code: CodeResult.Success,
      message: "上传成功！",
    };
  } catch (e: any) {
    return {
      code: CodeResult.Fail,
      message: e.toString(),
    };
  }
}
