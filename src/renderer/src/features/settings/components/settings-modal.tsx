import { useEffect, useState } from "react";
import { useUIStore } from "@/store/ui.store";
import { useEditorStore } from "@/store/editor.store";
import { useTheme } from "@/hooks/use-theme";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { ThemeModeSelector } from "@/components/ui/theme-mode-selector";
import { SettingRow } from "@/components/ui/setting-row";
import { FontSelector } from "@/components/ui/font-selector";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Palette,
  ChevronRight,
  Keyboard,
  Info,
  RefreshCw,
  ExternalLink,
  XCircle,
  Download,
} from "lucide-react";
import { ShortcutsSettings } from "./shortcuts-settings";
import type { AppInfo, AppUpdateState, AppUpdateStatus } from "@shared/types";

type SettingsTab = "appearance" | "shortcuts" | "about";

const settingsMenuItems = [
  { id: "appearance" as SettingsTab, label: "外观", icon: Palette },
  { id: "shortcuts" as SettingsTab, label: "键盘快捷键", icon: Keyboard },
  { id: "about" as SettingsTab, label: "关于", icon: Info },
];

const fontFamilyOptions = [
  {
    label: "系统字体",
    value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  {
    label: "SF Pro",
    value: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  {
    label: "Inter",
    value: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  {
    label: "Noto Sans",
    value: '"Noto Sans SC", -apple-system, BlinkMacSystemFont, sans-serif',
  },
  {
    label: "Source Han Sans",
    value:
      '"Source Han Sans SC", -apple-system, BlinkMacSystemFont, sans-serif',
  },
];

const codeFontOptions = [
  {
    label: "SF Mono",
    value: '"SF Mono", ui-monospace, "Cascadia Code", Consolas, monospace',
  },
  {
    label: "JetBrains Mono",
    value: '"JetBrains Mono", ui-monospace, Consolas, monospace',
  },
  {
    label: "Fira Code",
    value: '"Fira Code", "Cascadia Code", Consolas, monospace',
  },
  {
    label: "Cascadia Code",
    value: '"Cascadia Code", "Fira Code", Consolas, monospace',
  },
  { label: "Consolas", value: 'Consolas, "Courier New", monospace' },
];

const EDITOR_PADDING_MIN = 72;
const EDITOR_PADDING_MAX = 120;

const defaultAppInfo: AppInfo = {
  version: "",
  repositoryUrl: "",
  author: "",
};

const defaultUpdateState: AppUpdateState = {
  status: "idle",
  currentVersion: "",
};

const cancellableUpdateStatuses: AppUpdateStatus[] = [
  "checking",
  "available",
  "downloading",
];

function getUpdateStatusText(state: AppUpdateState): string {
  switch (state.status) {
    case "checking":
      return "正在检查更新...";
    case "available":
      return state.version
        ? `发现新版本 v${state.version}，正在准备下载...`
        : "发现新版本，正在准备下载...";
    case "downloading":
      return state.version ? `正在下载 v${state.version}` : "正在下载更新...";
    case "downloaded":
      return state.version
        ? `v${state.version} 已下载，重启应用后安装。`
        : "更新已下载，重启应用后安装。";
    case "not-available":
      return "当前已是最新版本。";
    case "canceled":
      return "已取消更新操作。";
    case "error":
      return state.message || "更新操作失败，请稍后再试。";
    case "idle":
    default:
      return "点击检查更新以获取 GitHub 最新发布版本。";
  }
}

function getRepositoryLabel(repositoryUrl: string): string {
  return repositoryUrl
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "");
}

export function SettingsModal() {
  const { isSettingsOpen, setSettingsOpen } = useUIStore();
  const { appearance, setAppearance } = useEditorStore();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");
  const [appInfo, setAppInfo] = useState<AppInfo>(defaultAppInfo);
  const [updateState, setUpdateState] =
    useState<AppUpdateState>(defaultUpdateState);
  const editorPaddingProgress =
    ((Math.max(appearance.padding, EDITOR_PADDING_MIN) - EDITOR_PADDING_MIN) /
      (EDITOR_PADDING_MAX - EDITOR_PADDING_MIN)) *
    100;
  const displayVersion =
    appInfo.version ||
    updateState.currentVersion ||
    defaultUpdateState.currentVersion;
  const isUpdateCancellable = cancellableUpdateStatuses.includes(
    updateState.status,
  );
  const progressPercent = Math.round(updateState.progress?.percent ?? 0);
  const repositoryLabel = getRepositoryLabel(appInfo.repositoryUrl);

  useEffect(() => {
    if (!isSettingsOpen) return;

    let isMounted = true;
    const unsubscribe = window.electronAPI.onUpdateState((state) => {
      if (!isMounted) return;
      setUpdateState(state);
    });

    void Promise.all([
      window.electronAPI.getAppInfo(),
      window.electronAPI.getUpdateState(),
    ]).then(([info, state]) => {
      if (!isMounted) return;
      setAppInfo(info);
      setUpdateState(state);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isSettingsOpen]);

  const handleOpenChange = (open: boolean) => {
    if (!open && isUpdateCancellable) {
      void window.electronAPI.cancelUpdate();
    }
    setSettingsOpen(open);
  };

  const handleCheckForUpdates = async () => {
    const state = await window.electronAPI.checkForUpdates();
    setUpdateState(state);
  };

  const handleCancelUpdate = async () => {
    const state = await window.electronAPI.cancelUpdate();
    setUpdateState(state);
  };

  const handleInstallUpdate = () => {
    void window.electronAPI.installUpdate();
  };

  const handleOpenRepository = () => {
    void window.electronAPI.openRepository();
  };

  const renderContent = () => {
    switch (activeTab) {
      case "appearance":
        return (
          <div className="space-y-0">
            {/* 主题选择 */}
            <div style={{ borderBottom: "1px solid var(--border-color)" }}>
              <div className="flex items-center justify-between py-3.5">
                <div>
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    主题
                  </span>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "var(--text-muted)" }}
                  >
                    使用浅色、深色，或匹配系统设置
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <ThemeModeSelector
                    value={theme}
                    onChange={(val) => setTheme(val)}
                  />
                </div>
              </div>
            </div>

            {/* 编辑模式切换 */}
            <div style={{ borderBottom: "1px solid var(--border-color)" }}>
              <SettingRow
                label="编辑模式切换"
                description="在编辑器标签栏显示富文本与 Markdown 源码切换按钮"
              >
                <Switch
                  checked={appearance.showModeSwitcher}
                  onCheckedChange={(checked) =>
                    setAppearance({ showModeSwitcher: checked })
                  }
                />
              </SettingRow>
            </div>

            {/* 底部操作栏悬停显示 */}
            <div style={{ borderBottom: "1px solid var(--border-color)" }}>
              <SettingRow
                label="底部操作栏悬停显示"
                description="鼠标悬停在侧边栏时显示底部操作栏"
              >
                <Switch
                  checked={appearance.showBottomBarOnHover}
                  onCheckedChange={(checked) =>
                    setAppearance({ showBottomBarOnHover: checked })
                  }
                />
              </SettingRow>
            </div>

            {/* 文件历史导航 */}
            <div style={{ borderBottom: "1px solid var(--border-color)" }}>
              <SettingRow
                label="文件历史导航"
                description="在标题栏显示前进/后退按钮，用于切换最近打开的文件"
              >
                <Switch
                  checked={appearance.showFileHistoryNavigation}
                  onCheckedChange={(checked) =>
                    setAppearance({ showFileHistoryNavigation: checked })
                  }
                />
              </SettingRow>
            </div>

            {/* 字体设置 */}
            <div style={{ borderBottom: "1px solid var(--border-color)" }}>
              <div className="py-1">
                <SettingRow label="UI 字体">
                  <FontSelector
                    value={appearance.uiFont || fontFamilyOptions[0].value}
                    onChange={(val) => setAppearance({ uiFont: val })}
                    options={fontFamilyOptions}
                  />
                </SettingRow>

                <SettingRow label="代码字体">
                  <FontSelector
                    value={appearance.codeFont || codeFontOptions[0].value}
                    onChange={(val) => setAppearance({ codeFont: val })}
                    options={codeFontOptions}
                  />
                </SettingRow>
              </div>
            </div>

            {/* UI 字号 */}
            <div style={{ borderBottom: "1px solid var(--border-color)" }}>
              <div className="py-1">
                <SettingRow
                  label="UI 字号"
                  description="调整界面使用的基准字号"
                >
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="10"
                      max="20"
                      value={appearance.uiFontSize || 13}
                      onChange={(e) =>
                        setAppearance({
                          uiFontSize: Number(e.target.value),
                        })
                      }
                      className="w-14 h-9 px-3 text-sm rounded-lg text-center"
                      style={{
                        backgroundColor: "var(--bg-tertiary)",
                        border: "1px solid var(--border-color)",
                        color: "var(--text-primary)",
                        outline: "none",
                      }}
                    />
                    <span
                      className="text-sm"
                      style={{ color: "var(--text-muted)" }}
                    >
                      px
                    </span>
                  </div>
                </SettingRow>

                <SettingRow
                  label="代码字体大小"
                  description="调整代码使用的基准字号"
                >
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="10"
                      max="20"
                      value={appearance.fontSize}
                      onChange={(e) =>
                        setAppearance({ fontSize: Number(e.target.value) })
                      }
                      className="w-14 h-9 px-3 text-sm rounded-lg text-center"
                      style={{
                        backgroundColor: "var(--bg-tertiary)",
                        border: "1px solid var(--border-color)",
                        color: "var(--text-primary)",
                        outline: "none",
                      }}
                    />
                    <span
                      className="text-sm"
                      style={{ color: "var(--text-muted)" }}
                    >
                      px
                    </span>
                  </div>
                </SettingRow>

                <SettingRow label="行高" description="调整编辑器行高">
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="1.2"
                      max="2.5"
                      step="0.1"
                      value={appearance.lineHeight}
                      onChange={(e) =>
                        setAppearance({ lineHeight: Number(e.target.value) })
                      }
                      className="w-32 h-1 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${((appearance.lineHeight - 1.2) / 1.3) * 100}%, var(--bg-tertiary) ${((appearance.lineHeight - 1.2) / 1.3) * 100}%, var(--bg-tertiary) 100%)`,
                        accentColor: "var(--accent-color)",
                      }}
                    />
                    <span
                      className="text-sm w-8 text-right"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {appearance.lineHeight}
                    </span>
                  </div>
                </SettingRow>

                <SettingRow label="编辑区内边距" description="调整内容左右边距">
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={EDITOR_PADDING_MIN}
                      max={EDITOR_PADDING_MAX}
                      step="10"
                      value={appearance.padding}
                      onChange={(e) =>
                        setAppearance({ padding: Number(e.target.value) })
                      }
                      className="w-32 h-1 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${editorPaddingProgress}%, var(--bg-tertiary) ${editorPaddingProgress}%, var(--bg-tertiary) 100%)`,
                        accentColor: "var(--accent-color)",
                      }}
                    />
                    <span
                      className="text-sm w-8 text-right"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {appearance.padding}
                    </span>
                  </div>
                </SettingRow>

                <SettingRow label="透明度" description="调整编辑区透明度">
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="20"
                      max="100"
                      step="1"
                      value={appearance.opacity}
                      onChange={(e) =>
                        setAppearance({ opacity: Number(e.target.value) })
                      }
                      className="w-32 h-1 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${((appearance.opacity - 20) / 80) * 100}%, var(--bg-tertiary) ${((appearance.opacity - 20) / 80) * 100}%, var(--bg-tertiary) 100%)`,
                        accentColor: "var(--accent-color)",
                      }}
                    />
                    <span
                      className="text-sm w-10 text-right"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {appearance.opacity}%
                    </span>
                  </div>
                </SettingRow>
              </div>
            </div>
          </div>
        );
      case "shortcuts":
        return <ShortcutsSettings />;
      case "about":
        return (
          <div className="space-y-5 py-2">
            <section
              className="rounded-lg px-4 py-4"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-color)",
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3
                    className="text-base font-medium leading-none"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Keep Notes
                  </h3>
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      当前版本
                    </span>
                    {displayVersion && (
                      <span
                        className="rounded-md px-2 py-0.5 text-xs"
                        style={{
                          backgroundColor: "var(--bg-tertiary)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        v{displayVersion}
                      </span>
                    )}
                  </div>
                  <p
                    className="mt-3 text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {getUpdateStatusText(updateState)}
                  </p>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCheckForUpdates}
                    disabled={isUpdateCancellable}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50"
                    style={{
                      backgroundColor: "transparent",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${
                        updateState.status === "checking" ? "animate-spin" : ""
                      }`}
                    />
                    检查更新
                  </button>
                  {isUpdateCancellable && (
                    <button
                      type="button"
                      aria-label="取消更新"
                      title="取消更新"
                      onClick={handleCancelUpdate}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                      style={{
                        color: "var(--text-muted)",
                        border: "1px solid var(--border-color)",
                        backgroundColor: "transparent",
                      }}
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {updateState.status === "downloading" && (
                <div className="mt-4">
                  <div
                    className="h-1.5 overflow-hidden rounded-full"
                    style={{ backgroundColor: "var(--bg-tertiary)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${progressPercent}%`,
                        backgroundColor: "var(--accent-color)",
                      }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-xs">
                    <span style={{ color: "var(--text-muted)" }}>下载进度</span>
                    <span style={{ color: "var(--text-primary)" }}>
                      {progressPercent}%
                    </span>
                  </div>
                </div>
              )}

              {updateState.status === "downloaded" && (
                <div className="mt-4">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleInstallUpdate}
                    className="h-8 gap-1.5 px-3"
                  >
                    <Download className="h-4 w-4" />
                    立即安装
                  </Button>
                </div>
              )}
            </section>

            <section
              className="overflow-hidden rounded-lg"
              style={{ border: "1px solid var(--border-color)" }}
            >
              <button
                type="button"
                title={appInfo.repositoryUrl}
                onClick={handleOpenRepository}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors"
                style={{ color: "var(--text-primary)" }}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">GitHub 仓库</div>
                  <div
                    className="mt-1 truncate text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {repositoryLabel}
                  </div>
                </div>
                <ExternalLink
                  className="h-4 w-4 flex-shrink-0"
                  style={{ color: "var(--accent-color)" }}
                />
              </button>

              <div
                className="flex items-center justify-between gap-4 px-4 py-3"
                style={{ borderTop: "1px solid var(--border-color)" }}
              >
                <div>
                  <div className="text-sm font-medium">作者</div>
                  <div
                    className="mt-1 text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    项目维护者
                  </div>
                </div>
                <span
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {appInfo.author}
                </span>
              </div>
            </section>
          </div>
        );
    }
  };

  return (
    <Dialog.Root open={isSettingsOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[780px] sm:max-h-[640px] overflow-hidden p-0">
        <DialogHeader className="px-8 pt-8 pb-0">
          <Dialog.Title style={{ color: "var(--text-primary)" }}>
            设置
          </Dialog.Title>
        </DialogHeader>

        <div className="flex gap-0 overflow-hidden" style={{ height: "540px" }}>
          {/* 左侧导航 */}
          <div
            className="w-[220px] flex-shrink-0 px-2 overflow-y-auto"
            style={{
              borderRight: "1px solid var(--border-color)",
              paddingTop: "20px",
              paddingBottom: "20px",
            }}
          >
            {settingsMenuItems.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all rounded-lg mb-1"
                  style={{
                    backgroundColor: isActive
                      ? "var(--active-bg)"
                      : "transparent",
                    color: "var(--text-primary)",
                    width: "calc(100% - 8px)",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm font-medium">{item.label}</span>
                  {isActive && (
                    <ChevronRight
                      className="h-3 w-3 flex-shrink-0 ml-auto"
                      style={{ color: "var(--text-muted)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* 右侧内容 */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {renderContent()}
          </div>
        </div>
      </DialogContent>
    </Dialog.Root>
  );
}
