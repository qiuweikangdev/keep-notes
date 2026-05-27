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
} from "lucide-react";
import { useUIStore } from "@/store/ui.store";
import { cn } from "@/lib/cn";

interface TitleBarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function TitleBar({ collapsed, onToggleCollapse }: TitleBarProps) {
  const { theme, toggleTheme, setSettingsOpen } = useUIStore();

  return (
    <div
      className="flex items-center h-[44px] bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-sm border-b border-[#e5e5e5] dark:border-[#333] select-none"
      style={{ appRegion: "drag" } as React.CSSProperties}
    >
      {/* 左侧：侧边栏切换 + Logo */}
      <div
        className="flex items-center gap-3 pl-4"
        style={{ appRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={onToggleCollapse}
          className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] text-[#666] dark:text-[#999] hover:text-[#333] dark:hover:text-[#fff] transition-all"
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#0066ff] to-[#0044cc] flex items-center justify-center">
            <span className="text-white text-xs font-bold">K</span>
          </div>
          <span className="text-sm font-semibold text-[#1a1a1a] dark:text-[#f0f0f0]">
            Keep Notes
          </span>
        </div>
      </div>

      {/* 中间：搜索栏 */}
      <div
        className="flex-1 flex justify-center px-4"
        style={{ appRegion: "no-drag" } as React.CSSProperties}
      >
        <button className="flex items-center gap-2 h-[30px] w-[320px] max-w-[50%] px-3 bg-[#f5f5f5] dark:bg-[#2a2a2a] rounded-lg text-xs text-[#999] hover:bg-[#eee] dark:hover:bg-[#333] transition-colors border border-transparent hover:border-[#e0e0e0] dark:hover:border-[#444]">
          <Search className="h-3.5 w-3.5" />
          <span>搜索文件...</span>
          <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[#e8e8e8] dark:bg-[#3a3a3a] text-[#888]">
            ⌘P
          </kbd>
        </button>
      </div>

      {/* 右侧：主题切换 + 窗口控制 */}
      <div
        className="flex items-center gap-1 pr-2"
        style={{ appRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={toggleTheme}
          className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] text-[#666] dark:text-[#999] hover:text-[#333] dark:hover:text-[#fff] transition-all"
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
          className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] text-[#666] dark:text-[#999] hover:text-[#333] dark:hover:text-[#fff] transition-all"
          title="设置"
        >
          <Settings className="h-4 w-4" />
        </button>

        <div className="w-[1px] h-5 bg-[#e5e5e5] dark:bg-[#333] mx-1" />

        <button
          className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] text-[#666] dark:text-[#999] hover:text-[#333] dark:hover:text-[#fff] transition-all"
          onClick={() => window.electronAPI.minimizeWindow()}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[#f0f0f0] dark:hover:bg-[#2a2a2a] text-[#666] dark:text-[#999] hover:text-[#333] dark:hover:text-[#fff] transition-all"
          onClick={() => window.electronAPI.maximizeWindow()}
        >
          <Square className="h-3.5 w-3.5" />
        </button>
        <button
          className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[#ff4d4f] hover:text-white text-[#666] dark:text-[#999] transition-all"
          onClick={() => window.electronAPI.closeWindow()}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
