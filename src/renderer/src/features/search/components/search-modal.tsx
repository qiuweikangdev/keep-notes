import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, FolderOpen, Search, X } from "lucide-react";
import { useTreeStore } from "@/store/tree.store";
import { useEditorStore } from "@/store/editor.store";
import { useElectron } from "@/hooks/use-electron";
import { REVEAL_FILE_TREE_NODE_EVENT } from "@/features/file-tree/utils";
import type { TreeNode } from "@/types";
import type { EditorPanelGroup } from "@/store/editor.store";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchResult {
  kind: "file" | "folder";
  key: string;
  title: string;
  subtitle: string;
}

interface SearchResultGroup {
  label: "文件" | "目录";
  results: SearchResult[];
}

type SearchDisplayItem =
  | { type: "heading"; key: string; label: SearchResultGroup["label"] }
  | { type: "result"; result: SearchResult; resultIndex: number };

const RECENT_GROUP_LIMIT = 5;
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
  return relativePath.replace(/^\//, "");
}

function getRecentOpenedFiles(
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

    if (recentFiles.length >= RECENT_GROUP_LIMIT) break;
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

function createFileResult(file: TreeNode, rootPath?: string): SearchResult {
  return {
    kind: "file",
    key: file.key,
    title: file.title,
    subtitle: getDisplayDirectory(file.key, rootPath),
  };
}

function createFolderResult(folder: {
  title: string;
  path: string;
}): SearchResult {
  return {
    kind: "folder",
    key: folder.path,
    title: folder.title,
    subtitle: folder.path,
  };
}

export function SearchModal({ isOpen, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isComposingRef = useRef(false);
  const treeData = useTreeStore((state) => state.treeData);
  const treeRoot = useTreeStore((state) => state.treeRoot);
  const selectedKey = useTreeStore((state) => state.selectedKey);
  const recentFolders = useTreeStore((state) => state.recentFolders);
  const panelGroups = useEditorStore((state) => state.panelGroups);
  const recentOpenedFilePaths = useEditorStore(
    (state) => state.recentOpenedFilePaths,
  );
  const setSidebarView = useEditorStore((state) => state.setSidebarView);
  const { loadTree, openFile } = useElectron();
  const hasWorkspace = Boolean(treeRoot);

  const searchableFiles = useMemo(
    () => collectSearchableFiles(treeData),
    [treeData],
  );

  const defaultCandidateFilePaths = useMemo(
    () => [
      ...recentOpenedFilePaths,
      ...getOpenFilePaths(panelGroups),
      ...(selectedKey ? [selectedKey] : []),
    ],
    [panelGroups, recentOpenedFilePaths, selectedKey],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;

  const recentFileResults = useMemo(
    () =>
      hasWorkspace
        ? getRecentOpenedFiles(searchableFiles, defaultCandidateFilePaths).map(
            (file) => createFileResult(file, treeRoot?.key),
          )
        : [],
    [defaultCandidateFilePaths, hasWorkspace, searchableFiles, treeRoot?.key],
  );

  const recentFolderResults = useMemo(
    () =>
      recentFolders
        .slice(0, RECENT_GROUP_LIMIT)
        .map((folder) => createFolderResult(folder)),
    [recentFolders],
  );

  const searchedFileResults = useMemo(() => {
    if (!hasWorkspace || !normalizedQuery) return [];

    return searchableFiles
      .filter((file) => {
        const title = file.title.toLowerCase();
        const path = file.key.toLowerCase();
        return (
          title.includes(normalizedQuery) || path.includes(normalizedQuery)
        );
      })
      .map((file) => createFileResult(file, treeRoot?.key));
  }, [hasWorkspace, normalizedQuery, searchableFiles, treeRoot?.key]);

  const resultGroups = useMemo<SearchResultGroup[]>(() => {
    if (hasQuery) {
      return searchedFileResults.length > 0
        ? [{ label: "文件", results: searchedFileResults }]
        : [];
    }

    const groups: SearchResultGroup[] = [];
    if (recentFileResults.length > 0) {
      groups.push({ label: "文件", results: recentFileResults });
    }
    if (recentFolderResults.length > 0) {
      groups.push({ label: "目录", results: recentFolderResults });
    }
    return groups;
  }, [hasQuery, recentFileResults, recentFolderResults, searchedFileResults]);

  const results = useMemo(
    () => resultGroups.flatMap((group) => group.results),
    [resultGroups],
  );

  const displayItems = useMemo<SearchDisplayItem[]>(() => {
    let resultIndex = 0;

    return resultGroups.flatMap((group) => [
      {
        type: "heading" as const,
        key: `heading-${group.label}`,
        label: group.label,
      },
      ...group.results.map((result) => ({
        type: "result" as const,
        result,
        resultIndex: resultIndex++,
      })),
    ]);
  }, [resultGroups]);

  const openSelectedResult = useCallback(
    (result: SearchResult) => {
      if (result.kind === "folder") {
        loadTree(result.key);
      } else {
        setSidebarView("file");
        window.dispatchEvent(
          new CustomEvent(REVEAL_FILE_TREE_NODE_EVENT, {
            detail: { key: result.key, align: "center" },
          }),
        );
        openFile(result.key);
      }
      onClose();
    },
    [loadTree, openFile, onClose, setSidebarView],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const isComposing =
        isComposingRef.current ||
        event.nativeEvent.isComposing ||
        event.keyCode === 229;

      // 输入法组合态下的按键用于确认候选词，避免误触发搜索结果动作。
      if (isComposing) return;

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
        openSelectedResult(results[selectedIndex]);
      }
    },
    [onClose, openSelectedResult, results, selectedIndex],
  );

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  useEffect(() => {
    if (!isOpen) return;
    resultRefs.current[selectedIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [isOpen, results, selectedIndex]);

  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSelectedIndex(0);
      isComposingRef.current = false;
      return;
    }

    inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const modal = modalRef.current;
      if (!modal || modal.contains(event.target as Node)) return;
      onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-start justify-center pt-[12vh]">
      <div
        ref={modalRef}
        className="pointer-events-auto relative w-[520px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-2xl"
      >
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
            onCompositionEnd={handleCompositionEnd}
            onCompositionStart={handleCompositionStart}
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

        {results.length > 0 ? (
          <div
            id="search-results"
            aria-label={hasQuery ? "搜索结果" : "最近打开项目"}
            className="max-h-[376px] overflow-y-auto px-1.5 pb-2"
            role="listbox"
          >
            {displayItems.map((item) => {
              if (item.type === "heading") {
                return (
                  <div
                    key={item.key}
                    className="px-2 pb-1 pt-1 text-xs text-[var(--text-muted)]"
                    role="presentation"
                  >
                    {item.label}
                  </div>
                );
              }

              const { result, resultIndex } = item;
              const selected = resultIndex === selectedIndex;

              return (
                <button
                  id={`search-result-${resultIndex}`}
                  key={`${result.kind}-${result.key}`}
                  ref={(element) => {
                    resultRefs.current[resultIndex] = element;
                  }}
                  aria-selected={selected}
                  className={`flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors ${
                    selected
                      ? "bg-[var(--active-bg)] text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)]"
                  }`}
                  role="option"
                  type="button"
                  onClick={() => openSelectedResult(result)}
                >
                  {result.kind === "folder" ? (
                    <FolderOpen
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"
                    />
                  ) : (
                    <FileText
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {result.title}
                  </span>
                  {result.subtitle ? (
                    <span className="min-w-[120px] max-w-[240px] truncate text-right text-xs text-[var(--text-muted)]">
                      {result.subtitle}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-4 pb-5 pt-2 text-[13px] text-[var(--text-muted)]">
            {hasQuery ? "没有找到匹配文件" : "暂无最近打开的文件或目录"}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
