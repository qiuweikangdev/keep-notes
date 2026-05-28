import { MilkdownEditor } from "./milkdown-editor";
import { useEditorStore } from "@/store/editor.store";
import { FileText, X } from "lucide-react";

export function Editor() {
  const { filePath, setFilePath, resetEditor } = useEditorStore();
  const fileName =
    filePath?.split("/").pop() || filePath?.split("\\").pop() || "";

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
          className="flex items-center h-[36px] px-2 flex-shrink-0"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div
            className="flex items-center gap-2 px-3 py-1 rounded-md text-xs group"
            style={{
              backgroundColor: "var(--bg-primary)",
              border: "1px solid var(--border-color)",
            }}
          >
            <FileText
              className="h-3.5 w-3.5"
              style={{ color: "var(--accent-color)" }}
            />
            <span
              className="max-w-[150px] truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {fileName}
            </span>
            <button
              onClick={handleClose}
              className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-all"
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
