import { useEffect, useState, useMemo } from "react";
import { diffLines, type Change } from "@pierre/diffs";

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  oldTitle?: string;
  newTitle?: string;
  className?: string;
}

export function DiffViewer({
  oldContent,
  newContent,
  oldTitle = "原始内容",
  newTitle = "修改内容",
  className = "",
}: DiffViewerProps) {
  const [changes, setChanges] = useState<Change[]>([]);

  useEffect(() => {
    try {
      const result = diffLines(oldContent, newContent);
      setChanges(result);
    } catch (error) {
      console.error("Failed to compute diff:", error);
      setChanges([]);
    }
  }, [oldContent, newContent]);

  // 计算行号
  const lines = useMemo(() => {
    let oldLineNum = 1;
    let newLineNum = 1;
    const result: Array<{
      type: "added" | "removed" | "unchanged";
      content: string;
      oldLineNum: number | null;
      newLineNum: number | null;
    }> = [];

    for (const change of changes) {
      const lines = change.value.split("\n");
      // 移除最后一个空行（如果存在）
      if (lines[lines.length - 1] === "") {
        lines.pop();
      }

      for (const line of lines) {
        if (change.added) {
          result.push({
            type: "added",
            content: line,
            oldLineNum: null,
            newLineNum: newLineNum++,
          });
        } else if (change.removed) {
          result.push({
            type: "removed",
            content: line,
            oldLineNum: oldLineNum++,
            newLineNum: null,
          });
        } else {
          result.push({
            type: "unchanged",
            content: line,
            oldLineNum: oldLineNum++,
            newLineNum: newLineNum++,
          });
        }
      }
    }

    return result;
  }, [changes]);

  // 统计信息
  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const change of changes) {
      if (change.added) added++;
      if (change.removed) removed++;
    }
    return { added, removed };
  }, [changes]);

  return (
    <div
      className={`flex flex-col h-full overflow-hidden ${className}`}
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* 头部 */}
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <div className="flex items-center gap-4">
          <span
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {oldTitle}
          </span>
          <span style={{ color: "var(--text-muted)" }}>→</span>
          <span
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {newTitle}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{
              backgroundColor: "var(--diff-added-bg, #1a3a1a)",
              color: "var(--diff-added-text, #4ade80)",
            }}
          >
            +{stats.added}
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{
              backgroundColor: "var(--diff-removed-bg, #3a1a1a)",
              color: "var(--diff-removed-text, #f87171)",
            }}
          >
            -{stats.removed}
          </span>
        </div>
      </div>

      {/* Diff 内容 */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse" style={{ fontSize: "13px" }}>
          <tbody>
            {lines.map((line, index) => (
              <tr
                key={index}
                style={{
                  backgroundColor:
                    line.type === "added"
                      ? "var(--diff-added-bg, #1a3a1a)"
                      : line.type === "removed"
                        ? "var(--diff-removed-bg, #3a1a1a)"
                        : "transparent",
                }}
              >
                {/* 旧文件行号 */}
                <td
                  className="w-10 px-2 text-right select-none"
                  style={{
                    color: "var(--text-muted)",
                    borderRight: "1px solid var(--border-color)",
                  }}
                >
                  {line.oldLineNum}
                </td>
                {/* 新文件行号 */}
                <td
                  className="w-10 px-2 text-right select-none"
                  style={{
                    color: "var(--text-muted)",
                    borderRight: "1px solid var(--border-color)",
                  }}
                >
                  {line.newLineNum}
                </td>
                {/* 符号 */}
                <td
                  className="w-6 px-1 text-center select-none"
                  style={{
                    color:
                      line.type === "added"
                        ? "var(--diff-added-text, #4ade80)"
                        : line.type === "removed"
                          ? "var(--diff-removed-text, #f87171)"
                          : "var(--text-muted)",
                  }}
                >
                  {line.type === "added"
                    ? "+"
                    : line.type === "removed"
                      ? "-"
                      : " "}
                </td>
                {/* 内容 */}
                <td
                  className="px-2 whitespace-pre"
                  style={{
                    color:
                      line.type === "added"
                        ? "var(--diff-added-text, #4ade80)"
                        : line.type === "removed"
                          ? "var(--diff-removed-text, #f87171)"
                          : "var(--text-primary)",
                  }}
                >
                  {line.content}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
