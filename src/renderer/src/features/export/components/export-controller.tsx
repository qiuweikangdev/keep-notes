import { useEffect } from "react";

const EXPORT_REQUEST_EVENT = "keep-notes:export-file";
const EXPORT_SUCCESS_EVENT = "keep-notes:export-success";

interface ExportRequestDetail {
  filePath: string;
}

function isExportRequestDetail(detail: unknown): detail is ExportRequestDetail {
  return (
    typeof detail === "object" &&
    detail !== null &&
    "filePath" in detail &&
    typeof (detail as ExportRequestDetail).filePath === "string" &&
    (detail as ExportRequestDetail).filePath.length > 0
  );
}

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
}

export function ExportController() {
  useEffect(() => {
    const handleExportRequest = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!isExportRequestDetail(detail)) return;

      void window.electronAPI
        .exportFile(detail.filePath)
        .then((result) => {
          const firstFilePath = result.filePaths[0] ?? detail.filePath;
          window.dispatchEvent(
            new CustomEvent(EXPORT_SUCCESS_EVENT, {
              detail: {
                directoryPath: result.directoryPath,
                fileName: getFileName(firstFilePath),
              },
            }),
          );
        })
        .catch((error: unknown) => {
          console.error("Failed to export file:", error);
        });
    };

    window.addEventListener(EXPORT_REQUEST_EVENT, handleExportRequest);
    return () => {
      window.removeEventListener(EXPORT_REQUEST_EVENT, handleExportRequest);
    };
  }, []);

  return null;
}
