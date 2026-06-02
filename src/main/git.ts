import { simpleGit, SimpleGit, StatusResult, BranchSummary } from "simple-git";
import dayjs from "dayjs";
import { CodeResult } from "../shared/types";
import type {
  ApiResponse,
  GitConfig,
  GitStatus,
  GitBranch,
  GitCommitOptions,
  GitDetectResult,
} from "../shared/types";

// 获取 Git 实例
function getGitInstance(baseDir: string): SimpleGit {
  return simpleGit({ baseDir });
}

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
    return {
      code: CodeResult.Success,
      data: {
        current: status.current || "",
        tracking: status.tracking || "",
        files: status.files.map((f) => ({
          path: f.path,
          index: f.index,
          working_dir: f.working_dir,
        })),
        ahead: status.ahead,
        behind: status.behind,
        created: status.created,
        not_added: status.not_added,
        modified: status.modified,
        deleted: status.deleted,
        renamed: status.renamed.map((r) => ({
          from: r.from,
          to: r.to,
        })),
        staged: status.staged,
        conflicted: status.conflicted,
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

    await Promise.all([
      git.pull(),
      git.addConfig("user.name", gitConfig.username),
      git.addConfig("user.email", gitConfig.email),
      git.add("."),
      git.commit(commitMessage),
      git.push("origin", "HEAD"),
    ]);

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
