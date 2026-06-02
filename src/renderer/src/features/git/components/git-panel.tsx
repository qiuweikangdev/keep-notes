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
  } = useElectron();
  const { treeRoot } = useTreeStore();

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

  // 切换文件暂存状态
  const toggleFileStaging = useCallback(
    async (filePath: string) => {
      const dir = getCurrentDir();
      if (!dir) return;

      const isCurrentlyStaged = stagedFiles.has(filePath);

      try {
        setLoading(true);
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
      } finally {
        setLoading(false);
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
        if (includeUntracked) {
          await addFilesToStaging(dir, []);
        }
        const options: GitCommitOptions = {
          message,
          push: pushAfterCommit,
        };
        const result = await commitChanges(dir, options);
        if (result.code === CodeResult.Success) {
          setCommitMessage("");
          await loadGitInfo();
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
      commitChanges,
      addFilesToStaging,
      loadGitInfo,
    ],
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
      } else {
        showMessage("error", result.message || "拉取失败");
      }
    } catch (error) {
      showMessage("error", "拉取失败");
    } finally {
      setLoading(false);
    }
  }, [getCurrentDir, pullFromRemote, loadGitInfo]);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
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
              onClick={onClose}
              className="p-1 rounded-lg transition-colors"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
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

  const allFiles = getAllFiles();
  const modifiedCount = gitStatus?.modified.length || 0;
  const untrackedCount = gitStatus?.not_added.length || 0;

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
            className="p-1 rounded-lg transition-colors"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
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

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 当前分支 */}
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              当前分支
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowBranchList(!showBranchList)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                }}
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
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
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
                  className="w-full flex items-center justify-between px-3 py-2 text-sm transition-colors"
                  style={{
                    backgroundColor: branch.current
                      ? "var(--active-bg)"
                      : "transparent",
                    color: branch.current
                      ? "var(--accent-color)"
                      : "var(--text-primary)",
                  }}
                  onMouseEnter={(e) => {
                    if (!branch.current) {
                      e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!branch.current) {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
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
                className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors"
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
                className="px-3 py-1.5 text-sm rounded-lg transition-colors"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  color: "var(--text-primary)",
                }}
              >
                取消
              </button>
            </div>
          )}

          {/* 文件状态 */}
          {allFiles.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
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
                </div>
              </div>

              {/* 文件列表 */}
              <div
                className="rounded-lg overflow-hidden"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                {allFiles.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center justify-between px-3 py-2 text-sm"
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
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 无更改提示 */}
          {allFiles.length === 0 && (
            <div
              className="text-center py-6"
              style={{ color: "var(--text-muted)" }}
            >
              <GitCommit className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">无更改</p>
            </div>
          )}

          {/* 提交信息 */}
          <div>
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="提交信息（留空将自动生成）..."
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg resize-none outline-none"
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
            <div className="flex items-center gap-2 mt-2">
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
        </div>

        {/* 底部按钮 */}
        <div
          className="flex items-center justify-between p-4"
          style={{ borderTop: "1px solid var(--border-color)" }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={handlePull}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-primary)",
              }}
              onMouseEnter={(e) => {
                if (!loading)
                  e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
              }}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              拉取
            </button>
            <button
              onClick={handlePush}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-primary)",
              }}
              onMouseEnter={(e) => {
                if (!loading)
                  e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
              }}
            >
              <GitCommit className="h-3.5 w-3.5" />
              推送
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCommit(false)}
              disabled={loading}
              className="px-4 py-1.5 text-sm rounded-lg transition-colors"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-primary)",
              }}
              onMouseEnter={(e) => {
                if (!loading)
                  e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
              }}
            >
              提交
            </button>
            <button
              onClick={() => handleCommit(true)}
              disabled={loading}
              className="px-4 py-1.5 text-sm rounded-lg transition-colors"
              style={{
                backgroundColor: loading
                  ? "var(--bg-tertiary)"
                  : "var(--accent-color)",
                color: "#ffffff",
              }}
              onMouseEnter={(e) => {
                if (!loading)
                  e.currentTarget.style.backgroundColor = "var(--accent-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = loading
                  ? "var(--bg-tertiary)"
                  : "var(--accent-color)";
              }}
            >
              提交并推送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
