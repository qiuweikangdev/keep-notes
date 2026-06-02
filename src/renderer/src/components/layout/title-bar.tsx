import {
  Minus,
  Square,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  Moon,
  Search,
  GitBranch,
} from "lucide-react";
import { useUIStore } from "@/store/ui.store";
import { useTheme } from "@/hooks/use-theme";
import { useState, useCallback, useEffect, useRef } from "react";
import { SearchModal } from "@/features/search";
import { GitPanel } from "@/features/git";
import { useElectron } from "@/hooks/use-electron";
import { useTreeStore } from "@/store/tree.store";
import { useUserStore } from "@/store/user.store";
import { CodeResult } from "@/types";

interface TitleBarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function TitleBar({ collapsed, onToggleCollapse }: TitleBarProps) {
  const { setSettingsOpen } = useUIStore();
  const { theme, toggleTheme } = useTheme();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isGitOpen, setIsGitOpen] = useState(false);
  const [isGitRepo, setIsGitRepo] = useState(false);
  const titleBarRef = useRef<HTMLDivElement>(null);
  const { detectGitRepo } = useElectron();
  const { treeRoot } = useTreeStore();
  const { githubInfo } = useUserStore();

  // 处理搜索快捷键
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const isMeta = e.metaKey || e.ctrlKey;

    if (isMeta && e.key === "p") {
      e.preventDefault();
      setIsSearchOpen(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  // 应用拖拽样式
  useEffect(() => {
    if (titleBarRef.current) {
      titleBarRef.current.style.webkitAppRegion = "drag";
      // 为所有按钮设置 no-drag
      const buttons = titleBarRef.current.querySelectorAll("button");
      buttons.forEach((btn) => {
        btn.style.webkitAppRegion = "no-drag";
      });
    }
  }, []);

  // 检测 Git 仓库
  useEffect(() => {
    const checkGitRepo = async () => {
      const dir = treeRoot?.key || githubInfo.localPath;
      if (!dir) {
        setIsGitRepo(false);
        return;
      }

      try {
        const result = await detectGitRepo(dir);
        setIsGitRepo(
          result.code === CodeResult.Success && result.data?.isGitRepo === true,
        );
      } catch {
        setIsGitRepo(false);
      }
    };

    checkGitRepo();
  }, [treeRoot, githubInfo.localPath, detectGitRepo]);

  return (
    <>
      <div
        ref={titleBarRef}
        className="flex items-center h-[44px] select-none"
        style={{
          backgroundColor: "var(--bg-primary)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        {/* 左侧：侧边栏切换 + Logo */}
        <div className="flex items-center gap-3 pl-4">
          <button
            onClick={onToggleCollapse}
            className="flex items-center justify-center w-7 h-7 rounded-lg transition-all"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #0066ff, #0044cc)",
              }}
            >
              <span className="text-white text-xs font-bold">K</span>
            </div>
            <span
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Keep Notes
            </span>
          </div>
        </div>

        {/* 中间：搜索栏 */}
        <div className="flex-1 flex justify-center px-4">
          <button
            onClick={() => setIsSearchOpen(true)}
            className="flex items-center gap-2 h-[30px] w-[320px] max-w-[50%] px-3 rounded-lg text-xs transition-all"
            style={{
              backgroundColor: "var(--bg-secondary)",
              color: "var(--text-muted)",
              border: "1px solid transparent",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              e.currentTarget.style.borderColor = "var(--border-color)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
              e.currentTarget.style.borderColor = "transparent";
            }}
          >
            <Search className="h-3.5 w-3.5" />
            <span>搜索文件...</span>
            <kbd
              className="ml-auto text-[10px] px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-muted)",
              }}
            >
              ⌘P
            </kbd>
          </button>
        </div>

        {/* 右侧：Git 图标 + 主题切换 + 窗口控制 */}
        <div className="flex items-center gap-1 pr-2">
          {/* Git 图标 - 仅在 Git 仓库中显示 */}
          {isGitRepo && (
            <button
              onClick={() => setIsGitOpen(true)}
              className="flex items-center justify-center w-8 h-8 rounded-lg transition-all"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
              title="Git 操作"
            >
              <GitBranch className="h-4 w-4" />
            </button>
          )}

          <button
            onClick={toggleTheme}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
            title={theme === "light" ? "切换暗色主题" : "切换亮色主题"}
          >
            {theme === "light" ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
            title="设置"
          >
            <Settings className="h-4 w-4" />
          </button>

          <div
            className="w-[1px] h-5 mx-1"
            style={{ backgroundColor: "var(--border-color)" }}
          />

          <button
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
            onClick={() => window.electronAPI.minimizeWindow()}
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
            onClick={() => window.electronAPI.maximizeWindow()}
          >
            <Square className="h-3.5 w-3.5" />
          </button>
          <button
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#ff4d4f";
              e.currentTarget.style.color = "#ffffff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
            onClick={() => window.electronAPI.closeWindow()}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 搜索弹窗 */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />

      {/* Git 面板 */}
      <GitPanel isOpen={isGitOpen} onClose={() => setIsGitOpen(false)} />
    </>
  );
}
