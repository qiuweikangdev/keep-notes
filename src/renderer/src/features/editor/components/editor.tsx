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
    <div className="flex flex-col h-full bg-white dark:bg-[#1a1a1a]">
      {/* 文件标签 */}
      {filePath && (
        <div className="flex items-center h-[36px] px-2 bg-[#f5f5f5] dark:bg-[#222] border-b border-[#e5e5e5] dark:border-[#333]">
          <div className="flex items-center gap-2 px-3 py-1 bg-white dark:bg-[#1a1a1a] rounded-md border border-[#e5e5e5] dark:border-[#333] text-xs group">
            <FileText className="h-3.5 w-3.5 text-[#0066ff]" />
            <span className="max-w-[150px] truncate text-[#333] dark:text-[#eee]">
              {fileName}
            </span>
            <button
              onClick={handleClose}
              className="ml-1 p-0.5 rounded hover:bg-[#f0f0f0] dark:hover:bg-[#333] text-[#bbb] hover:text-[#666] dark:hover:text-[#aaa] opacity-0 group-hover:opacity-100 transition-all"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* 编辑器内容 */}
      <div className="flex-1 overflow-hidden">
        <MilkdownEditor />
      </div>
    </div>
  );
}
