import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, FolderOpen, X } from "lucide-react";

const AUTO_CLOSE_DELAY = 8_000;
const EXPORT_SUCCESS_EVENT = "keep-notes:export-success";

interface ExportSuccessDetail {
  directoryPath: string;
  fileName?: string;
}

function isExportSuccessDetail(detail: unknown): detail is ExportSuccessDetail {
  return (
    typeof detail === "object" &&
    detail !== null &&
    "directoryPath" in detail &&
    typeof (detail as ExportSuccessDetail).directoryPath === "string" &&
    (detail as ExportSuccessDetail).directoryPath.length > 0
  );
}

export function ExportSuccessToast() {
  const [successDetail, setSuccessDetail] =
    useState<ExportSuccessDetail | null>(null);

  useEffect(() => {
    const handleExportSuccess = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!isExportSuccessDetail(detail)) return;
      setSuccessDetail(detail);
    };

    window.addEventListener(EXPORT_SUCCESS_EVENT, handleExportSuccess);
    return () => {
      window.removeEventListener(EXPORT_SUCCESS_EVENT, handleExportSuccess);
    };
  }, []);

  useEffect(() => {
    if (!successDetail) return;

    // 导出成功提示短暂停留，避免遮挡用户继续操作。
    const timer = window.setTimeout(
      () => setSuccessDetail(null),
      AUTO_CLOSE_DELAY,
    );
    return () => window.clearTimeout(timer);
  }, [successDetail]);

  if (!successDetail) return null;

  const handleOpenDirectory = async () => {
    await window.electronAPI.openInExplorer(successDetail.directoryPath);
  };

  // 通过 Portal 脱离应用透明度容器，确保导出结果始终清晰可见。
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="fixed right-5 top-12 z-[90] w-[360px] max-w-[calc(100vw-40px)] overflow-hidden rounded-xl border shadow-2xl"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-color)",
        color: "var(--text-primary)",
      }}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <CheckCircle2
          className="mt-0.5 h-5 w-5 flex-shrink-0"
          style={{ color: "var(--accent-color)" }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">导出成功</div>
          {successDetail.fileName ? (
            <div
              className="mt-0.5 truncate text-[12px]"
              style={{ color: "var(--text-muted)" }}
            >
              {successDetail.fileName}
            </div>
          ) : null}
          <div
            className="mt-1 truncate text-[12px]"
            style={{ color: "var(--text-muted)" }}
            title={successDetail.directoryPath}
          >
            {successDetail.directoryPath}
          </div>
        </div>
        <button
          type="button"
          aria-label="打开导出目录"
          title="打开导出目录"
          data-theme-control="true"
          className="rounded-md p-1 transition-colors hover:bg-[var(--hover-bg)]"
          style={{ color: "var(--text-muted)" }}
          onClick={() => void handleOpenDirectory()}
        >
          <FolderOpen className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="关闭导出提示"
          data-theme-control="true"
          className="rounded-md p-1 transition-colors hover:bg-[var(--hover-bg)]"
          style={{ color: "var(--text-muted)" }}
          onClick={() => setSuccessDetail(null)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
