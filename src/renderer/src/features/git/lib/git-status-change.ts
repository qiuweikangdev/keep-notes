export const GIT_STATUS_CHANGE_EVENT = "keep-notes:git-status-change";

export interface GitStatusChangeDetail {
  repositoryRoot: string;
}

// Git 状态由多个弹窗入口修改，通过事件通知已打开的 Git 面板重新读取状态。
export function notifyGitStatusChange(repositoryRoot: string) {
  window.dispatchEvent(
    new CustomEvent<GitStatusChangeDetail>(GIT_STATUS_CHANGE_EVENT, {
      detail: { repositoryRoot },
    }),
  );
}

export function isGitStatusChangeDetail(
  detail: unknown,
): detail is GitStatusChangeDetail {
  return (
    typeof detail === "object" &&
    detail !== null &&
    "repositoryRoot" in detail &&
    typeof (detail as GitStatusChangeDetail).repositoryRoot === "string" &&
    (detail as GitStatusChangeDetail).repositoryRoot.length > 0
  );
}
