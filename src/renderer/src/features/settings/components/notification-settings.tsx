import { useEffect, useState } from "react";
import { useNotificationStore } from "@/store/notification.store";
import { SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import type { NotificationSizePreset } from "@/types";
import { DEFAULT_NOTIFICATION_CONFIG } from "@/types";
import { Loader2, CheckCircle2, XCircle, ChevronDown } from "lucide-react";

export function NotificationSettings() {
  const { config, loadConfig, updateConfig, testChannel, subscribeToChanges } =
    useNotificationStore();

  const [appName, setAppName] = useState(config.desktop.appName);
  const [appNameFontSize, setAppNameFontSize] = useState(
    String(config.desktop.appNameFontSize),
  );
  const [isSizePresetOpen, setIsSizePresetOpen] = useState(false);
  const [isTestingDesktop, setIsTestingDesktop] = useState(false);
  const [desktopTestResult, setDesktopTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  useEffect(() => {
    void loadConfig();
    const unsubscribe = subscribeToChanges();
    return unsubscribe;
  }, [loadConfig, subscribeToChanges]);

  // 配置变更时同步本地状态
  useEffect(() => {
    setAppName(config.desktop.appName);
    setAppNameFontSize(String(config.desktop.appNameFontSize));
  }, [config.desktop.appName, config.desktop.appNameFontSize]);

  /** 更新桌面通知配置后清空上一次测试结果，避免旧结果误导当前配置。 */
  const updateDesktopConfig = async (
    desktop: Partial<typeof config.desktop>,
  ) => {
    await updateConfig({ desktop });
    setDesktopTestResult(null);
  };

  /** 保存应用通知弹窗顶部标题，空值恢复默认应用名 */
  const handleSaveAppName = async () => {
    const nextAppName =
      appName.trim() || DEFAULT_NOTIFICATION_CONFIG.desktop.appName;
    setAppName(nextAppName);
    if (nextAppName === config.desktop.appName) return;
    await updateDesktopConfig({ appName: nextAppName });
  };

  /** 保存应用标题字号，限制在通知窗口可读范围内。 */
  const handleSaveAppNameFontSize = async () => {
    const nextFontSize = Math.min(
      28,
      Math.max(12, Number(appNameFontSize) || 18),
    );
    setAppNameFontSize(String(nextFontSize));
    if (nextFontSize === config.desktop.appNameFontSize) return;
    await updateDesktopConfig({ appNameFontSize: nextFontSize });
  };

  /** 发送自定义桌面通知测试，确认主进程通知窗口可用 */
  const handleTestDesktopNotification = async () => {
    setIsTestingDesktop(true);
    setDesktopTestResult(null);
    try {
      const result = await testChannel("desktop");
      setDesktopTestResult(result);
    } finally {
      setIsTestingDesktop(false);
    }
  };

  const sizePresetLabels: Record<NotificationSizePreset, string> = {
    small: "小",
    medium: "默认",
    large: "大",
  };

  const handleChangeSizePreset = async (sizePreset: NotificationSizePreset) => {
    setIsSizePresetOpen(false);
    if (sizePreset === config.desktop.sizePreset) return;
    await updateDesktopConfig({ sizePreset });
  };

  /** 切换标题颜色模式，默认模式恢复系统默认文字色，自定义模式启用取色器。 */
  const handleChangeAppNameColorMode = async (useDefault: boolean) => {
    await updateDesktopConfig({
      useDefaultAppNameColor: useDefault,
      appNameColor: useDefault ? "" : config.desktop.appNameColor || "#ffffff",
    });
  };

  /** 切换通知背景色模式，默认模式恢复预设背景色，自定义模式启用取色器。 */
  const handleChangeBackgroundColorMode = async (useDefault: boolean) => {
    await updateDesktopConfig({
      useDefaultBackgroundColor: useDefault,
      backgroundColor: useDefault
        ? DEFAULT_NOTIFICATION_CONFIG.desktop.backgroundColor
        : config.desktop.backgroundColor,
    });
  };

  return (
    <div className="space-y-0">
      {/* 桌面通知 */}
      <div style={{ borderBottom: "1px solid var(--border-color)" }}>
        <SettingRow label="桌面通知" description="提醒到期时显示应用通知弹窗">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestDesktopNotification}
              disabled={isTestingDesktop || !config.desktop.enabled}
              className="h-7 gap-1.5 px-2.5 text-xs"
            >
              {isTestingDesktop ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "测试通知"
              )}
            </Button>
            <Switch
              ariaLabel="桌面通知"
              checked={config.desktop.enabled}
              onCheckedChange={(checked) => {
                void updateDesktopConfig({ enabled: checked });
              }}
            />
          </div>
        </SettingRow>
        {desktopTestResult ? (
          <div
            className="mx-4 mb-3 flex items-center gap-2 rounded-md px-3 py-2 text-xs"
            style={{
              backgroundColor: desktopTestResult.success
                ? "rgba(34, 197, 94, 0.1)"
                : "rgba(239, 68, 68, 0.1)",
              border: `1px solid ${desktopTestResult.success ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
            }}
          >
            {desktopTestResult.success ? (
              <>
                <CheckCircle2
                  className="h-3.5 w-3.5 flex-shrink-0"
                  style={{ color: "var(--success-color, #22c55e)" }}
                />
                <span style={{ color: "var(--success-color, #22c55e)" }}>
                  测试通知已发送
                </span>
              </>
            ) : (
              <>
                <XCircle
                  className="h-3.5 w-3.5 flex-shrink-0"
                  style={{ color: "var(--error-color, #ef4444)" }}
                />
                <span style={{ color: "var(--error-color, #ef4444)" }}>
                  {desktopTestResult.error || "桌面通知发送失败"}
                </span>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div style={{ borderBottom: "1px solid var(--border-color)" }}>
        <SettingRow
          label="持续显示"
          description="提醒通知保持显示，直到点击确认"
        >
          <Switch
            ariaLabel="持续显示"
            checked={config.desktop.requireInteraction}
            disabled={!config.desktop.enabled}
            onCheckedChange={(checked) => {
              void updateDesktopConfig({ requireInteraction: checked });
            }}
          />
        </SettingRow>
      </div>

      <div style={{ borderBottom: "1px solid var(--border-color)" }}>
        <SettingRow label="通知标题" description="应用通知弹窗顶部显示的名称">
          <input
            id="desktop-notification-app-name"
            aria-label="通知标题"
            type="text"
            value={appName}
            disabled={!config.desktop.enabled}
            onChange={(e) => setAppName(e.target.value)}
            onBlur={() => {
              void handleSaveAppName();
            }}
            placeholder={DEFAULT_NOTIFICATION_CONFIG.desktop.appName}
            className="h-8 w-40 rounded-md px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
        </SettingRow>
      </div>

      <div style={{ borderBottom: "1px solid var(--border-color)" }}>
        <SettingRow
          label="显示应用图标"
          description="控制通知左侧应用图标是否显示"
        >
          <Switch
            ariaLabel="显示应用图标"
            checked={config.desktop.showAppIcon}
            disabled={!config.desktop.enabled}
            onCheckedChange={(checked) => {
              void updateDesktopConfig({ showAppIcon: checked });
            }}
          />
        </SettingRow>
      </div>

      <div style={{ borderBottom: "1px solid var(--border-color)" }}>
        <SettingRow label="标题字号" description="应用标题名称的字体大小">
          <input
            aria-label="标题字号"
            type="number"
            min={12}
            max={28}
            value={appNameFontSize}
            disabled={!config.desktop.enabled}
            onChange={(e) => setAppNameFontSize(e.target.value)}
            onBlur={() => {
              void handleSaveAppNameFontSize();
            }}
            className="h-8 w-24 rounded-md px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
        </SettingRow>
      </div>

      <div style={{ borderBottom: "1px solid var(--border-color)" }}>
        <SettingRow label="标题颜色" description="应用标题名称的文字颜色">
          <div className="flex items-center gap-3">
            <label
              className="flex items-center gap-1.5 text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              <input
                aria-label="标题颜色使用默认值"
                type="radio"
                name="app-name-color-mode"
                checked={config.desktop.useDefaultAppNameColor}
                disabled={!config.desktop.enabled}
                onChange={() => {
                  void handleChangeAppNameColorMode(true);
                }}
              />
              默认值
            </label>
            <label
              className="flex items-center gap-1.5 text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              <input
                aria-label="标题颜色使用自定义"
                type="radio"
                name="app-name-color-mode"
                checked={!config.desktop.useDefaultAppNameColor}
                disabled={!config.desktop.enabled}
                onChange={() => {
                  void handleChangeAppNameColorMode(false);
                }}
              />
              自定义
            </label>
            <ColorPicker
              value={config.desktop.appNameColor || "#ffffff"}
              disabled={
                !config.desktop.enabled || config.desktop.useDefaultAppNameColor
              }
              inputAriaLabel="标题颜色"
              swatchAriaLabel="选择标题颜色"
              onChange={(color) => {
                void updateDesktopConfig({
                  useDefaultAppNameColor: false,
                  appNameColor: color,
                });
              }}
            />
          </div>
        </SettingRow>
      </div>

      <div style={{ borderBottom: "1px solid var(--border-color)" }}>
        <SettingRow
          label="显示底部操作"
          description="控制稍后提醒和查看详情按钮是否显示"
        >
          <Switch
            ariaLabel="显示底部操作"
            checked={config.desktop.showActions}
            disabled={!config.desktop.enabled}
            onCheckedChange={(checked) => {
              void updateDesktopConfig({ showActions: checked });
            }}
          />
        </SettingRow>
      </div>

      <div style={{ borderBottom: "1px solid var(--border-color)" }}>
        <SettingRow label="通知背景色" description="应用通知弹窗的背景颜色">
          <div className="flex items-center gap-3">
            <label
              className="flex items-center gap-1.5 text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              <input
                aria-label="通知背景色使用默认值"
                type="radio"
                name="background-color-mode"
                checked={config.desktop.useDefaultBackgroundColor}
                disabled={!config.desktop.enabled}
                onChange={() => {
                  void handleChangeBackgroundColorMode(true);
                }}
              />
              默认值
            </label>
            <label
              className="flex items-center gap-1.5 text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              <input
                aria-label="通知背景色使用自定义"
                type="radio"
                name="background-color-mode"
                checked={!config.desktop.useDefaultBackgroundColor}
                disabled={!config.desktop.enabled}
                onChange={() => {
                  void handleChangeBackgroundColorMode(false);
                }}
              />
              自定义
            </label>
            <ColorPicker
              value={config.desktop.backgroundColor}
              disabled={
                !config.desktop.enabled ||
                config.desktop.useDefaultBackgroundColor
              }
              inputAriaLabel="通知背景色"
              swatchAriaLabel="选择通知背景色"
              onChange={(color) => {
                void updateDesktopConfig({
                  useDefaultBackgroundColor: false,
                  backgroundColor: color,
                });
              }}
            />
          </div>
        </SettingRow>
      </div>

      <div style={{ borderBottom: "1px solid var(--border-color)" }}>
        <SettingRow label="弹窗大小" description="应用通知弹窗的预设尺寸">
          <div
            className="relative"
            onBlur={() => {
              window.setTimeout(() => setIsSizePresetOpen(false), 120);
            }}
          >
            <button
              type="button"
              aria-label="弹窗大小"
              aria-haspopup="listbox"
              aria-expanded={isSizePresetOpen}
              disabled={!config.desktop.enabled}
              onClick={() => setIsSizePresetOpen((open) => !open)}
              className="flex h-8 w-32 items-center justify-between rounded-md px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            >
              <span>{sizePresetLabels[config.desktop.sizePreset]}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {isSizePresetOpen ? (
              <div
                role="listbox"
                className="absolute bottom-9 right-0 z-50 w-32 overflow-hidden rounded-md py-1 shadow-lg"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                {(
                  [
                    ["small", "小"],
                    ["medium", "默认"],
                    ["large", "大"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="option"
                    aria-selected={config.desktop.sizePreset === value}
                    className="block h-8 w-full px-3 text-left text-sm"
                    style={{
                      backgroundColor:
                        config.desktop.sizePreset === value
                          ? "var(--active-bg)"
                          : "transparent",
                      color: "var(--text-primary)",
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      void handleChangeSizePreset(value);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </SettingRow>
      </div>
    </div>
  );
}
