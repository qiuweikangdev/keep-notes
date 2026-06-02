import { useState, useEffect, useCallback } from "react";
import { useElectron } from "@/hooks/use-electron";
import { useTreeStore } from "@/store/tree.store";
import { useUserStore } from "@/store/user.store";
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

export function GitPanel({ isOpen, onClose }: GitPanelProps) {
  const {
    detectGitRepo,
    getCurrentBranch,
    getBranches,
    switchBranch,
    createBranch,
    getGitStatus,
    commitChanges,
    pushToRemote,
    pullFromRemote,
  } = useElectron();
  const { treeRoot } = useTreeStore();
  const { githubInfo } = useUserStore();

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

  // 获取当前工作目录
  const getCurrentDir = useCallback(() => {
    return treeRoot?.key || githubInfo.localPath || "";
  }, [treeRoot, githubInfo.localPath]);

  // 检测 Git 仓库并加载状态
  const loadGitInfo = useCallback(async () => {
    const dir = getCurrentDir();
    if (!dir) return;

    try {
      setLoading(true);
      const detectResult = await detectGitRepo(dir);
      if (detectResult.code === CodeResult.Success && detectResult.data) {
        setIsGitRepo(detectResult.data.isGitRepo);
        if (detectResult.data.isGitRepo) {
          // 加载分支信息
          const branchResult = await getBranches(dir);
          if (branchResult.code === CodeResult.Success && branchResult.data) {
            setBranches(branchResult.data);
            const current = branchResult.data.find((b) => b.current);
            if (current) {
              setCurrentBranch(current.name);
            }
          }

          // 加载 Git 状态
          const statusResult = await getGitStatus(dir);
          if (statusResult.code === CodeResult.Success && statusResult.data) {
            setGitStatus(statusResult.data);
          }
        }
      }
    } catch (error) {
      console.error("加载 Git 信息失败:", error);
    } finally {
      setLoading(false);
    }
  }, [getCurrentDir, detectGitRepo, getBranches, getGitStatus]);

  // 组件挂载时加载 Git 信息
  useEffect(() => {
    if (isOpen) {
      loadGitInfo();
    }
  }, [isOpen, loadGitInfo]);

  // 切换分支
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
          // 重新加载状态
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

  // 创建新分支
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
        // 重新加载状态
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

  // 提交更改
  const handleCommit = useCallback(
    async (pushAfterCommit: boolean = false) => {
      const dir = getCurrentDir();
      if (!dir || !commitMessage.trim()) return;

      try {
        setLoading(true);
        const options: GitCommitOptions = {
          message: commitMessage.trim(),
          push: pushAfterCommit,
        };
        const result = await commitChanges(dir, options);
        if (result.code === CodeResult.Success) {
          setCommitMessage("");
          // 重新加载状态
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
    [getCurrentDir, commitMessage, commitChanges, loadGitInfo],
  );

  // 推送到远程
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

  // 从远程拉取
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

  // 显示消息
  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  if (!isOpen) return null;

  // 如果不是 Git 仓库，显示提示信息
  if (!isGitRepo) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
        onClick={onClose}
      >
        <div
          className="w-[400px] rounded-lg shadow-xl"
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-[500px] max-h-[80vh] rounded-lg shadow-xl overflow-hidden"
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
            className="px-4 py-2 text-sm"
            style={{
              backgroundColor:
                message.type === "success"
                  ? "rgba(34, 197, 94, 0.1)"
                  : "rgba(239, 68, 68, 0.1)",
              color: message.type === "success" ? "#22c55e" : "#ef4444",
              borderBottom: "1px solid var(--border-color)",
            }}
          >
            {message.text}
          </div>
        )}

        {/* 内容区域 */}
        <div className="p-4 space-y-4">
          {/* 分支信息 */}
          <div
            className="p-3 rounded-lg"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                当前分支
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowBranchList(!showBranchList)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                  disabled={loading}
                >
                  {currentBranch || "未选择"}
                  {showBranchList ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
                <button
                  onClick={() => setShowCreateBranch(!showCreateBranch)}
                  className="p-1 rounded transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
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
                className="mt-2 rounded-lg overflow-hidden"
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
                        e.currentTarget.style.backgroundColor =
                          "var(--hover-bg)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!branch.current) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    <span>{branch.name}</span>
                    {branch.current && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            )}

            {/* 创建新分支输入框 */}
            {showCreateBranch && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="新分支名称"
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateBranch();
                    }
                  }}
                />
                <button
                  onClick={handleCreateBranch}
                  disabled={!newBranchName.trim() || loading}
                  className="px-3 py-1.5 text-sm rounded-lg transition-colors"
                  style={{
                    backgroundColor: "var(--accent-color)",
                    color: "white",
                    opacity: !newBranchName.trim() || loading ? 0.5 : 1,
                  }}
                >
                  创建
                </button>
              </div>
            )}
          </div>

          {/* 状态信息 */}
          {gitStatus && (
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  文件状态
                </span>
                <div className="flex items-center gap-2 text-xs">
                  {gitStatus.staged.length > 0 && (
                    <span style={{ color: "#22c55e" }}>
                      +{gitStatus.staged.length} 已暂存
                    </span>
                  )}
                  {gitStatus.modified.length > 0 && (
                    <span style={{ color: "#f59e0b" }}>
                      ~{gitStatus.modified.length} 已修改
                    </span>
                  )}
                  {gitStatus.not_added.length > 0 && (
                    <span style={{ color: "#3b82f6" }}>
                      +{gitStatus.not_added.length} 未跟踪
                    </span>
                  )}
                  {gitStatus.deleted.length > 0 && (
                    <span style={{ color: "#ef4444" }}>
                      -{gitStatus.deleted.length} 已删除
                    </span>
                  )}
                </div>
              </div>

              {/* 文件列表 */}
              {gitStatus.files.length > 0 ? (
                <div
                  className="max-h-[120px] overflow-y-auto rounded-lg"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  {gitStatus.files.slice(0, 10).map((file) => (
                    <div
                      key={file.path}
                      className="flex items-center justify-between px-3 py-1.5 text-xs"
                      style={{ borderBottom: "1px solid var(--border-color)" }}
                    >
                      <span
                        className="truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {file.path}
                      </span>
                      <div className="flex items-center gap-1">
                        {file.index && file.index !== " " && (
                          <span
                            className="px-1 rounded"
                            style={{
                              backgroundColor: "rgba(34, 197, 94, 0.1)",
                              color: "#22c55e",
                            }}
                          >
                            {file.index}
                          </span>
                        )}
                        {file.working_dir && file.working_dir !== " " && (
                          <span
                            className="px-1 rounded"
                            style={{
                              backgroundColor: "rgba(245, 158, 11, 0.1)",
                              color: "#f59e0b",
                            }}
                          >
                            {file.working_dir}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {gitStatus.files.length > 10 && (
                    <div
                      className="px-3 py-1.5 text-xs text-center"
                      style={{ color: "var(--text-muted)" }}
                    >
                      还有 {gitStatus.files.length - 10} 个文件...
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className="text-xs text-center py-2"
                  style={{ color: "var(--text-muted)" }}
                >
                  没有修改的文件
                </div>
              )}
            </div>
          )}

          {/* 提交信息 */}
          <div>
            <label
              className="block text-xs mb-1"
              style={{ color: "var(--text-muted)" }}
            >
              提交信息
            </label>
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="输入提交信息..."
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg resize-none"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            />
            <div className="flex items-center gap-2 mt-2">
              <input
                type="checkbox"
                id="includeUntracked"
                checked={includeUntracked}
                onChange={(e) => setIncludeUntracked(e.target.checked)}
                className="rounded"
              />
              <label
                htmlFor="includeUntracked"
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                包含未跟踪的文件
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
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-primary)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
              }}
            >
              <RefreshCw className="h-4 w-4" />
              拉取
            </button>
            <button
              onClick={handlePush}
              disabled={loading}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition-colors"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-primary)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-tertiary)";
              }}
            >
              <GitCommit className="h-4 w-4" />
              推送
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCommit(false)}
              disabled={loading || !commitMessage.trim()}
              className="px-4 py-1.5 text-sm rounded-lg transition-colors"
              style={{
                backgroundColor: "var(--accent-color)",
                color: "white",
                opacity: loading || !commitMessage.trim() ? 0.5 : 1,
              }}
            >
              提交
            </button>
            <button
              onClick={() => handleCommit(true)}
              disabled={loading || !commitMessage.trim()}
              className="px-4 py-1.5 text-sm rounded-lg transition-colors"
              style={{
                backgroundColor: "var(--accent-hover)",
                color: "white",
                opacity: loading || !commitMessage.trim() ? 0.5 : 1,
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
