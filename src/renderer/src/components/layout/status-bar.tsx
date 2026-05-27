import { useEditorStore } from "@/store/editor.store";
import { cn } from "@/lib/cn";

export function StatusBar() {
  const { wordCount, filePath, isDirty } = useEditorStore();

  return (
    <div className="flex items-center justify-between h-[28px] px-4 bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm border-t border-[#e5e5e5] dark:border-[#333] text-[11px] text-[#888] select-none">
      {/* 左侧 */}
      <div className="flex items-center gap-4">
        {filePath && (
          <>
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  isDirty ? "bg-[#f0a020]" : "bg-[#52c41a]",
                )}
              />
              {isDirty ? "未保存" : "已保存"}
            </span>
            <span>{wordCount} 字</span>
          </>
        )}
      </div>

      {/* 右侧 */}
      <div className="flex items-center gap-4">
        {filePath && (
          <>
            <span>UTF-8</span>
            <span>Markdown</span>
          </>
        )}
      </div>
    </div>
  );
}
