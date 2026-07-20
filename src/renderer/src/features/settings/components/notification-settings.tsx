import { useEffect, useState } from "react";
import { useNotificationStore } from "@/store/notification.store";
import { SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { ColorPicker } from "@/components/ui/color-picker";
import type { NotificationSizePreset } from "@/types";
import {
  DEFAULT_NOTIFICATION_CONFIG,
  getDefaultDesktopNotificationAppearance,
} from "@/types";
import { ChevronDown } from "lucide-react";

export function NotificationSettings() {
  const { config, loadConfig, updateConfig, subscribeToChanges } =
    useNotificationStore();

  const [appName, setAppName] = useState(config.desktop.appName);
  const [appNameFontSize, setAppNameFontSize] = useState(
    String(config.desktop.appNameFontSize),
  );
  const [titleFontSize, setTitleFontSize] = useState(
    String(config.desktop.titleFontSize),
  );
  const [isSizePresetOpen, setIsSizePresetOpen] = useState(false);

  useEffect(() => {
    void loadConfig();
    const unsubscribe = subscribeToChanges();
    return unsubscribe;
  }, [loadConfig, subscribeToChanges]);

  // 配置变更时同步本地状态
  useEffect(() => {
    setAppName(config.desktop.appName);
    setAppNameFontSize(String(config.desktop.appNameFontSize));
    setTitleFontSize(String(config.desktop.titleFontSize));
  }, [
    config.desktop.appName,
    config.desktop.appNameFontSize,
    config.desktop.titleFontSize,
  ]);

  /** 更新桌面通知配置。 */
  const updateDesktopConfig = async (
    desktop: Partial<typeof config.desktop>,
  ) => {
    await updateConfig({ desktop });
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

  /** 保存通知标题字号，控制主标题在弹窗中的显示边界。 */
  const handleSaveTitleFontSize = async () => {
    const nextFontSize = Math.min(
      30,
      Math.max(14, Number(titleFontSize) || 21),
    );
    setTitleFontSize(String(nextFontSize));
    if (nextFontSize === config.desktop.titleFontSize) return;
    await updateDesktopConfig({ titleFontSize: nextFontSize });
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

  /** 切换通知样式模式，默认模式统一回到预设值，自定义模式开放字号、颜色和尺寸配置。 */
  const handleChangeAppearanceMode = async (useCustomAppearance: boolean) => {
    // 切换样式时按当前平台写入默认外观，确保自定义模式从系统默认通知效果开始调整。
    await updateDesktopConfig({
      useCustomAppearance,
      ...getDefaultDesktopNotificationAppearance(
        window.electronAPI.getPlatform(),
      ),
    });
  };

  return (
    <div className="space-y-0">
      {/* 桌面通知 */}
      <div style={{ borderBottom: "1px solid var(--border-color)" }}>
        <SettingRow label="桌面通知" description="提醒到期时显示应用通知弹窗">
          <Switch
            ariaLabel="桌面通知"
            checked={config.desktop.enabled}
            onCheckedChange={(checked) => {
              void updateDesktopConfig({ enabled: checked });
            }}
          />
        </SettingRow>
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
        <SettingRow label="应用名" description="应用通知弹窗顶部显示的名称">
          <input
            id="desktop-notification-app-name"
            aria-label="应用名"
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
          label="样式配置"
          description="统一切换默认样式或开放自定义字号、颜色和弹窗大小"
        >
          <div className="flex items-center gap-3">
            <label
              className="flex items-center gap-1.5 text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              <input
                aria-label="样式使用默认值"
                type="radio"
                name="desktop-appearance-mode"
                checked={!config.desktop.useCustomAppearance}
                disabled={!config.desktop.enabled}
                onChange={() => {
                  void handleChangeAppearanceMode(false);
                }}
              />
              默认样式
            </label>
            <label
              className="flex items-center gap-1.5 text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              <input
                aria-label="样式使用自定义"
                type="radio"
                name="desktop-appearance-mode"
                checked={config.desktop.useCustomAppearance}
                disabled={!config.desktop.enabled}
                onChange={() => {
                  void handleChangeAppearanceMode(true);
                }}
              />
              自定义样式
            </label>
          </div>
        </SettingRow>
      </div>

      {config.desktop.useCustomAppearance ? (
        <>
          <div style={{ borderBottom: "1px solid var(--border-color)" }}>
            <SettingRow label="应用名大小" description="应用名称的字体大小">
              <input
                aria-label="应用名大小"
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
            <SettingRow label="应用标题颜色" description="应用名称的文字颜色">
              <ColorPicker
                value={config.desktop.appNameColor}
                disabled={!config.desktop.enabled}
                inputAriaLabel="应用标题颜色"
                swatchAriaLabel="选择应用标题颜色"
                onChange={(color) => {
                  void updateDesktopConfig({ appNameColor: color });
                }}
              />
            </SettingRow>
          </div>

          <div style={{ borderBottom: "1px solid var(--border-color)" }}>
            <SettingRow label="标题大小" description="通知标题的字体大小">
              <input
                aria-label="标题大小"
                type="number"
                min={14}
                max={30}
                value={titleFontSize}
                disabled={!config.desktop.enabled}
                onChange={(e) => setTitleFontSize(e.target.value)}
                onBlur={() => {
                  void handleSaveTitleFontSize();
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
            <SettingRow label="标题颜色" description="通知标题的文字颜色">
              <ColorPicker
                value={config.desktop.titleColor}
                disabled={!config.desktop.enabled}
                inputAriaLabel="标题颜色"
                swatchAriaLabel="选择标题颜色"
                onChange={(color) => {
                  void updateDesktopConfig({ titleColor: color });
                }}
              />
            </SettingRow>
          </div>
        </>
      ) : null}

      {config.desktop.useCustomAppearance ? (
        <>
          <div style={{ borderBottom: "1px solid var(--border-color)" }}>
            <SettingRow label="通知背景色" description="应用通知弹窗的背景颜色">
              <ColorPicker
                value={config.desktop.backgroundColor}
                disabled={!config.desktop.enabled}
                inputAriaLabel="通知背景色"
                swatchAriaLabel="选择通知背景色"
                onChange={(color) => {
                  void updateDesktopConfig({ backgroundColor: color });
                }}
              />
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
        </>
      ) : null}
    </div>
  );
}
