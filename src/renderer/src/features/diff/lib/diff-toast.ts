export const DIFF_TOAST_AUTO_CLOSE_MS = 3000;
export const DIFF_NO_DIFF_MESSAGE = "暂无差异内容";
export const DIFF_NO_CHANGES_MESSAGE = "暂无更改内容";
export const DIFF_TOAST_EVENT = "keep-notes:diff-toast";

interface DiffToastDetail {
  message: string;
}

export function showDiffToast(message: string) {
  window.dispatchEvent(
    new CustomEvent<DiffToastDetail>(DIFF_TOAST_EVENT, {
      detail: { message },
    }),
  );
}

export function showNoDiffChangesToast() {
  showDiffToast(DIFF_NO_CHANGES_MESSAGE);
}

export function showNoDiffContentToast() {
  showDiffToast(DIFF_NO_DIFF_MESSAGE);
}

export function isDiffToastDetail(detail: unknown): detail is DiffToastDetail {
  return (
    typeof detail === "object" &&
    detail !== null &&
    "message" in detail &&
    typeof (detail as DiffToastDetail).message === "string" &&
    (detail as DiffToastDetail).message.length > 0
  );
}
