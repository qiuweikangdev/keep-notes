import { useState } from "react";
import { useUIStore } from "@/store/ui.store";
import { useUserStore } from "@/store/user.store";
import { useTreeStore } from "@/store/tree.store";
import { useEditorStore } from "@/store/editor.store";
import { useElectron } from "@/hooks/use-electron";
import { useTheme } from "@/hooks/use-theme";
import { themes, type ThemeName } from "@/config/themes";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Check, Palette, Github, ChevronRight } from "lucide-react";

type SettingsTab = "appearance" | "github";

const settingsMenuItems = [
  { id: "appearance" as SettingsTab, label: "外观", icon: Palette },
  { id: "github" as SettingsTab, label: "Github 同步", icon: Github },
];

export function SettingsModal() {
  const { isSettingsOpen, setSettingsOpen } = useUIStore();
  const { githubInfo, setGithubInfo } = useUserStore();
  const { dirSettings, setDirSettings } = useTreeStore();
  const { appearance, setAppearance } = useEditorStore();
  const { gitDownload, gitUpload } = useElectron();
  const { theme, setTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");

  const handleGithubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    setGithubInfo({
      username: formData.get("username") as string,
      email: formData.get("email") as string,
      repoUrl: formData.get("repoUrl") as string,
      localPath: formData.get("localPath") as string,
    });
  };

  const handleDownload = async () => {
    setLoading(true);
    try {
      await gitDownload();
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    setLoading(true);
    try {
      await gitUpload();
    } finally {
      setLoading(false);
    }
  };

  // 渲染滑块控件
  const renderSlider = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    unit: string,
    onChange: (value: number) => void,
  ) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span
          className="text-sm font-medium px-2 py-0.5 rounded"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            color: "var(--accent-color)",
          }}
        >
          {value}
          {unit}
        </span>
      </div>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${((value - min) / (max - min)) * 100}%, var(--bg-secondary) ${((value - min) / (max - min)) * 100}%, var(--bg-secondary) 100%)`,
          }}
        />
      </div>
      <div
        className="flex justify-between text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case "appearance":
        return (
          <div className="space-y-8">
            {/* 主题选择 */}
            <div>
              <h3
                className="text-sm font-semibold mb-4 flex items-center gap-2"
                style={{ color: "var(--text-primary)" }}
              >
                <Palette
                  className="h-4 w-4"
                  style={{ color: "var(--accent-color)" }}
                />
                主题
              </h3>
              <div className="grid grid-cols-5 gap-3">
                {(Object.keys(themes) as ThemeName[]).map((themeName) => {
                  const themeConfig = themes[themeName];
                  const isSelected = theme === themeName;

                  return (
                    <button
                      key={themeName}
                      onClick={() => setTheme(themeName)}
                      className="relative flex flex-col items-center gap-2 p-3 rounded-xl transition-all hover:scale-105"
                      style={{
                        border: isSelected
                          ? "2px solid var(--accent-color)"
                          : "2px solid var(--border-color)",
                        backgroundColor: isSelected
                          ? "var(--active-bg)"
                          : "var(--bg-secondary)",
                        boxShadow: isSelected
                          ? "0 4px 12px rgba(0, 0, 0, 0.15)"
                          : "none",
                      }}
                    >
                      <div
                        className="w-full h-12 rounded-lg overflow-hidden"
                        style={{
                          backgroundColor: themeConfig.preview.bg,
                          border: "1px solid rgba(0,0,0,0.1)",
                        }}
                      >
                        <div className="flex h-full">
                          <div
                            className="w-1/3 h-full"
                            style={{
                              backgroundColor: themeConfig.preview.sidebar,
                            }}
                          />
                          <div className="flex-1 p-1.5">
                            <div
                              className="w-3/4 h-1.5 rounded-full mb-1"
                              style={{
                                backgroundColor: themeConfig.preview.text,
                                opacity: 0.6,
                              }}
                            />
                            <div
                              className="w-1/2 h-1.5 rounded-full"
                              style={{
                                backgroundColor: themeConfig.preview.text,
                                opacity: 0.3,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                      <span
                        className="text-xs font-medium"
                        style={{
                          color: isSelected
                            ? "var(--accent-color)"
                            : "var(--text-primary)",
                        }}
                      >
                        {themeConfig.label}
                      </span>
                      {isSelected && (
                        <div
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{
                            backgroundColor: "var(--accent-color)",
                            boxShadow: "0 2px 4px rgba(0, 0, 0, 0.2)",
                          }}
                        >
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 编辑器外观 */}
            <div className="space-y-5">
              <h3
                className="text-sm font-semibold flex items-center gap-2"
                style={{ color: "var(--text-primary)" }}
              >
                <svg
                  className="h-4 w-4"
                  style={{ color: "var(--accent-color)" }}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                编辑器
              </h3>

              {renderSlider(
                "字体大小",
                appearance.fontSize,
                12,
                24,
                1,
                "px",
                (val) => setAppearance({ fontSize: val }),
              )}

              {renderSlider(
                "行高",
                appearance.lineHeight,
                1.2,
                2.5,
                0.1,
                "",
                (val) => setAppearance({ lineHeight: val }),
              )}

              {renderSlider(
                "编辑区内边距",
                appearance.padding,
                20,
                120,
                10,
                "px",
                (val) => setAppearance({ padding: val }),
              )}

              {renderSlider(
                "透明度",
                appearance.opacity,
                0,
                100,
                1,
                "%",
                (val) => setAppearance({ opacity: val }),
              )}
            </div>

            {/* 目录设置 */}
            <div className="space-y-4">
              <h3
                className="text-sm font-semibold flex items-center gap-2"
                style={{ color: "var(--text-primary)" }}
              >
                <svg
                  className="h-4 w-4"
                  style={{ color: "var(--accent-color)" }}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                目录
              </h3>

              <div
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: "var(--bg-tertiary)" }}
              >
                <Label>目录颜色</Label>
                <select
                  className="p-2 rounded-md text-sm"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                  value={dirSettings.dirColor}
                  onChange={(e) =>
                    setDirSettings({
                      dirColor: e.target.value as "themeColor" | "multiColor",
                    })
                  }
                >
                  <option value="themeColor">跟随主题</option>
                  <option value="multiColor">多彩颜色</option>
                </select>
              </div>

              <div
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: "var(--bg-tertiary)" }}
              >
                <Label>显示图标</Label>
                <input
                  type="checkbox"
                  checked={dirSettings.showIcon}
                  onChange={(e) =>
                    setDirSettings({ showIcon: e.target.checked })
                  }
                  className="h-4 w-4 rounded"
                  style={{ accentColor: "var(--accent-color)" }}
                />
              </div>
            </div>
          </div>
        );

      case "github":
        return (
          <form onSubmit={handleGithubSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                name="username"
                defaultValue={githubInfo.username}
                placeholder="GitHub 用户名"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={githubInfo.email}
                placeholder="GitHub 邮箱"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="repoUrl">仓库地址</Label>
              <Input
                id="repoUrl"
                name="repoUrl"
                defaultValue={githubInfo.repoUrl}
                placeholder="https://github.com/user/repo.git"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="localPath">本地路径</Label>
              <Input
                id="localPath"
                name="localPath"
                defaultValue={githubInfo.localPath}
                placeholder="本地仓库路径"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1">
                保存配置
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleDownload}
                disabled={loading}
              >
                拉取
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleUpload}
                disabled={loading}
              >
                推送
              </Button>
            </div>
          </form>
        );
    }
  };

  return (
    <Dialog.Root open={isSettingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="sm:max-w-[700px] sm:max-h-[550px] overflow-hidden">
        <DialogHeader>
          <Dialog.Title style={{ color: "var(--text-primary)" }}>
            设置
          </Dialog.Title>
        </DialogHeader>

        <div
          className="flex gap-0 -mx-6 -mb-6 overflow-hidden"
          style={{ height: "450px" }}
        >
          {/* 左侧导航 */}
          <div
            className="w-[180px] flex-shrink-0 py-3 overflow-y-auto"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderRight: "1px solid var(--border-color)",
            }}
          >
            {settingsMenuItems.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all mx-1 rounded-lg"
                  style={{
                    backgroundColor: isActive
                      ? "var(--active-bg)"
                      : "transparent",
                    color: isActive
                      ? "var(--accent-color)"
                      : "var(--text-secondary)",
                    width: "calc(100% - 8px)",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm font-medium">{item.label}</span>
                  {isActive && (
                    <ChevronRight
                      className="h-3 w-3 flex-shrink-0 ml-auto"
                      style={{ color: "var(--accent-color)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* 右侧内容 */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* 面包屑 */}
            <div
              className="flex items-center gap-2 mb-6 pb-3"
              style={{ borderBottom: "1px solid var(--border-color)" }}
            >
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                设置
              </span>
              <ChevronRight
                className="h-3 w-3"
                style={{ color: "var(--text-muted)" }}
              />
              <span
                className="text-xs font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {settingsMenuItems.find((item) => item.id === activeTab)?.label}
              </span>
            </div>

            {/* 内容区域 */}
            {renderContent()}
          </div>
        </div>
      </DialogContent>
    </Dialog.Root>
  );
}
