import { useState, useCallback, useEffect, useRef } from "react";
import { Search, X, File, Folder, ChevronRight } from "lucide-react";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "@/hooks/use-electron";
import type { TreeNode } from "@/types";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TreeNode[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { treeData } = useTreeStore();
  const { openFile } = useElectron();

  // 搜索文件
  const searchFiles = useCallback(
    (nodes: TreeNode[], query: string): TreeNode[] => {
      const results: TreeNode[] = [];

      const search = (nodes: TreeNode[]) => {
        for (const node of nodes) {
          if (node.title.toLowerCase().includes(query.toLowerCase())) {
            results.push(node);
          }
          if (node.children) {
            search(node.children);
          }
        }
      };

      search(nodes);
      return results;
    },
    [],
  );

  // 处理搜索
  useEffect(() => {
    if (query.trim()) {
      const results = searchFiles(treeData, query);
      setResults(results);
      setSelectedIndex(0);
    } else {
      setResults([]);
    }
  }, [query, treeData, searchFiles]);

  // 处理键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        const selected = results[selectedIndex];
        if (selected.title.endsWith(".md")) {
          openFile(selected.key);
          onClose();
        }
      }
    },
    [results, selectedIndex, openFile, onClose],
  );

  // 自动聚焦
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20%]">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(4px)",
        }}
        onClick={onClose}
      />

      {/* 搜索框 */}
      <div
        className="relative w-[500px] max-w-[90%] rounded-xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border-color)",
        }}
      >
        {/* 输入框 */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--border-color)" }}
        >
          <Search
            className="h-5 w-5 flex-shrink-0"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="搜索文件..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-base outline-none"
            style={{
              color: "var(--text-primary)",
            }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="p-1 rounded-md transition-all"
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
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* 搜索结果 */}
        {results.length > 0 && (
          <div className="max-h-[300px] overflow-y-auto py-2">
            {results.map((result, index) => (
              <button
                key={result.key}
                onClick={() => {
                  if (result.title.endsWith(".md")) {
                    openFile(result.key);
                    onClose();
                  }
                }}
                className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors"
                style={{
                  backgroundColor:
                    index === selectedIndex
                      ? "var(--active-bg)"
                      : "transparent",
                }}
                onMouseEnter={(e) => {
                  if (index !== selectedIndex) {
                    e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (index !== selectedIndex) {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
              >
                {result.title.endsWith(".md") ? (
                  <File
                    className="h-4 w-4 flex-shrink-0"
                    style={{ color: "var(--accent-color)" }}
                  />
                ) : (
                  <Folder
                    className="h-4 w-4 flex-shrink-0"
                    style={{ color: "#f0a020" }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {result.title}
                  </p>
                  <p
                    className="text-xs truncate"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {result.key}
                  </p>
                </div>
                {result.title.endsWith(".md") && (
                  <ChevronRight
                    className="h-4 w-4 flex-shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  />
                )}
              </button>
            ))}
          </div>
        )}

        {/* 空状态 */}
        {query && results.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              没有找到匹配的文件
            </p>
          </div>
        )}

        {/* 提示 */}
        <div
          className="px-4 py-2"
          style={{
            borderTop: "1px solid var(--border-color)",
            backgroundColor: "var(--bg-secondary)",
          }}
        >
          <div
            className="flex items-center gap-4 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            <span>↑↓ 导航</span>
            <span>↵ 打开</span>
            <span>ESC 关闭</span>
          </div>
        </div>
      </div>
    </div>
  );
}
