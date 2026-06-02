import { useState, useEffect, useCallback } from "react";
import { useElectron } from "@/hooks/use-electron";
import { useTreeStore } from "@/store/tree.store";
import { CodeResult } from "@/types";
import type { GitStatus, GitBranch, GitCommitOptions } from "@/types";
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

// 所有需要展示的文件（去重后）
interface FileItem {
  path: string;
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
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const getCurrentDir = useCallback(() => {
    return treeRoot?.key || "";
  }, [treeRoot]);

  const loadGitInfo = useCallback(async () => {
    const dir = getCurrentDir();
    if (!dir) return;

    try {
      setLoading(true);
      const detectResult = await detectGitRepo(dir);
      if (detectResult.code === CodeResult.Success && detectResult.data) {
        setIsGitRepo(detectResult.data.isGitRepo);
        if (detectResult.data.isGitRepo) {
          const branchResult = await getBranches(dir);
          if (branchResult.code === CodeResult.Success && branchResult.data) {
            setBranches(branchResult.data);
            const current = branchResult.data.find((b) => b.current);
            if (current) {
              setCurrentBranch(current.name);
            }
          }

          const statusResult = await getGitStatus(dir);
          if (statusResult.code === CodeResult.Success && statusResult.data) {
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

  // 合并所有文件，去重
  const getAllFiles = useCallback((): FileItem[] => {
    if (!gitStatus) return [];

    const fileSet = new Set<string>();

    // 添加所有文件到集合中去重
    gitStatus.staged.forEach((filePath) => fileSet.add(filePath));
    gitStatus.modified.forEach((filePath) => fileSet.add(filePath));
    gitStatus.not_added.forEach((filePath) => fileSet.add(filePath));
    gitStatus.deleted.forEach((filePath) => fileSet.add(filePath));

    return Array.from(fileSet).map((path) => ({ path }));
  }, [gitStatus]);

  // 树节点类型
  interface TreeNode {
    name: string;
    path: string;
    isFile: boolean;
    children: TreeNode[];
  }

  // 将扁平文件路径转换为树形结构
  const buildFileTree = useCallback((files: FileItem[]): TreeNode[] => {
    const root: TreeNode[] = [];

    files.forEach(({ path }) => {
      const parts = path.split(/[/\\]/);
      let current = root;

      parts.forEach((part, index) => {
        const isFile = index === parts.length - 1;
        const existing = current.find((n) => n.name === part);

        if (existing) {
          if (!isFile) {
            current = existing.children;
          }
        } else {
          // 使用原始路径中的分隔符
          const sep = path.includes("\\") ? "\\" : "/";
          const node: TreeNode = {
            name: part,
            path: isFile ? path : parts.slice(0, index + 1).join(sep),
            isFile,
            children: [],
          };
          current.push(node);
          if (!isFile) {
            current = node.children;
          }
        }
      });
    });

    return root;
  }, []);

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

  // 切换文件暂存状态
  const toggleFileStaging = useCallback(
    async (filePath: string) => {
      const dir = getCurrentDir();
      if (!dir) return;

      const isCurrentlyStaged = stagedFiles.has(filePath);

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
    [getCurrentDir, switchBranch, loadGitInfo],
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
    [getCurrentDir, commitMessage, commitChanges, loadGitInfo, loadTree],
  );

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

  // 放弃更改 - 打开确认弹窗
  const handleDiscardChanges = useCallback((filePath: string) => {
    setConfirmDialog({ open: true, filePath });
  }, []);

  const allFiles = getAllFiles();
  const modifiedCount = gitStatus?.modified.length || 0;
  const untrackedCount = gitStatus?.not_added.length || 0;

  // 获取目录下所有文件路径
  const getFilesInDir = useCallback(
    (dirPath: string): string[] => {
      return allFiles
        .filter(
          (f) =>
            f.path.startsWith(dirPath + "/") ||
            f.path.startsWith(dirPath + "\\"),
        )
        .map((f) => f.path);
    },
    [allFiles],
  );

  // 检查目录下所有文件是否都已暂存
  const isDirFullyStaged = useCallback(
    (dirPath: string): boolean => {
      const files = getFilesInDir(dirPath);
      return files.length > 0 && files.every((f) => stagedFiles.has(f));
    },
    [getFilesInDir, stagedFiles],
  );

  // 检查目录下是否有部分文件已暂存
  const isDirPartiallyStaged = useCallback(
    (dirPath: string): boolean => {
      const files = getFilesInDir(dirPath);
      const stagedCount = files.filter((f) => stagedFiles.has(f)).length;
      return stagedCount > 0 && stagedCount < files.length;
    },
    [getFilesInDir, stagedFiles],
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

    try {
      // 处理目录级别的放弃更改
      if (filePath.endsWith("/*")) {
        const dirPath = filePath.slice(0, -2);
        const files = getFilesInDir(dirPath);
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
      } else {
        const result = await discardChanges(dir, filePath);
        if (result.code === CodeResult.Success) {
          showMessage("success", "已放弃更改");
        } else {
          showMessage("error", result.message || "放弃更改失败");
          return;
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
  ]);

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
              onClick={onClose}
              className="p-1 rounded-lg transition-colors hover:bg-accent"
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
        className="w-[480px] max-h-[80vh] rounded-xl shadow-2xl overflow-hidden flex flex-col"
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
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors hover:bg-accent"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="h-4 w-4" />
          </button>
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
              <button
                onClick={() => setShowBranchList(!showBranchList)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-[var(--bg-tertiary)] text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-bg)]"
                disabled={loading}
              >
                <GitBranchIcon className="h-3.5 w-3.5" />
                {currentBranch || "未选择"}
                {showBranchList ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
              <button
                onClick={() => setShowCreateBranch(!showCreateBranch)}
                className="p-1.5 rounded-lg transition-colors hover:bg-accent hover:text-foreground"
                style={{ color: "var(--text-muted)" }}
                title="创建新分支"
              >
                <Plus className="h-4 w-4" />
              </button>
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
                  key={branch.name}
                  onClick={() => handleSwitchBranch(branch.name)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-accent"
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
                onClick={() => {
                  setShowBranchList(false);
                  setShowCreateBranch(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-foreground"
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
              <button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim() || loading}
                className="px-3 py-1.5 text-sm rounded-lg transition-colors"
                style={{
                  backgroundColor:
                    newBranchName.trim() && !loading
                      ? "var(--accent-color)"
                      : "var(--bg-tertiary)",
                  color:
                    newBranchName.trim() && !loading
                      ? "#ffffff"
                      : "var(--text-muted)",
                }}
              >
                创建
              </button>
              <button
                onClick={() => {
                  setShowCreateBranch(false);
                  setNewBranchName("");
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-bg)]"
              >
                取消
              </button>
            </div>
          )}

          {/* 提交信息 */}
          <div>
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="提交信息（留空将自动生成）..."
              rows={2}
              className="w-full px-3 py-1.5 text-sm rounded-lg resize-none outline-none"
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
            <div className="flex items-center gap-2 mt-1.5">
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
                className="text-sm cursor-pointer"
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
                  <span style={{ color: "#e2c08d" }}>
                    ~{modifiedCount} 已修改
                  </span>
                )}
                {untrackedCount > 0 && (
                  <span style={{ color: "#73c991" }}>
                    +{untrackedCount} 未跟踪
                  </span>
                )}
                <button
                  onClick={() => setTreeView(!treeView)}
                  className="p-1 rounded transition-colors hover:bg-[var(--hover-bg)]"
                  style={{ color: "var(--text-muted)" }}
                  title={treeView ? "列表视图" : "树形视图"}
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
            className="flex-1 overflow-y-auto"
            style={{ backgroundColor: "var(--bg-primary)" }}
          >
            {treeView
              ? // 树形视图 - 基于路径深度计算缩进
                (() => {
                  const tree = buildFileTree(allFiles);
                  const renderNode = (node: TreeNode, depth: number = 0) => {
                    // 根据路径中的分隔符数量计算真实深度
                    const realDepth = node.path.split(/[/\\]/).length - 1;

                    if (node.isFile) {
                      return (
                        <div
                          key={node.path}
                          className="flex items-center justify-between px-4 py-2 text-sm group"
                          style={{
                            borderBottom: "1px solid var(--border-color)",
                            paddingLeft: `${16 + realDepth * 20}px`,
                          }}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <input
                              type="checkbox"
                              checked={stagedFiles.has(node.path)}
                              onChange={() => toggleFileStaging(node.path)}
                              className="rounded w-3.5 h-3.5 cursor-pointer"
                              style={{
                                accentColor: "var(--accent-color)",
                                outline: "none",
                              }}
                            />
                            <span
                              className="truncate"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {node.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleOpenFile(node.path)}
                              className="p-1 rounded transition-colors hover:bg-accent hover:text-foreground"
                              style={{ color: "var(--text-muted)" }}
                              title="打开文件"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDiscardChanges(node.path)}
                              className="p-1 rounded transition-colors hover:bg-accent hover:text-[#f14c4c]"
                              style={{ color: "var(--text-muted)" }}
                              title="放弃更改"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    }

                    const isExpanded = expandedDirs.has(node.path);
                    const allStaged = isDirFullyStaged(node.path);
                    const partialStaged = isDirPartiallyStaged(node.path);

                    return (
                      <div key={node.path}>
                        <div
                          className="flex items-center justify-between px-4 py-2 text-sm group"
                          style={{
                            borderBottom: "1px solid var(--border-color)",
                            paddingLeft: `${16 + realDepth * 20}px`,
                          }}
                        >
                          <div
                            className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                            onClick={() => toggleDir(node.path)}
                          >
                            <ChevronRight
                              className="h-3.5 w-3.5 transition-transform"
                              style={{
                                color: "var(--text-muted)",
                                transform: isExpanded
                                  ? "rotate(90deg)"
                                  : "rotate(0deg)",
                              }}
                            />
                            <input
                              type="checkbox"
                              checked={allStaged}
                              ref={(el) => {
                                if (el) el.indeterminate = partialStaged;
                              }}
                              onChange={() => toggleDirStaging(node.path)}
                              className="rounded w-3.5 h-3.5 cursor-pointer"
                              style={{
                                accentColor: "var(--accent-color)",
                                outline: "none",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span style={{ color: "var(--text-primary)" }}>
                              {node.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleDiscardDirChanges(node.path)}
                              className="p-1 rounded transition-colors hover:bg-accent hover:text-[#f14c4c]"
                              style={{ color: "var(--text-muted)" }}
                              title="放弃目录更改"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {isExpanded &&
                          node.children.map((child) =>
                            renderNode(child, depth + 1),
                          )}
                      </div>
                    );
                  };

                  return tree.map((node) => renderNode(node));
                })()
              : // 列表视图
                allFiles.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center justify-between px-4 py-2 text-sm group"
                    style={{ borderBottom: "1px solid var(--border-color)" }}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={stagedFiles.has(file.path)}
                        onChange={() => toggleFileStaging(file.path)}
                        className="rounded w-3.5 h-3.5 cursor-pointer"
                        style={{ accentColor: "var(--accent-color)" }}
                      />
                      <span
                        className="truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {file.path}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleOpenFile(file.path)}
                        className="p-1 rounded transition-colors hover:bg-accent hover:text-foreground"
                        style={{ color: "var(--text-muted)" }}
                        title="打开文件"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDiscardChanges(file.path)}
                        className="p-1 rounded transition-colors hover:bg-accent hover:text-[#f14c4c]"
                        style={{ color: "var(--text-muted)" }}
                        title="放弃更改"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
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
            <button
              onClick={handlePull}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] transition-colors disabled:opacity-50 hover:bg-[var(--hover-bg)]"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              拉取
            </button>
            <button
              onClick={handlePush}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] transition-colors disabled:opacity-50 hover:bg-[var(--hover-bg)]"
            >
              <GitCommit className="h-3.5 w-3.5" />
              推送
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCommit(false)}
              disabled={loading}
              className="px-4 py-1.5 text-sm rounded-md bg-transparent text-[var(--text-primary)] border border-[var(--border-color)] transition-colors disabled:opacity-50 hover:bg-[var(--hover-bg)]"
            >
              提交
            </button>
            <button
              onClick={() => handleCommit(true)}
              disabled={loading}
              className="px-4 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] transition-colors disabled:opacity-50 hover:bg-[var(--hover-bg)]"
            >
              提交并推送
            </button>
          </div>
        </div>
      </div>

      {/* 确认放弃更改弹窗 */}
      {confirmDialog.open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          onClick={() => setConfirmDialog({ open: false, filePath: "" })}
        >
          <div
            className="w-[400px] rounded-xl shadow-2xl overflow-hidden"
            style={{ backgroundColor: "var(--bg-secondary)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between p-4"
              style={{ borderBottom: "1px solid var(--border-color)" }}
            >
              <span
                className="font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                确认放弃更改
              </span>
              <button
                onClick={() => setConfirmDialog({ open: false, filePath: "" })}
                className="p-1 rounded-lg transition-colors hover:bg-[var(--hover-bg)]"
              >
                <X className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                确定要放弃{" "}
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                  {confirmDialog.filePath.endsWith("/*")
                    ? `目录 "${confirmDialog.filePath.slice(0, -2)}" 下的所有更改`
                    : `"${confirmDialog.filePath}" 的更改`}
                </span>
                吗？
              </p>
              <p
                className="text-xs mt-2"
                style={{ color: "var(--text-muted)" }}
              >
                此操作不可撤销。
              </p>
            </div>
            <div
              className="flex items-center justify-end gap-2 p-4"
              style={{ borderTop: "1px solid var(--border-color)" }}
            >
              <button
                onClick={() => setConfirmDialog({ open: false, filePath: "" })}
                className="px-4 py-1.5 text-sm rounded-md bg-transparent text-[var(--text-primary)] border border-[var(--border-color)] transition-colors hover:bg-[var(--hover-bg)]"
              >
                取消
              </button>
              <button
                onClick={confirmDiscardChanges}
                className="px-4 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-bg)]"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
