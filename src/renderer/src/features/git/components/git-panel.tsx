import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useElectron } from "@/hooks/use-electron";
import { useTreeStore } from "@/store/tree.store";
import { useEditorStore } from "@/store/editor.store";
import { useDiffStore } from "@/store/diff.store";
import { CodeResult } from "@/types";
import type { GitStatus, GitBranch, GitCommitOptions } from "@/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  buildGitFileTree,
  getGitStatusBadge,
  getVisibleGitFilePaths,
} from "../lib/git-status-view";
import type { GitFileTreeNode, GitStatusBadge } from "../lib/git-status-view";
import {
  GitBranch as GitBranchIcon,
  GitCommit,
  RefreshCw,
  Plus,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  GitCompare,
  List,
  FolderTree,
  File,
  Folder,
  FolderOpen,
  MinusSquare,
  PlusSquare,
} from "lucide-react";

interface GitPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const normalizePanelGitPath = (filePath: string) =>
  filePath.replace(/\\/g, "/");

function GitPanelTooltip({
  label,
  children,
  side = "top",
  align = "center",
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
  align?: "center" | "end";
}) {
  return (
    <span
      className={`git-panel-tooltip git-panel-tooltip--${side} git-panel-tooltip--align-${align}`}
    >
      {children}
      <span className="git-panel-tooltip__content" role="tooltip">
        {label}
      </span>
    </span>
  );
}

export function GitPanel({ isOpen, onClose }: GitPanelProps) {
  const {
    detectGitRepo,
    getBranches,
    switchBranch,
    createBranch,
    getGitStatus,
    addFilesToStaging,
    unstageFiles,
    commitChanges,
    pushToRemote,
    pullFromRemote,
    discardChanges,
    openFile: openFileInEditor,
    loadTree,
    getFileHeadContent,
  } = useElectron();
  const { treeRoot, setSelectedKey, expandedKeys, setExpandedKeys } =
    useTreeStore();

  const [isGitRepo, setIsGitRepo] = useState(false);
  const [currentBranch, setCurrentBranch] = useState("");
  const [branches, setBranches] = useState<GitBranch[]>([]);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showBranchList, setShowBranchList] = useState(false);
  const [showCreateBranch, setShowCreateBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [stagedFiles, setStagedFiles] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    filePath: string;
  }>({ open: false, filePath: "" });
  const [treeView, setTreeView] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    staged: true,
    unstaged: true,
  });
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const { openDiff, closeDiff, updateContent } = useDiffStore();

  const getCurrentDir = useCallback(() => {
    return treeRoot?.key || "";
  }, [treeRoot]);

  const loadGitInfo = useCallback(async () => {
    const dir = getCurrentDir();
    if (!dir) return;

    try {
      setLoading(true);
      const detectResult = await detectGitRepo(dir);
      if (detectResult?.code === CodeResult.Success && detectResult.data) {
        setIsGitRepo(detectResult.data.isGitRepo);
        if (detectResult.data.isGitRepo) {
          const branchResult = await getBranches(dir);
          if (branchResult?.code === CodeResult.Success && branchResult.data) {
            setBranches(branchResult.data);
            const current = branchResult.data.find((b) => b.current);
            if (current) {
              setCurrentBranch(current.name);
            }
          }

          const statusResult = await getGitStatus(dir);
          if (statusResult?.code === CodeResult.Success && statusResult.data) {
            setGitStatus(statusResult.data);
            setStagedFiles(new Set(statusResult.data.staged));
          }
        }
      }
    } catch (error) {
      console.error("加载 Git 信息失败:", error);
    } finally {
      setLoading(false);
    }
  }, [getCurrentDir, detectGitRepo, getBranches, getGitStatus]);

  useEffect(() => {
    if (isOpen) {
      loadGitInfo();
    }
  }, [isOpen, loadGitInfo]);

  // 切换目录展开状态
  const toggleDir = useCallback((dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  }, []);

  const toggleSection = useCallback((section: "staged" | "unstaged") => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  }, []);

  // 切换文件暂存状态
  const toggleFileStaging = useCallback(
    async (filePath: string) => {
      const dir = getCurrentDir();
      if (!dir) return;

      const isCurrentlyStaged = Array.from(stagedFiles).some(
        (stagedFilePath) =>
          normalizePanelGitPath(stagedFilePath) ===
          normalizePanelGitPath(filePath),
      );

      try {
        if (isCurrentlyStaged) {
          // 取消暂存
          const result = await unstageFiles(dir, [filePath]);
          if (result.code === CodeResult.Success) {
            setStagedFiles((prev) => {
              const next = new Set(prev);
              next.delete(filePath);
              return next;
            });
          }
        } else {
          // 添加到暂存区
          const result = await addFilesToStaging(dir, [filePath]);
          if (result.code === CodeResult.Success) {
            setStagedFiles((prev) => new Set(prev).add(filePath));
          }
        }
      } catch (error) {
        showMessage("error", "操作失败");
      }
    },
    [getCurrentDir, stagedFiles, addFilesToStaging, unstageFiles],
  );

  const handleSwitchBranch = useCallback(
    async (branchName: string) => {
      const dir = getCurrentDir();
      if (!dir) return;
      if (branchName === currentBranch) {
        setShowBranchList(false);
        return;
      }

      try {
        setLoading(true);
        const result = await switchBranch(dir, branchName);
        if (result.code === CodeResult.Success) {
          setCurrentBranch(branchName);
          setShowBranchList(false);
          await loadGitInfo();
          showMessage("success", `已切换到分支: ${branchName}`);
        } else {
          showMessage("error", result.message || "切换分支失败");
        }
      } catch (error) {
        showMessage("error", "切换分支失败");
      } finally {
        setLoading(false);
      }
    },
    [getCurrentDir, currentBranch, switchBranch, loadGitInfo],
  );

  const handleCreateBranch = useCallback(async () => {
    if (!newBranchName.trim()) return;
    const dir = getCurrentDir();
    if (!dir) return;

    try {
      setLoading(true);
      const result = await createBranch(dir, newBranchName.trim());
      if (result.code === CodeResult.Success) {
        setCurrentBranch(newBranchName.trim());
        setNewBranchName("");
        setShowCreateBranch(false);
        await loadGitInfo();
        showMessage("success", `已创建并切换到分支: ${newBranchName.trim()}`);
      } else {
        showMessage("error", result.message || "创建分支失败");
      }
    } catch (error) {
      showMessage("error", "创建分支失败");
    } finally {
      setLoading(false);
    }
  }, [getCurrentDir, createBranch, loadGitInfo, newBranchName]);

  const handlePush = useCallback(async () => {
    const dir = getCurrentDir();
    if (!dir) return;

    try {
      setLoading(true);
      const result = await pushToRemote(dir);
      if (result.code === CodeResult.Success) {
        showMessage("success", "推送成功");
      } else {
        showMessage("error", result.message || "推送失败");
      }
    } catch (error) {
      showMessage("error", "推送失败");
    } finally {
      setLoading(false);
    }
  }, [getCurrentDir, pushToRemote]);

  const handlePull = useCallback(async () => {
    const dir = getCurrentDir();
    if (!dir) return;

    try {
      setLoading(true);
      const result = await pullFromRemote(dir);
      if (result.code === CodeResult.Success) {
        showMessage("success", "拉取成功");
        await loadGitInfo();
        await loadTree(dir);
      } else {
        showMessage("error", result.message || "拉取失败");
      }
    } catch (error) {
      showMessage("error", "拉取失败");
    } finally {
      setLoading(false);
    }
  }, [getCurrentDir, pullFromRemote, loadGitInfo, loadTree]);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // 打开文件
  const handleOpenFile = useCallback(
    async (filePath: string) => {
      const dir = getCurrentDir();
      if (!dir) return;

      // 关闭弹窗
      onClose();

      // 构造完整路径，使用与 treeRoot.key 相同的分隔符
      const sep = dir.includes("\\") ? "\\" : "/";
      const normalizedFile = filePath.replace(/[/\\]/g, sep);
      const fullPath = dir + sep + normalizedFile;

      // 展开所有父目录，使文件在树中可见
      const parts = fullPath.split(/[/\\]/);
      const newExpanded = new Set(expandedKeys);
      let current = parts[0];
      for (let i = 1; i < parts.length - 1; i++) {
        current += sep + parts[i];
        newExpanded.add(current);
      }
      setExpandedKeys(Array.from(newExpanded));

      // 高亮并打开文件
      setSelectedKey(fullPath);
      await openFileInEditor(fullPath);
    },
    [
      getCurrentDir,
      onClose,
      setSelectedKey,
      openFileInEditor,
      expandedKeys,
      setExpandedKeys,
    ],
  );

  // 处理 diff 比较
  const handleDiffFile = useCallback(
    async (filePath: string) => {
      const dir = getCurrentDir();
      if (!dir) return;

      // 先打开弹窗占位并标记加载中
      openDiff(filePath, "", "");

      try {
        // 构造完整路径，使用与 handleOpenFile 相同的方式
        const sep = dir.includes("\\") ? "\\" : "/";
        const normalizedFile = filePath.replace(/[/\\]/g, sep);
        const fullPath = dir + sep + normalizedFile;

        // 获取编辑器中的内容（如果已打开）
        let editorContent = "";
        const matchedTab = useEditorStore
          .getState()
          .panelGroups.flatMap((g) => g.tabs)
          .find((t) => t.filePath === fullPath);
        if (matchedTab?.content) {
          editorContent = matchedTab.content;
        } else {
          // 从磁盘读取
          editorContent = await window.electronAPI.readFile(fullPath);
        }

        // 获取 HEAD 中的内容
        let baseContent = "";
        const headResult = await getFileHeadContent(dir, filePath);
        if (headResult.code === CodeResult.Success) {
          baseContent = headResult.data ?? "";
        }

        updateContent(baseContent, editorContent);
      } catch (error) {
        console.error("Failed to read file for diff:", error);
        closeDiff();
      }
    },
    [getCurrentDir, openDiff, updateContent, closeDiff, getFileHeadContent],
  );

  // 放弃更改 - 打开确认弹窗
  const handleDiscardChanges = useCallback((filePath: string) => {
    setConfirmDialog({ open: true, filePath });
  }, []);

  const allFiles = useMemo(() => {
    if (!gitStatus) return [];

    return getVisibleGitFilePaths(gitStatus).map((path) => ({
      path,
      badge: getGitStatusBadge(gitStatus, path),
    }));
  }, [gitStatus]);
  const allFilePaths = useMemo(
    () => allFiles.map((file) => file.path),
    [allFiles],
  );
  const stagedFilePathSet = useMemo(
    () => new Set(Array.from(stagedFiles).map(normalizePanelGitPath)),
    [stagedFiles],
  );
  const isFileStaged = useCallback(
    (filePath: string) =>
      stagedFilePathSet.has(normalizePanelGitPath(filePath)),
    [stagedFilePathSet],
  );
  const stagedFilePaths = useMemo(
    () => allFilePaths.filter((path) => isFileStaged(path)),
    [allFilePaths, isFileStaged],
  );
  const unstagedFilePaths = useMemo(
    () => allFilePaths.filter((path) => !isFileStaged(path)),
    [allFilePaths, isFileStaged],
  );
  const modifiedCount =
    allFiles.filter((file) => file.badge?.kind === "modified").length || 0;
  const addedCount =
    allFiles.filter((file) => file.badge?.kind === "added").length || 0;
  const deletedCount =
    allFiles.filter((file) => file.badge?.kind === "deleted").length || 0;
  const fileBadgeMap = useMemo(() => {
    const badgeMap = new Map<string, GitStatusBadge | null>();
    allFiles.forEach((file) => {
      badgeMap.set(file.path, file.badge);
      badgeMap.set(normalizePanelGitPath(file.path), file.badge);
    });
    return badgeMap;
  }, [allFiles]);
  const canCommit =
    !loading &&
    allFiles.length > 0 &&
    (includeUntracked || stagedFilePaths.length > 0);

  const handleCommit = useCallback(
    async (pushAfterCommit: boolean = false) => {
      const dir = getCurrentDir();
      if (!dir) return;

      const message =
        commitMessage.trim() || new Date().toLocaleString("zh-CN");

      try {
        setLoading(true);
        const options: GitCommitOptions = {
          message,
          push: pushAfterCommit,
          files: includeUntracked ? undefined : stagedFilePaths,
        };
        const result = await commitChanges(dir, options);
        if (result.code === CodeResult.Success) {
          setCommitMessage("");
          await loadGitInfo();
          await loadTree(dir);
          showMessage(
            "success",
            pushAfterCommit ? "提交并推送成功" : "提交成功",
          );
        } else {
          showMessage("error", result.message || "提交失败");
        }
      } catch (error) {
        showMessage("error", "提交失败");
      } finally {
        setLoading(false);
      }
    },
    [
      getCurrentDir,
      commitMessage,
      includeUntracked,
      stagedFilePaths,
      commitChanges,
      loadGitInfo,
      loadTree,
    ],
  );

  // 获取目录下所有文件路径
  const getFilesInDir = useCallback(
    (dirPath: string): string[] => {
      const normalizedDir = normalizePanelGitPath(dirPath);
      return allFilePaths.filter((filePath) =>
        normalizePanelGitPath(filePath).startsWith(normalizedDir + "/"),
      );
    },
    [allFilePaths],
  );

  // 检查目录下所有文件是否都已暂存
  const isDirFullyStaged = useCallback(
    (dirPath: string): boolean => {
      const files = getFilesInDir(dirPath);
      return files.length > 0 && files.every((f) => isFileStaged(f));
    },
    [getFilesInDir, isFileStaged],
  );

  // 检查目录下是否有部分文件已暂存
  const isDirPartiallyStaged = useCallback(
    (dirPath: string): boolean => {
      const files = getFilesInDir(dirPath);
      const stagedCount = files.filter((f) => isFileStaged(f)).length;
      return stagedCount > 0 && stagedCount < files.length;
    },
    [getFilesInDir, isFileStaged],
  );

  // 切换目录下所有文件的暂存状态
  const toggleDirStaging = useCallback(
    async (dirPath: string) => {
      const dir = getCurrentDir();
      if (!dir) return;

      const files = getFilesInDir(dirPath);
      if (files.length === 0) return;

      const allStaged = isDirFullyStaged(dirPath);

      try {
        if (allStaged) {
          // 取消暂存所有文件
          const result = await unstageFiles(dir, files);
          if (result.code === CodeResult.Success) {
            setStagedFiles((prev) => {
              const next = new Set(prev);
              files.forEach((f) => next.delete(f));
              return next;
            });
          }
        } else {
          // 暂存所有文件
          const result = await addFilesToStaging(dir, files);
          if (result.code === CodeResult.Success) {
            setStagedFiles((prev) => {
              const next = new Set(prev);
              files.forEach((f) => next.add(f));
              return next;
            });
          }
        }
      } catch (error) {
        showMessage("error", "操作失败");
      }
    },
    [
      getCurrentDir,
      getFilesInDir,
      isDirFullyStaged,
      addFilesToStaging,
      unstageFiles,
    ],
  );

  const stageFiles = useCallback(
    async (files: string[]) => {
      const dir = getCurrentDir();
      if (!dir || files.length === 0) return;

      try {
        const result = await addFilesToStaging(dir, files);
        if (result.code === CodeResult.Success) {
          setStagedFiles((prev) => {
            const next = new Set(prev);
            files.forEach((filePath) => next.add(filePath));
            return next;
          });
        } else {
          showMessage("error", result.message || "暂存失败");
        }
      } catch (error) {
        showMessage("error", "暂存失败");
      }
    },
    [addFilesToStaging, getCurrentDir],
  );

  const unstageSelectedFiles = useCallback(
    async (files: string[]) => {
      const dir = getCurrentDir();
      if (!dir || files.length === 0) return;

      try {
        const result = await unstageFiles(dir, files);
        if (result.code === CodeResult.Success) {
          setStagedFiles((prev) => {
            const next = new Set(prev);
            files.forEach((filePath) => next.delete(filePath));
            return next;
          });
        } else {
          showMessage("error", result.message || "取消暂存失败");
        }
      } catch (error) {
        showMessage("error", "取消暂存失败");
      }
    },
    [getCurrentDir, unstageFiles],
  );

  // 放弃目录下所有文件的更改
  const handleDiscardDirChanges = useCallback(
    (dirPath: string) => {
      const files = getFilesInDir(dirPath);
      if (files.length === 0) return;
      setConfirmDialog({ open: true, filePath: dirPath + "/*" });
    },
    [getFilesInDir],
  );

  // 确认放弃更改
  const confirmDiscardChanges = useCallback(async () => {
    const filePath = confirmDialog.filePath;
    const dir = getCurrentDir();
    if (!dir) return;

    setConfirmDialog({ open: false, filePath: "" });

    // 获取当前编辑器中打开的文件路径，用于后续刷新
    const { filePath: editorFilePath } = useEditorStore.getState();

    try {
      // 处理目录级别的放弃更改
      if (filePath.endsWith("/*")) {
        const dirPath = filePath.slice(0, -2);
        const files = getFilesInDir(dirPath);

        // 先取消暂存目录下的所有已暂存文件
        const stagedInDir = files.filter((f) => isFileStaged(f));
        if (stagedInDir.length > 0) {
          await unstageFiles(dir, stagedInDir);
          setStagedFiles((prev) => {
            const next = new Set(prev);
            stagedInDir.forEach((f) => next.delete(f));
            return next;
          });
        }

        let successCount = 0;
        for (const file of files) {
          const result = await discardChanges(dir, file);
          if (result.code === CodeResult.Success) {
            successCount++;
          }
        }

        if (successCount === files.length) {
          showMessage("success", "已放弃目录下所有更改");
        } else {
          showMessage(
            "success",
            `已放弃 ${successCount}/${files.length} 个文件的更改`,
          );
        }

        // 如果编辑器中打开的文件在该目录下，重新读取内容
        if (
          editorFilePath &&
          files.some((f) => {
            const normalizedEditor = editorFilePath.replace(/[/\\]/g, "/");
            const normalizedFile = f.replace(/[/\\]/g, "/");
            const fullFile = (dir + "/" + f).replace(/[/\\]/g, "/");
            return (
              normalizedEditor === normalizedFile ||
              normalizedEditor === fullFile
            );
          })
        ) {
          const sep = dir.includes("\\") ? "\\" : "/";
          const normalizedFile = editorFilePath.replace(/[/\\]/g, sep);
          await openFileInEditor(normalizedFile);
        }
      } else {
        // 单文件：先取消暂存（如果已暂存），再放弃更改
        if (isFileStaged(filePath)) {
          await unstageFiles(dir, [filePath]);
          setStagedFiles((prev) => {
            const next = new Set(prev);
            next.delete(filePath);
            return next;
          });
        }

        const result = await discardChanges(dir, filePath);
        if (result.code === CodeResult.Success) {
          showMessage("success", "已放弃更改");
        } else {
          showMessage("error", result.message || "放弃更改失败");
          return;
        }

        // 如果编辑器中打开的正是该文件，重新读取最新内容
        if (editorFilePath) {
          const sep = dir.includes("\\") ? "\\" : "/";
          const normalizedEditor = editorFilePath.replace(/[/\\]/g, sep);
          const normalizedTarget = (dir + sep + filePath).replace(
            /[/\\]/g,
            sep,
          );
          if (normalizedEditor === normalizedTarget) {
            await openFileInEditor(normalizedEditor);
          }
        }
      }

      await loadGitInfo();
      await loadTree(dir);
    } catch (error) {
      showMessage("error", "放弃更改失败");
    }
  }, [
    confirmDialog,
    getCurrentDir,
    discardChanges,
    loadGitInfo,
    loadTree,
    getFilesInDir,
    stagedFiles,
    isFileStaged,
    unstageFiles,
    openFileInEditor,
  ]);

  const renderStatusBadge = (badge: GitStatusBadge | null | undefined) => {
    if (!badge) return <span className="w-4 shrink-0" aria-hidden="true" />;

    return (
      <span
        className="w-4 shrink-0 text-center text-xs font-semibold"
        style={{ color: badge.color }}
        title={`${badge.label}: ${badge.title}`}
        aria-label={badge.title}
      >
        {badge.label}
      </span>
    );
  };

  const renderFileActions = (
    filePath: string,
    badge?: GitStatusBadge | null,
  ) => (
    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <GitPanelTooltip label="查看差异" side="bottom">
        <button
          type="button"
          onClick={() => handleDiffFile(filePath)}
          data-theme-control="true"
          className="rounded p-1 transition-colors hover:bg-[var(--hover-bg)]"
          style={{ color: "var(--text-muted)" }}
          title="查看差异"
          aria-label="查看差异"
        >
          <GitCompare className="h-3.5 w-3.5" />
        </button>
      </GitPanelTooltip>
      {badge?.kind !== "deleted" ? (
        <GitPanelTooltip label="打开文件" side="bottom">
          <button
            type="button"
            onClick={() => handleOpenFile(filePath)}
            data-theme-control="true"
            className="rounded p-1 transition-colors hover:bg-[var(--hover-bg)]"
            style={{ color: "var(--text-muted)" }}
            title="打开文件"
            aria-label="打开文件"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </GitPanelTooltip>
      ) : null}
      <GitPanelTooltip label="放弃更改" side="bottom">
        <button
          type="button"
          onClick={() => handleDiscardChanges(filePath)}
          data-theme-control="true"
          className="rounded p-1 transition-colors hover:bg-[var(--hover-bg)]"
          style={{ color: "var(--text-muted)" }}
          title="放弃更改"
          aria-label="放弃更改"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </GitPanelTooltip>
    </div>
  );

  const renderFileRow = (
    filePath: string,
    label: string,
    depth = 0,
    showTreeGuide = false,
  ) => {
    const badge = fileBadgeMap.get(filePath);
    const isDeleted = badge?.kind === "deleted";

    return (
      <div
        key={filePath}
        className="group flex h-8 items-center border-b text-sm transition-colors hover:bg-[var(--hover-bg)]"
        style={{
          borderColor: "var(--border-color)",
          paddingLeft: `${12 + depth * 18}px`,
        }}
      >
        {showTreeGuide ? <span className="w-3.5 shrink-0" /> : null}
        <input
          type="checkbox"
          checked={isFileStaged(filePath)}
          onChange={() => toggleFileStaging(filePath)}
          className="mr-2 h-3.5 w-3.5 shrink-0 cursor-pointer rounded"
          style={{ accentColor: "var(--accent-color)" }}
          title={isFileStaged(filePath) ? "取消暂存" : "暂存更改"}
        />
        <File
          className="mr-2 h-4 w-4 shrink-0"
          style={{ color: "var(--text-muted)" }}
        />
        <span
          className="min-w-0 flex-1 truncate"
          style={{
            color: isDeleted ? "var(--text-muted)" : "var(--text-primary)",
            textDecoration: isDeleted ? "line-through" : "none",
          }}
          title={filePath}
        >
          {label}
        </span>
        <div className="ml-2 flex shrink-0 items-center gap-1">
          {renderFileActions(filePath, badge)}
          {renderStatusBadge(badge)}
        </div>
      </div>
    );
  };

  const renderTreeNode = (node: GitFileTreeNode, depth = 0) => {
    if (node.isFile) {
      return renderFileRow(node.path, node.name, depth, true);
    }

    const isExpanded = expandedDirs.has(node.path);
    const allStaged = isDirFullyStaged(node.path);
    const partialStaged = isDirPartiallyStaged(node.path);

    return (
      <div key={node.path}>
        <div
          className="group flex h-8 items-center border-b text-sm transition-colors hover:bg-[var(--hover-bg)]"
          style={{
            borderColor: "var(--border-color)",
            paddingLeft: `${12 + depth * 18}px`,
          }}
        >
          <button
            type="button"
            onClick={() => toggleDir(node.path)}
            data-theme-control="true"
            className="mr-1 rounded transition-colors hover:bg-[var(--hover-bg)]"
            style={{ color: "var(--text-muted)" }}
            aria-label={isExpanded ? "收起目录" : "展开目录"}
          >
            <ChevronRight
              className="h-3.5 w-3.5 transition-transform"
              style={{
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
              }}
            />
          </button>
          <input
            type="checkbox"
            checked={allStaged}
            ref={(el) => {
              if (el) el.indeterminate = partialStaged;
            }}
            onChange={() => toggleDirStaging(node.path)}
            className="mr-2 h-3.5 w-3.5 shrink-0 cursor-pointer rounded"
            style={{ accentColor: "var(--accent-color)" }}
            title={allStaged ? "取消暂存目录" : "暂存目录更改"}
          />
          {isExpanded ? (
            <FolderOpen
              className="mr-2 h-4 w-4 shrink-0"
              style={{ color: "var(--text-muted)" }}
            />
          ) : (
            <Folder
              className="mr-2 h-4 w-4 shrink-0"
              style={{ color: "var(--text-muted)" }}
            />
          )}
          <span
            className="min-w-0 flex-1 truncate"
            style={{ color: "var(--text-primary)" }}
            title={node.path}
          >
            {node.name}
          </span>
          <GitPanelTooltip label="放弃目录更改" side="bottom">
            <button
              type="button"
              onClick={() => handleDiscardDirChanges(node.path)}
              data-theme-control="true"
              className="ml-2 rounded p-1 opacity-0 transition-colors transition-opacity hover:bg-[var(--hover-bg)] group-hover:opacity-100 group-focus-within:opacity-100"
              style={{ color: "var(--text-muted)" }}
              title="放弃目录更改"
              aria-label="放弃目录更改"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </GitPanelTooltip>
          <span className="w-4 shrink-0" />
        </div>
        {isExpanded
          ? node.children.map((child) => renderTreeNode(child, depth + 1))
          : null}
      </div>
    );
  };

  const renderFileSection = (
    title: string,
    files: string[],
    variant: "staged" | "unstaged",
  ) => {
    if (files.length === 0) return null;

    const isStagedSection = variant === "staged";
    const isExpanded = expandedSections[variant];
    const sectionActionTitle = isExpanded ? `收起${title}` : `展开${title}`;

    return (
      <section>
        <div
          className="flex h-8 items-center justify-between border-b px-3 text-sm"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-color)",
            color: "var(--text-secondary)",
          }}
        >
          <button
            type="button"
            onClick={() => toggleSection(variant)}
            data-theme-control="true"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left"
            style={{ color: "inherit" }}
            aria-label={sectionActionTitle}
          >
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 transition-transform"
              style={{
                transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)",
              }}
            />
            <span className="truncate font-medium">{title}</span>
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-muted)",
              }}
            >
              {files.length}
            </span>
          </button>
          <GitPanelTooltip
            label={isStagedSection ? "全部取消暂存" : "全部暂存"}
            side="bottom"
            align="end"
          >
            <button
              type="button"
              onClick={() =>
                isStagedSection
                  ? unstageSelectedFiles(files)
                  : stageFiles(files)
              }
              data-theme-control="true"
              className="rounded p-1 transition-colors hover:bg-[var(--hover-bg)]"
              style={{ color: "var(--text-muted)" }}
              title={isStagedSection ? "全部取消暂存" : "全部暂存"}
              aria-label={isStagedSection ? "全部取消暂存" : "全部暂存"}
            >
              {isStagedSection ? (
                <MinusSquare className="h-3.5 w-3.5" />
              ) : (
                <PlusSquare className="h-3.5 w-3.5" />
              )}
            </button>
          </GitPanelTooltip>
        </div>
        {isExpanded
          ? treeView
            ? buildGitFileTree(files).map((node) => renderTreeNode(node))
            : files.map((filePath) => renderFileRow(filePath, filePath))
          : null}
      </section>
    );
  };

  if (!isOpen) return null;

  if (!isGitRepo) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
        onClick={onClose}
      >
        <div
          className="w-[400px] rounded-xl shadow-2xl"
          style={{ backgroundColor: "var(--bg-secondary)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex items-center justify-between p-4"
            style={{ borderBottom: "1px solid var(--border-color)" }}
          >
            <div className="flex items-center gap-2">
              <GitBranchIcon
                className="h-5 w-5"
                style={{ color: "var(--text-muted)" }}
              />
              <span
                className="font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Git 信息
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              data-theme-control="true"
              className="rounded-lg p-1"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-6 text-center">
            <GitBranchIcon
              className="h-12 w-12 mx-auto mb-4"
              style={{ color: "var(--text-muted)" }}
            />
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              当前目录不是 Git 仓库
            </p>
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
              请先初始化 Git 仓库或克隆一个仓库
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-[560px] max-h-[80vh] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: "var(--bg-secondary)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div
          className="flex items-center justify-between p-4"
          style={{ borderBottom: "1px solid var(--border-color)" }}
        >
          <div className="flex items-center gap-2">
            <GitBranchIcon
              className="h-5 w-5"
              style={{ color: "var(--text-muted)" }}
            />
            <span
              className="font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Git 操作
            </span>
          </div>
          <GitPanelTooltip label="关闭">
            <button
              type="button"
              onClick={onClose}
              data-theme-control="true"
              className="p-1 rounded-lg"
              style={{ color: "var(--text-muted)" }}
              title="关闭"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </GitPanelTooltip>
        </div>

        {/* 消息提示 */}
        {message && (
          <div
            className="px-4 py-2 text-sm flex items-center gap-2"
            style={{
              backgroundColor:
                message.type === "success"
                  ? "rgba(34, 197, 94, 0.15)"
                  : "rgba(239, 68, 68, 0.15)",
              color: message.type === "success" ? "#22c55e" : "#ef4444",
              borderBottom: "1px solid var(--border-color)",
            }}
          >
            {message.type === "success" ? (
              <Check className="h-4 w-4" />
            ) : (
              <X className="h-4 w-4" />
            )}
            {message.text}
          </div>
        )}

        {/* 固定区域：当前分支、文件状态标题、提交信息 */}
        <div
          className="px-4 py-3 space-y-3"
          style={{ borderBottom: "1px solid var(--border-color)" }}
        >
          {/* 当前分支 */}
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              当前分支
            </span>
            <div className="flex items-center gap-2">
              <GitPanelTooltip label="切换分支">
                <button
                  type="button"
                  onClick={() => setShowBranchList(!showBranchList)}
                  data-theme-control="true"
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                  }}
                  disabled={loading}
                  title="切换分支"
                  aria-label={`切换分支，当前分支 ${currentBranch || "未选择"}`}
                >
                  <GitBranchIcon className="h-3.5 w-3.5" />
                  {currentBranch || "未选择"}
                  {showBranchList ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
              </GitPanelTooltip>
              <GitPanelTooltip label="创建新分支">
                <button
                  type="button"
                  onClick={() => setShowCreateBranch(!showCreateBranch)}
                  data-theme-control="true"
                  className="rounded-lg p-1.5"
                  style={{ color: "var(--text-muted)" }}
                  title="创建新分支"
                  aria-label="创建新分支"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </GitPanelTooltip>
            </div>
          </div>

          {/* 分支列表下拉 */}
          {showBranchList && (
            <div
              className="rounded-lg overflow-hidden"
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
              }}
            >
              {branches.map((branch) => (
                <button
                  type="button"
                  key={branch.name}
                  onClick={() => handleSwitchBranch(branch.name)}
                  data-theme-control="true"
                  className="flex w-full items-center justify-between px-3 py-2 text-sm"
                  style={{
                    backgroundColor: branch.current
                      ? "var(--active-bg)"
                      : "transparent",
                    color: branch.current
                      ? "var(--accent-color)"
                      : "var(--text-primary)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <GitBranchIcon
                      className="h-3.5 w-3.5"
                      style={{ color: "var(--text-muted)" }}
                    />
                    <span>{branch.name}</span>
                  </div>
                  {branch.current && <Check className="h-4 w-4" />}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setShowBranchList(false);
                  setShowCreateBranch(true);
                }}
                data-theme-control="true"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                <Plus className="h-3.5 w-3.5" />
                创建并检出新分支...
              </button>
            </div>
          )}

          {/* 创建新分支输入框 */}
          {showCreateBranch && (
            <div
              className="flex items-center gap-2 p-3 rounded-lg"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
              }}
            >
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="新分支名称"
                className="flex-1 px-3 py-1.5 text-sm rounded-lg outline-none"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-color)",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateBranch();
                  } else if (e.key === "Escape") {
                    setShowCreateBranch(false);
                  }
                }}
                autoFocus
              />
              <Button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim() || loading}
                size="sm"
              >
                创建
              </Button>
              <Button
                onClick={() => {
                  setShowCreateBranch(false);
                  setNewBranchName("");
                }}
                size="sm"
                variant="secondary"
              >
                取消
              </Button>
            </div>
          )}

          {/* 提交信息 */}
          <div>
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="提交信息（留空将自动生成）..."
              rows={1}
              className="w-full h-9 overflow-hidden px-3 py-2 text-sm rounded-md resize-none outline-none"
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--accent-color)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border-color)";
              }}
            />
            <div className="mt-1 flex items-center gap-2">
              <input
                type="checkbox"
                id="includeUntracked"
                checked={includeUntracked}
                onChange={(e) => setIncludeUntracked(e.target.checked)}
                className="rounded w-3.5 h-3.5 cursor-pointer"
                style={{ accentColor: "var(--accent-color)" }}
              />
              <label
                htmlFor="includeUntracked"
                className="cursor-pointer text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                包含未暂存的更改
              </label>
            </div>
          </div>

          {/* 文件状态标题 */}
          {allFiles.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                文件状态
              </span>
              <div className="flex items-center gap-3 text-xs">
                {modifiedCount > 0 && (
                  <span style={{ color: "#3794ff" }}>M {modifiedCount}</span>
                )}
                {addedCount > 0 && (
                  <span style={{ color: "#73c991" }}>A {addedCount}</span>
                )}
                {deletedCount > 0 && (
                  <span style={{ color: "#f85149" }}>D {deletedCount}</span>
                )}
                <button
                  type="button"
                  onClick={() => setTreeView(!treeView)}
                  data-theme-control="true"
                  className="rounded p-1"
                  style={{ color: "var(--text-muted)" }}
                  title={treeView ? "切换为列表视图" : "切换为树形视图"}
                  aria-label={treeView ? "切换为列表视图" : "切换为树形视图"}
                >
                  {treeView ? (
                    <List className="h-3.5 w-3.5" />
                  ) : (
                    <FolderTree className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 文件列表 - 可滚动区域 */}
        {allFiles.length > 0 && (
          <div
            className="flex-1 overflow-x-hidden overflow-y-auto"
            style={{ backgroundColor: "var(--bg-primary)" }}
          >
            {renderFileSection("已暂存的更改", stagedFilePaths, "staged")}
            {renderFileSection("更改", unstagedFilePaths, "unstaged")}
          </div>
        )}

        {/* 无更改提示 */}
        {allFiles.length === 0 && (
          <div
            className="flex-1 flex items-center justify-center py-6"
            style={{ color: "var(--text-muted)" }}
          >
            <div className="text-center">
              <GitCommit className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">无更改</p>
            </div>
          </div>
        )}

        {/* 底部按钮 */}
        <div
          className="flex items-center justify-between p-4"
          style={{ borderTop: "1px solid var(--border-color)" }}
        >
          <div className="flex items-center gap-2">
            <Button
              onClick={handlePull}
              disabled={loading}
              className="gap-1.5"
              title="从远程拉取"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              拉取
            </Button>
            <Button
              onClick={handlePush}
              disabled={loading}
              className="gap-1.5"
              title="推送到远程"
            >
              <GitCommit className="h-3.5 w-3.5" />
              推送
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => handleCommit(false)}
              disabled={!canCommit}
              variant="secondary"
              className="px-4"
            >
              提交
            </Button>
            <Button
              onClick={() => handleCommit(true)}
              disabled={!canCommit}
              className="px-4"
            >
              提交并推送
            </Button>
          </div>
        </div>
      </div>

      {/* 确认放弃更改弹窗 */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) =>
          setConfirmDialog({ open, filePath: confirmDialog.filePath })
        }
        title="确认放弃更改"
        description={`确定要放弃 ${
          confirmDialog.filePath.endsWith("/*")
            ? `目录 "${confirmDialog.filePath.slice(0, -2)}" 下的所有更改`
            : `"${confirmDialog.filePath}" 的更改`
        } 吗？`}
        confirmText="确定"
        onConfirm={confirmDiscardChanges}
      />
    </div>
  );
}
