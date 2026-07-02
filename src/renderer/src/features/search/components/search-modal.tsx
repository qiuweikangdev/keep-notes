import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Search, X } from "lucide-react";
import { useTreeStore } from "@/store/tree.store";
import { useEditorStore } from "@/store/editor.store";
import { useElectron } from "@/hooks/use-electron";
import type { TreeNode } from "@/types";
import type { EditorPanelGroup } from "@/store/editor.store";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RECENT_RESULT_LIMIT = 5;
const SEARCHABLE_EXTENSIONS = new Set([".md", ".txt"]);

function getFileExtension(title: string): string {
  const index = title.lastIndexOf(".");
  return index === -1 ? "" : title.slice(index).toLowerCase();
}

function isSearchableFile(node: TreeNode): boolean {
  return (
    !node.children && SEARCHABLE_EXTENSIONS.has(getFileExtension(node.title))
  );
}

function collectSearchableFiles(nodes: TreeNode[]): TreeNode[] {
  const files: TreeNode[] = [];

  const walk = (items: TreeNode[]) => {
    for (const item of items) {
      if (item.children) {
        walk(item.children);
        continue;
      }

      if (isSearchableFile(item)) {
        files.push(item);
      }
    }
  };

  walk(nodes);
  return files;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function getDisplayDirectory(filePath: string, rootPath?: string): string {
  const normalizedFilePath = normalizePath(filePath);
  const fileNameStart = normalizedFilePath.lastIndexOf("/");
  const parentPath =
    fileNameStart === -1
      ? ""
      : normalizedFilePath.slice(0, Math.max(0, fileNameStart));

  if (!rootPath) return parentPath;

  const normalizedRootPath = normalizePath(rootPath).replace(/\/$/, "");
  if (!parentPath.startsWith(normalizedRootPath)) return parentPath;

  const relativePath = parentPath.slice(normalizedRootPath.length);
  return relativePath.replace(/^\//, "") || ".";
}

function getRecentEditedFiles(
  files: TreeNode[],
  candidateFilePaths: string[],
): TreeNode[] {
  const fileByPath = new Map(files.map((file) => [file.key, file]));
  const seen = new Set<string>();
  const recentFiles: TreeNode[] = [];

  for (const filePath of candidateFilePaths) {
    if (seen.has(filePath)) continue;

    const file = fileByPath.get(filePath);
    if (!file) continue;

    seen.add(filePath);
    recentFiles.push(file);

    if (recentFiles.length >= RECENT_RESULT_LIMIT) break;
  }

  return recentFiles;
}

function getOpenFilePaths(panelGroups: EditorPanelGroup[]): string[] {
  const paths: string[] = [];

  for (const group of panelGroups) {
    const activeTab = group.tabs.find((tab) => tab.id === group.activeTabId);
    if (activeTab?.filePath) paths.push(activeTab.filePath);

    for (const tab of group.tabs) {
      if (tab.filePath && tab.filePath !== activeTab?.filePath) {
        paths.push(tab.filePath);
      }
    }
  }

  return paths;
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const treeData = useTreeStore((state) => state.treeData);
  const treeRoot = useTreeStore((state) => state.treeRoot);
  const selectedKey = useTreeStore((state) => state.selectedKey);
  const panelGroups = useEditorStore((state) => state.panelGroups);
  const recentEditedFilePaths = useEditorStore(
    (state) => state.recentEditedFilePaths,
  );
  const { openFile } = useElectron();

  const searchableFiles = useMemo(
    () => collectSearchableFiles(treeData),
    [treeData],
  );

  const defaultCandidateFilePaths = useMemo(
    () => [
      ...recentEditedFilePaths,
      ...getOpenFilePaths(panelGroups),
      ...(selectedKey ? [selectedKey] : []),
    ],
    [panelGroups, recentEditedFilePaths, selectedKey],
  );

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return getRecentEditedFiles(searchableFiles, defaultCandidateFilePaths);
    }

    return searchableFiles.filter((file) => {
      const title = file.title.toLowerCase();
      const path = file.key.toLowerCase();
      return title.includes(normalizedQuery) || path.includes(normalizedQuery);
    });
  }, [defaultCandidateFilePaths, query, searchableFiles]);

  const openSelectedFile = useCallback(
    (file: TreeNode) => {
      openFile(file.key);
      onClose();
    },
    [openFile, onClose],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (results.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((index) => (index + 1) % results.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex(
          (index) => (index - 1 + results.length) % results.length,
        );
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        openSelectedFile(results[selectedIndex]);
      }
    },
    [onClose, openSelectedFile, results, selectedIndex],
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSelectedIndex(0);
      return;
    }

    inputRef.current?.focus();
  }, [isOpen]);

  if (!isOpen) return null;

  const hasQuery = query.trim().length > 0;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-start justify-center pt-[12vh]">
      <div className="pointer-events-auto relative w-[520px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-2xl">
        <div className="flex h-9 items-center gap-2 px-3">
          <Search
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
          />
          <input
            ref={inputRef}
            aria-activedescendant={
              results[selectedIndex]
                ? `search-result-${selectedIndex}`
                : undefined
            }
            aria-controls="search-results"
            className="h-full min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm text-[var(--text-primary)] shadow-none outline-none ring-0 placeholder:text-[var(--text-muted)] focus:border-0 focus:border-transparent focus:outline-none focus:ring-0"
            placeholder="搜索文件"
            role="searchbox"
            style={{ border: 0, boxShadow: "none" }}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          {query ? (
            <button
              aria-label="清空搜索"
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
              type="button"
              onClick={() => setQuery("")}
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="px-3 pb-1 pt-0 text-xs text-[var(--text-muted)]">
          文件
        </div>

        {results.length > 0 ? (
          <div
            id="search-results"
            aria-label={hasQuery ? "搜索结果" : "最近编辑文件"}
            className="max-h-[320px] overflow-y-auto px-1.5 pb-2"
            role="listbox"
          >
            {results.map((result, index) => {
              const selected = index === selectedIndex;

              return (
                <button
                  id={`search-result-${index}`}
                  key={result.key}
                  aria-selected={selected}
                  className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors ${
                    selected
                      ? "bg-[var(--active-bg)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
                  }`}
                  role="option"
                  type="button"
                  onClick={() => openSelectedFile(result)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <FileText
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {result.title}
                  </span>
                  <span className="min-w-[120px] max-w-[240px] truncate text-right text-xs text-[var(--text-muted)]">
                    {getDisplayDirectory(result.key, treeRoot?.key)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-4 pb-5 pt-2 text-[13px] text-[var(--text-muted)]">
            {hasQuery ? "没有找到匹配文件" : "暂无最近编辑文件"}
          </div>
        )}
      </div>
    </div>
  );
}
