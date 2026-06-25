import {
  Minus,
  Square,
  X,
  Settings,
  Sun,
  Moon,
  Search,
  GitBranch,
  ArrowLeft,
  ArrowRight,
  Bell,
} from "lucide-react";
import { useUIStore } from "@/store/ui.store";
import { useEditorStore } from "@/store/editor.store";
import { useTheme } from "@/hooks/use-theme";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { SearchModal } from "@/features/search";
import { GitPanel } from "@/features/git";
import { useElectron } from "@/hooks/use-electron";
import { useTreeStore } from "@/store/tree.store";
import { useReminderStore } from "@/store/reminder.store";
import { CodeResult } from "@/types";
import {
  MAC_TITLE_BAR_HEIGHT,
  MAC_TRAFFIC_LIGHT_PLACEHOLDER_WIDTH,
} from "@shared/title-bar";

interface TitleBarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function TitleBar({ collapsed, onToggleCollapse }: TitleBarProps) {
  const { setSettingsOpen } = useUIStore();
  const { appearance } = useEditorStore();
  const { isDark, toggleTheme } = useTheme();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isGitOpen, setIsGitOpen] = useState(false);
  const [isGitRepo, setIsGitRepo] = useState(false);
  const titleBarRef = useRef<HTMLDivElement>(null);
  const { detectGitRepo, openFile } = useElectron();

  // 双击标题栏最大化/还原窗口
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      console.log("Double-click detected", e.target);
      const target = e.target as HTMLElement;
      if (target.closest("button")) {
        console.log("Ignoring button click");
        return;
      }
      console.log("Calling maximizeWindow");
      window.electronAPI.maximizeWindow();
    },
    [],
  );

  const { treeRoot } = useTreeStore();
  const openReminderList = useReminderStore((state) => state.openList);

  // 文件导航历史状态
  const historyRef = useRef<{ files: string[]; index: number }>({
    files: [],
    index: -1,
  });
  const [, forceUpdate] = useState(0);
  const isNavigatingRef = useRef(false);

  // 平台判断
  const isMac = useMemo(() => {
    return window.electronAPI?.getPlatform() === "darwin";
  }, []);

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
  }, [isGitRepo]);

  // 注意：Windows 上 drag 区域的原生双击最大化行为可能与自定义处理器冲突
  // 如果出现问题，可能需要进一步调试

  // 检测 Git 仓库
  useEffect(() => {
    const checkGitRepo = async () => {
      const dir = treeRoot?.key;
      if (!dir) {
        setIsGitRepo(false);
        return;
      }

      try {
        const result = await detectGitRepo(dir);
        setIsGitRepo(
          result.code === CodeResult.Success && result.data?.isGitRepo === true,
        );
      } catch (error) {
        console.error("Git detect error:", error);
        setIsGitRepo(false);
      }
    };

    checkGitRepo();
  }, [treeRoot, detectGitRepo]);

  // 添加文件到导航历史
  const addToHistory = useCallback((filePath: string) => {
    // 如果是通过前进/后退触发的，不添加到历史
    if (isNavigatingRef.current) {
      isNavigatingRef.current = false;
      return;
    }
    const history = historyRef.current;
    // 截断当前位置之后的历史记录
    history.files = history.files.slice(0, history.index + 1);
    // 避免连续添加相同的文件
    if (history.files[history.files.length - 1] !== filePath) {
      history.files.push(filePath);
      history.index = history.files.length - 1;
    }
    forceUpdate((n) => n + 1);
  }, []);

  // 返回上一个文件
  const handleGoBack = useCallback(async () => {
    const history = historyRef.current;
    if (history.index > 0) {
      isNavigatingRef.current = true;
      history.index -= 1;
      const targetFile = history.files[history.index];
      forceUpdate((n) => n + 1);
      if (targetFile) {
        await openFile(targetFile);
      }
      isNavigatingRef.current = false;
    }
  }, [openFile]);

  // 前进到下一个文件
  const handleGoForward = useCallback(async () => {
    const history = historyRef.current;
    if (history.index < history.files.length - 1) {
      isNavigatingRef.current = true;
      history.index += 1;
      const targetFile = history.files[history.index];
      forceUpdate((n) => n + 1);
      if (targetFile) {
        await openFile(targetFile);
      }
      isNavigatingRef.current = false;
    }
  }, [openFile]);

  // 暴露导航函数到全局，供快捷键和文件树调用
  useEffect(() => {
    window.__addFileToHistory = addToHistory;
    window.__navigateBack = handleGoBack;
    window.__navigateForward = handleGoForward;
    return () => {
      delete window.__addFileToHistory;
      delete window.__navigateBack;
      delete window.__navigateForward;
    };
  }, [addToHistory, handleGoBack, handleGoForward]);

  return (
    <>
      <div
        ref={titleBarRef}
        data-testid="title-bar"
        className="flex items-center select-none"
        onDoubleClick={handleDoubleClick}
        style={{
          // macOS 与原生红绿灯共享同一高度基准，避免左上角操作区视觉偏移。
          height: isMac ? `${MAC_TITLE_BAR_HEIGHT}px` : "44px",
          backgroundColor: "var(--bg-primary)",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        {/* macOS: 红绿灯按钮区域预留空间（78px），Windows: 无 */}
        {isMac && (
          <div
            data-testid="mac-traffic-light-spacer"
            className="h-full flex-shrink-0"
            style={{ width: `${MAC_TRAFFIC_LIGHT_PLACEHOLDER_WIDTH}px` }}
          />
        )}

        {/* 左侧：侧边栏切换 + 导航箭头 */}
        <div className="flex h-full items-center gap-1 pl-3">
          <button
            onClick={onToggleCollapse}
            className="flex items-center justify-center w-8 h-8 rounded-md transition-all"
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
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="2"
                  y="3"
                  width="12"
                  height="10"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <line
                  x1="5"
                  y1="6"
                  x2="5"
                  y2="10"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect
                  x="2"
                  y="3"
                  width="12"
                  height="10"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <line
                  x1="5"
                  y1="6"
                  x2="5"
                  y2="10"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <line
                  x1="8"
                  y1="6"
                  x2="8"
                  y2="10"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
            )}
          </button>
          {appearance.showFileHistoryNavigation && (
            <>
              <button
                disabled={historyRef.current.index <= 0}
                onClick={handleGoBack}
                className="flex items-center justify-center w-8 h-8 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => {
                  if (historyRef.current.index > 0) {
                    e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
                title={
                  historyRef.current.index > 0
                    ? "返回上一个文件"
                    : "没有历史记录"
                }
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                disabled={
                  historyRef.current.index >=
                  historyRef.current.files.length - 1
                }
                onClick={handleGoForward}
                className="flex items-center justify-center w-8 h-8 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => {
                  if (
                    historyRef.current.index <
                    historyRef.current.files.length - 1
                  ) {
                    e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
                title={
                  historyRef.current.index < historyRef.current.files.length - 1
                    ? "前进下一个文件"
                    : "没有更多记录"
                }
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* 中间：搜索栏 */}
        <div className="flex h-full flex-1 items-center justify-center px-4">
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
        <div className="flex h-full items-center gap-1 pr-2">
          <button
            onClick={openReminderList}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-all"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--hover-bg)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
            title="提醒事项"
          >
            <Bell className="h-4 w-4" />
          </button>

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
            title={isDark ? "切换亮色主题" : "切换暗色主题"}
          >
            {isDark ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
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

          {/* Windows: 显示自定义窗口控制按钮 */}
          {!isMac && (
            <>
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
            </>
          )}
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
