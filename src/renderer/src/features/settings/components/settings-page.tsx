import { useEffect, useState } from "react";
import { useUIStore } from "@/store/ui.store";
import { useEditorStore } from "@/store/editor.store";
import { useTheme } from "@/hooks/use-theme";
import { ThemeModeSelector } from "@/components/ui/theme-mode-selector";
import { SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { SidebarToggleButton } from "@/components/layout/sidebar-toggle-button";
import {
  Palette,
  ChevronDown,
  Keyboard,
  Bell,
  Mail,
  FileOutput,
  Info,
  RefreshCw,
  ExternalLink,
  XCircle,
  Download,
  Loader2,
  ArrowLeft,
  Minus,
  Square,
  X,
} from "lucide-react";
import { ShortcutsSettings } from "./shortcuts-settings";
import { NotificationSettings } from "./notification-settings";
import { NotificationPushSettings } from "./notification-push-settings";
import { ExportSettings } from "./export-settings";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { ExternalOpenAppIcon } from "@/features/external-open/external-open-icons";
import type {
  AppInfo,
  AppUpdateState,
  ExternalOpenApp,
  ExternalOpenAppId,
} from "@shared/types";

type SettingsTab =
  | "appearance"
  | "shortcuts"
  | "notifications"
  | "notificationPush"
  | "export"
  | "about";

const settingsMenuItems = [
  { id: "appearance" as SettingsTab, label: "外观", icon: Palette },
  { id: "shortcuts" as SettingsTab, label: "键盘快捷键", icon: Keyboard },
  { id: "notifications" as SettingsTab, label: "应用通知配置", icon: Bell },
  { id: "notificationPush" as SettingsTab, label: "通知推送", icon: Mail },
  { id: "export" as SettingsTab, label: "导出", icon: FileOutput },
  { id: "about" as SettingsTab, label: "关于", icon: Info },
];

const EDITOR_PADDING_MIN = 72;
const EDITOR_PADDING_MAX = 120;
const ZOOM_FACTOR_MIN = 0.5;
const ZOOM_FACTOR_MAX = 1.5;

const defaultAppInfo: AppInfo = {
  version: "",
  repositoryUrl: "",
  author: "",
};

const defaultUpdateState: AppUpdateState = {
  status: "idle",
  currentVersion: "",
};

function getUpdateStatusText(state: AppUpdateState): string {
  switch (state.status) {
    case "checking":
      return "正在检查更新...";
    case "available":
      return "";
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

export function SettingsPage() {
  const isSettingsOpen = useUIStore((state) => state.isSettingsOpen);
  const setSettingsOpen = useUIStore((state) => state.setSettingsOpen);
  const appearance = useEditorStore((s) => s.appearance);
  const setAppearance = useEditorStore((s) => s.setAppearance);
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");
  const [isNavigationCollapsed, setIsNavigationCollapsed] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo>(defaultAppInfo);
  const [updateState, setUpdateState] =
    useState<AppUpdateState>(defaultUpdateState);
  const [exportDropdownPortalContainer, setExportDropdownPortalContainer] =
    useState<HTMLDivElement | null>(null);
  const [externalOpenApps, setExternalOpenApps] = useState<ExternalOpenApp[]>(
    [],
  );
  const [zoomFactor, setZoomFactor] = useState(1);
  const [isZoomLoading, setIsZoomLoading] = useState(true);
  const editorPaddingProgress =
    ((Math.max(appearance.padding, EDITOR_PADDING_MIN) - EDITOR_PADDING_MIN) /
      (EDITOR_PADDING_MAX - EDITOR_PADDING_MIN)) *
    100;
  const displayVersion =
    appInfo.version ||
    updateState.currentVersion ||
    defaultUpdateState.currentVersion;

  const progressPercent = Math.round(updateState.progress?.percent ?? 0);
  const updateStatusText = getUpdateStatusText(updateState);
  const repositoryLabel = getRepositoryLabel(appInfo.repositoryUrl);
  const availableExternalOpenApps = externalOpenApps.filter(
    (app) => app.available,
  );
  const selectedExternalOpenApp =
    availableExternalOpenApps.find(
      (app) => app.id === appearance.defaultExternalOpenApp,
    )?.id ??
    availableExternalOpenApps.find((app) => app.kind === "editor")?.id ??
    availableExternalOpenApps.find((app) => app.id === "file-manager")?.id ??
    appearance.defaultExternalOpenApp;
  const selectedExternalOpenAppOption = availableExternalOpenApps.find(
    (app) => app.id === selectedExternalOpenApp,
  );

  useEffect(() => {
    if (!isSettingsOpen) return;

    let isMounted = true;
    setIsZoomLoading(true);
    const unsubscribe = window.electronAPI.onUpdateState((state) => {
      if (!isMounted) return;
      setUpdateState(state);
    });

    void Promise.all([
      window.electronAPI.getAppInfo(),
      window.electronAPI.getUpdateState(),
      window.electronAPI.listExternalOpenApps?.() ?? Promise.resolve([]),
      window.electronAPI.getZoomFactor?.() ?? Promise.resolve(1),
    ]).then(([info, state, apps, currentZoomFactor]) => {
      if (!isMounted) return;
      setAppInfo(info);
      setUpdateState(state);
      setExternalOpenApps(apps);
      setZoomFactor(currentZoomFactor);
      setIsZoomLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    if (activeTab !== "about") return;
    void handleCheckForUpdates();
  }, [activeTab]);

  const handleCheckForUpdates = async () => {
    const state = await window.electronAPI.checkForUpdates();
    setUpdateState(state);
  };

  const handleDownloadUpdate = async () => {
    const state = await window.electronAPI.downloadUpdate();
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
            <SettingRow
              label="主题"
              description="使用浅色、深色，或匹配系统设置"
            >
              <ThemeModeSelector value={theme} onChange={setTheme} />
            </SettingRow>

            {/* 默认打开目标 */}
            <div>
              <SettingRow
                label="默认打开目标"
                description="默认打开文件和文件夹的位置"
              >
                <DropdownMenu.Root modal={false}>
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      disabled={!selectedExternalOpenAppOption}
                      className="flex h-8 min-w-[160px] items-center justify-between gap-2 rounded-md px-2.5 text-xs outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      style={{
                        backgroundColor: "var(--bg-tertiary)",
                        border: "1px solid var(--border-color)",
                        color: "var(--text-primary)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor =
                          "var(--hover-bg)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor =
                          "var(--bg-tertiary)";
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {selectedExternalOpenAppOption ? (
                          <ExternalOpenAppIcon
                            appId={selectedExternalOpenAppOption.id}
                            iconDataUrl={
                              selectedExternalOpenAppOption.iconDataUrl
                            }
                            className="h-4 w-4"
                          />
                        ) : null}
                        <span className="truncate">
                          {selectedExternalOpenAppOption?.label ??
                            "暂无可用应用"}
                        </span>
                      </span>
                      <ChevronDown
                        className="h-3.5 w-3.5 flex-shrink-0"
                        style={{ color: "var(--text-muted)" }}
                      />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="end"
                      sideOffset={6}
                      className="z-[9999] min-w-[168px] rounded-lg border p-1 shadow-lg"
                      style={{
                        backgroundColor: "var(--bg-primary)",
                        borderColor: "var(--border-color)",
                      }}
                    >
                      {availableExternalOpenApps.map((app) => (
                        <DropdownMenu.Item
                          key={app.id}
                          className="flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-[var(--selection-row-hover)]"
                          style={{ color: "var(--text-primary)" }}
                          onClick={() =>
                            setAppearance({
                              defaultExternalOpenApp:
                                app.id as ExternalOpenAppId,
                            })
                          }
                        >
                          <ExternalOpenAppIcon
                            appId={app.id}
                            iconDataUrl={app.iconDataUrl}
                            className="h-4 w-4"
                          />
                          <span>{app.label}</span>
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </SettingRow>
            </div>

            {/* 标题栏快速打开器 */}
            <div>
              <SettingRow
                label="应用打开器入口"
                description="在标题栏显示默认应用与快捷下拉入口"
              >
                <Switch
                  checked={appearance.showTitleBarQuickLauncher}
                  onCheckedChange={(checked) =>
                    setAppearance({ showTitleBarQuickLauncher: checked })
                  }
                />
              </SettingRow>
            </div>

            {/* 底部操作栏悬停显示 */}
            <div>
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
            <div>
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

            {/* 编辑器内容字号 */}
            <div>
              <div className="py-1">
                <SettingRow
                  label="编辑器内容字号"
                  description="只调整 Markdown 编辑器内容的基准字号"
                >
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="10"
                      max="20"
                      value={appearance.fontSize}
                      onChange={(e) =>
                        setAppearance({
                          fontSize: Number(e.target.value),
                          uiFontSize: Number(e.target.value),
                        })
                      }
                      className="w-14 h-7 px-2 text-sm rounded-md text-center"
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

                <SettingRow
                  label="界面缩放"
                  description="调整整个应用的显示比例"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={ZOOM_FACTOR_MIN}
                      max={ZOOM_FACTOR_MAX}
                      step="0.1"
                      value={zoomFactor}
                      aria-label="界面缩放"
                      aria-valuetext={`${Math.round(zoomFactor * 100)}%`}
                      disabled={isZoomLoading}
                      onChange={(e) => {
                        const nextZoomFactor = Number(e.target.value);
                        setZoomFactor(nextZoomFactor);
                        void window.electronAPI
                          .setZoomFactor(nextZoomFactor)
                          .then(setZoomFactor);
                      }}
                      className="w-32 h-1 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${((zoomFactor - ZOOM_FACTOR_MIN) / (ZOOM_FACTOR_MAX - ZOOM_FACTOR_MIN)) * 100}%, var(--bg-tertiary) ${((zoomFactor - ZOOM_FACTOR_MIN) / (ZOOM_FACTOR_MAX - ZOOM_FACTOR_MIN)) * 100}%, var(--bg-tertiary) 100%)`,
                        accentColor: "var(--accent-color)",
                      }}
                    />
                    <span
                      className="text-sm w-10 text-right"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {Math.round(zoomFactor * 100)}%
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
      case "notifications":
        return <NotificationSettings />;
      case "notificationPush":
        return <NotificationPushSettings />;
      case "export":
        return (
          <ExportSettings portalContainer={exportDropdownPortalContainer} />
        );
      case "about":
        return (
          <div className="space-y-3 py-2">
            <section
              data-testid="about-app-card"
              className="rounded-lg px-4 py-4"
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3
                    className="text-lg font-semibold leading-6"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Keep Notes
                  </h3>
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className="text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      当前版本
                    </span>
                    {displayVersion && (
                      <span
                        className="rounded-md px-2 py-0.5 text-xs"
                        style={{
                          backgroundColor: "var(--bg-secondary)",
                          border: "1px solid var(--border-color)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        v{displayVersion}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2">
                  {updateState.status === "available" ? (
                    <Button
                      type="button"
                      onClick={handleDownloadUpdate}
                      className="gap-1.5"
                    >
                      <Download className="h-4 w-4" />
                      {updateState.version
                        ? `更新到 v${updateState.version}`
                        : "更新"}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={handleCheckForUpdates}
                      disabled={
                        updateState.status === "checking" ||
                        updateState.status === "downloading"
                      }
                      variant="outline"
                      className="gap-1.5"
                    >
                      {updateState.status === "checking" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      {updateState.status === "checking"
                        ? "检查中..."
                        : "检查更新"}
                    </Button>
                  )}
                </div>
              </div>

              {updateStatusText && (
                <div
                  className="mt-4 border-t pt-3 text-sm"
                  style={{ borderColor: "var(--border-color)" }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    {updateStatusText}
                  </span>
                </div>
              )}

              {updateState.status === "downloading" && (
                <div className="mt-4">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-1.5 flex-1 overflow-hidden rounded-full"
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
                    <button
                      type="button"
                      aria-label="取消更新"
                      title="取消更新"
                      onClick={handleCancelUpdate}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors flex-shrink-0"
                      style={{
                        color: "var(--text-muted)",
                        border: "1px solid var(--border-color)",
                        backgroundColor: "transparent",
                      }}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
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
                    onClick={handleInstallUpdate}
                    className="gap-1.5"
                  >
                    <Download className="h-4 w-4" />
                    立即安装
                  </Button>
                </div>
              )}
            </section>

            <section
              data-testid="about-project-card"
              className="overflow-hidden rounded-lg"
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
              }}
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

  if (!isSettingsOpen) return null;

  const activeLabel = settingsMenuItems.find(
    (item) => item.id === activeTab,
  )?.label;
  const isMac = window.electronAPI?.getPlatform() === "darwin";

  return (
    <div
      data-testid="settings-layout"
      className="relative flex min-h-0 flex-1"
      style={{ color: "var(--text-primary)" }}
    >
      <aside
        data-testid="settings-sidebar"
        data-collapsed={isNavigationCollapsed}
        className={cn(
          "settings-sidebar flex shrink-0 flex-col border-r border-[var(--border-color)] bg-[var(--bg-secondary)]",
          isNavigationCollapsed && "settings-sidebar--collapsed",
        )}
      >
        <div
          className="settings-sidebar__drag-region flex h-11 shrink-0 items-center px-2"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        />
        <div className="settings-sidebar__back-container px-3 pb-4 pt-0">
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="settings-sidebar__back flex h-10 w-full items-center gap-3 rounded-lg px-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--hover-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-color)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span className="settings-sidebar__back-label">返回</span>
          </button>
        </div>
        <div className="settings-sidebar__section-label px-6 pb-3 text-xs font-medium text-[var(--text-secondary)]">
          设置
        </div>
        <nav
          data-testid="settings-navigation"
          aria-label="设置分类"
          className="settings-sidebar__navigation min-h-0 flex-1 overflow-y-auto px-3 pb-4"
        >
          {settingsMenuItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                aria-current={isActive ? "page" : undefined}
                title={isNavigationCollapsed ? item.label : undefined}
                data-selection-surface="true"
                data-selection-context="secondary"
                data-selected={isActive ? "true" : undefined}
                className="settings-sidebar__nav-item mb-1 flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[var(--file-tree-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-color)]"
                style={{
                  backgroundColor: isActive
                    ? "var(--file-tree-row-selected)"
                    : "transparent",
                  color: isActive
                    ? "var(--accent-color)"
                    : "var(--text-primary)",
                }}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="settings-sidebar__nav-label text-sm font-medium">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>
      <section
        className="flex min-w-0 flex-1 flex-col bg-[var(--bg-primary)]"
        aria-label="设置"
      >
        <header
          className="settings-content-header flex h-11 shrink-0 items-center justify-between border-b border-[var(--border-color)]"
          style={
            {
              WebkitAppRegion: "drag",
              paddingLeft: isNavigationCollapsed ? "56px" : "24px",
            } as React.CSSProperties
          }
          onDoubleClick={() => window.electronAPI.maximizeWindow()}
        >
          <span
            data-testid="settings-page-title"
            className="text-sm font-medium"
          >
            {activeLabel}
          </span>
          {!isMac && (
            <div
              className="flex h-full"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                aria-label="最小化"
                onClick={() => window.electronAPI.minimizeWindow()}
                className="px-4 hover:bg-[var(--hover-bg)]"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="最大化"
                onClick={() => window.electronAPI.maximizeWindow()}
                className="px-4 hover:bg-[var(--hover-bg)]"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="关闭窗口"
                onClick={() => window.electronAPI.closeWindow()}
                className="px-4 hover:bg-red-600 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </header>
        <main
          key={activeTab}
          data-testid="settings-content"
          className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-8 lg:px-10"
          style={{ backgroundColor: "var(--bg-primary)" }}
        >
          <div className="mx-auto max-w-5xl">{renderContent()}</div>
        </main>
      </section>
      <SidebarToggleButton
        collapsed={isNavigationCollapsed}
        label={isNavigationCollapsed ? "展开设置侧栏" : "收起设置侧栏"}
        onClick={() => setIsNavigationCollapsed((collapsed) => !collapsed)}
        className="settings-sidebar__toggle absolute left-3 top-1.5 z-[10000]"
        style={
          {
            WebkitAppRegion: "no-drag",
            pointerEvents: "auto",
          } as React.CSSProperties
        }
      />
      <div ref={setExportDropdownPortalContainer} className="contents" />
    </div>
  );
}
