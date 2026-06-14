import { useState } from "react";
import { useUIStore } from "@/store/ui.store";
import { useTreeStore } from "@/store/tree.store";
import { useEditorStore } from "@/store/editor.store";
import { useTheme } from "@/hooks/use-theme";
import { type ThemeName } from "@/config/themes";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { ThemeSelector } from "@/components/ui/theme-selector";
import { SettingRow } from "@/components/ui/setting-row";
import { FontSelector } from "@/components/ui/font-selector";
import { Switch } from "@/components/ui/switch";
import { Palette, ChevronRight, Keyboard } from "lucide-react";
import { ShortcutsSettings } from "./shortcuts-settings";

type SettingsTab = "appearance" | "shortcuts";

const settingsMenuItems = [
  { id: "appearance" as SettingsTab, label: "外观", icon: Palette },
  { id: "shortcuts" as SettingsTab, label: "键盘快捷键", icon: Keyboard },
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

export function SettingsModal() {
  const { isSettingsOpen, setSettingsOpen } = useUIStore();
  const { dirSettings, setDirSettings } = useTreeStore();
  const { appearance, setAppearance } = useEditorStore();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");

  const renderContent = () => {
    switch (activeTab) {
      case "appearance":
        return (
          <div className="space-y-0">
            {/* 主题选择 */}
            <div style={{ borderBottom: "1px solid var(--border-color)" }}>
              <div className="flex items-center justify-between py-3.5">
                <span
                  className="text-sm"
                  style={{ color: "var(--text-primary)" }}
                >
                  主题
                </span>
                <div className="flex items-center gap-2">
                  <ThemeSelector
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

            {/* 字体设置 */}
            <div style={{ borderBottom: "1px solid var(--border-color)" }}>
              <div className="py-1">
                <SettingRow label="UI 字体">
                  <FontSelector
                    value={appearance.uiFont || fontFamilyOptions[0].value}
                    onChange={(val) => setAppearance({ uiFont: val } as any)}
                    options={fontFamilyOptions}
                  />
                </SettingRow>

                <SettingRow label="代码字体">
                  <FontSelector
                    value={appearance.codeFont || codeFontOptions[0].value}
                    onChange={(val) => setAppearance({ codeFont: val } as any)}
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
                        } as any)
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
                      min="0"
                      max="120"
                      step="10"
                      value={appearance.padding}
                      onChange={(e) =>
                        setAppearance({ padding: Number(e.target.value) })
                      }
                      className="w-32 h-1 rounded-full appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${(appearance.padding / 120) * 100}%, var(--bg-tertiary) ${(appearance.padding / 120) * 100}%, var(--bg-tertiary) 100%)`,
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
    }
  };

  return (
    <Dialog.Root open={isSettingsOpen} onOpenChange={setSettingsOpen}>
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
