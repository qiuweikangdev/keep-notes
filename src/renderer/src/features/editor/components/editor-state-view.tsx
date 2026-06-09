import { AlertCircle, FileText, Loader2 } from "lucide-react";

interface EditorStateViewProps {
  status: "loading" | "error" | "empty";
  fileName?: string;
  message?: string | null;
  onRetry?: () => void;
}

export function EditorStateView({
  status,
  fileName,
  message,
  onRetry,
}: EditorStateViewProps) {
  if (status === "loading") {
    return (
      <div
        className="mx-auto w-full max-w-[760px] px-12 py-16"
        data-testid="editor-loading-skeleton"
        role="status"
        aria-label={`正在加载 ${fileName ?? "文件"}`}
      >
        <div className="mb-8 flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          正在加载 {fileName}
        </div>
        {[72, 96, 84, 92, 58].map((width) => (
          <div
            key={width}
            className="mb-4 h-3 rounded bg-[var(--bg-secondary)]"
            style={{ width: `${width}%` }}
          />
        ))}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex h-full items-center justify-center p-8" role="alert">
        <div className="max-w-sm text-center">
          <AlertCircle className="mx-auto mb-3 h-6 w-6 text-red-500" />
          <p className="text-sm font-medium text-[var(--text-primary)]">
            无法打开 {fileName}
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{message}</p>
          {onRetry ? (
            <button
              type="button"
              className="mt-4 rounded-md border border-[var(--border-color)] px-3 py-1.5 text-xs"
              onClick={onRetry}
            >
              重试加载
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center text-center">
      <div>
        <FileText className="mx-auto mb-3 h-7 w-7 text-[var(--text-muted)]" />
        <p className="text-sm text-[var(--text-secondary)]">没有打开的文件</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          从文件树选择 Markdown 文件开始编辑
        </p>
      </div>
    </div>
  );
}
