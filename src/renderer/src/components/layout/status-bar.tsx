import { useEditorStore } from "@/store/editor.store";

export function StatusBar() {
  const { wordCount, filePath, isDirty } = useEditorStore();

  return (
    <div
      className="flex items-center justify-between h-[26px] px-4 text-[11px] select-none flex-shrink-0"
      style={{
        backgroundColor: "var(--bg-primary)",
        borderTop: "1px solid var(--border-color)",
        color: "var(--text-secondary)",
      }}
    >
      {/* 左侧 */}
      <div className="flex items-center gap-4">
        {filePath && (
          <>
            <span className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: isDirty ? "#fa8c16" : "#52c41a",
                }}
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
