import { MilkdownEditor } from "./milkdown-editor";
import { useEditorStore } from "@/store/editor.store";
import { FileText, X } from "lucide-react";

export function Editor() {
  const { filePath, isDirty, setFilePath, resetEditor } = useEditorStore();
  const fileName = filePath?.split(/[\\/]/).pop() || "";

  const handleClose = () => {
    setFilePath(null);
    resetEditor();
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* 文件标签 */}
      {filePath && (
        <div
          className="flex h-10 flex-shrink-0 items-center px-2"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div
            className="group flex h-7 items-center gap-2 rounded-md px-2.5 text-xs"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
            }}
            title={filePath}
          >
            <FileText
              className="h-3.5 w-3.5"
              style={{ color: "var(--text-muted)" }}
            />
            <span
              className="max-w-[220px] truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {fileName}
            </span>
            {isDirty ? (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: "var(--accent-color)" }}
              />
            ) : null}
            <button
              onClick={handleClose}
              className="ml-1 rounded p-0.5 opacity-0 transition-all group-hover:opacity-100"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* 编辑器内容 - 支持滚动 */}
      <div className="flex-1 overflow-hidden">
        <MilkdownEditor />
      </div>
    </div>
  );
}
