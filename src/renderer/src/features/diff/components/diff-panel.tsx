import { X } from "lucide-react";
import { useDiffPanelStore } from "../store/diff-panel.store";
import { DiffViewer } from "./diff-viewer";

export function DiffPanel() {
  const { filePath, oldContent, newContent, close } = useDiffPanelStore();

  if (!filePath) return null;

  const fileName = filePath.split(/[\\/]/).pop() || "文件";

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
        borderLeft: "1px solid var(--border-color)",
      }}
    >
      <div
        className="flex flex-shrink-0 items-center justify-between border-b px-3 py-2"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">
          {fileName} 差异
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="关闭差异面板"
          className="ml-2 rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
          style={{ color: "var(--text-muted)" }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <DiffViewer
          oldContent={oldContent}
          newContent={newContent}
          fileName={fileName}
          oldTitle={`${fileName} (HEAD)`}
          newTitle={`${fileName} (编辑器)`}
        />
      </div>
    </div>
  );
}
