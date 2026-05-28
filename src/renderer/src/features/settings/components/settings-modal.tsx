import { useState } from "react";
import { useUIStore } from "@/store/ui.store";
import { useUserStore } from "@/store/user.store";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "@/hooks/use-electron";
import { useTheme } from "@/hooks/use-theme";
import { themes, type ThemeName } from "@/config/themes";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export function SettingsModal() {
  const { isSettingsOpen, setSettingsOpen } = useUIStore();
  const { githubInfo, setGithubInfo } = useUserStore();
  const { dirSettings, setDirSettings } = useTreeStore();
  const { gitDownload, gitUpload } = useElectron();
  const { theme, setTheme } = useTheme();
  const [loading, setLoading] = useState(false);

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

  return (
    <Dialog.Root open={isSettingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <Dialog.Title style={{ color: "var(--text-primary)" }}>
            设置
          </Dialog.Title>
        </DialogHeader>

        <Tabs.Root defaultValue="appearance" className="w-full">
          <Tabs.List
            className="grid w-full grid-cols-3"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderRadius: "0.375rem",
              padding: "0.25rem",
            }}
          >
            <Tabs.Trigger
              value="appearance"
              style={{
                color: "var(--text-primary)",
                borderRadius: "0.25rem",
              }}
            >
              外观
            </Tabs.Trigger>
            <Tabs.Trigger
              value="github"
              style={{
                color: "var(--text-primary)",
                borderRadius: "0.25rem",
              }}
            >
              Github 同步
            </Tabs.Trigger>
            <Tabs.Trigger
              value="editor"
              style={{
                color: "var(--text-primary)",
                borderRadius: "0.25rem",
              }}
            >
              编辑器
            </Tabs.Trigger>
          </Tabs.List>

          {/* 外观设置 */}
          <Tabs.Content value="appearance" className="mt-4">
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-3 block">主题</Label>
                <div className="grid grid-cols-5 gap-3">
                  {(Object.keys(themes) as ThemeName[]).map((themeName) => {
                    const themeConfig = themes[themeName];
                    const isSelected = theme === themeName;

                    return (
                      <button
                        key={themeName}
                        onClick={() => setTheme(themeName)}
                        className="relative flex flex-col items-center gap-2 p-3 rounded-lg transition-all"
                        style={{
                          border: isSelected
                            ? "2px solid var(--accent-color)"
                            : "2px solid var(--border-color)",
                          backgroundColor: "var(--bg-secondary)",
                        }}
                      >
                        {/* 主题预览 */}
                        <div
                          className="w-full h-12 rounded-md overflow-hidden"
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
                            <div className="flex-1 p-1">
                              <div
                                className="w-3/4 h-1.5 rounded-sm mb-1"
                                style={{
                                  backgroundColor: themeConfig.preview.text,
                                  opacity: 0.6,
                                }}
                              />
                              <div
                                className="w-1/2 h-1.5 rounded-sm"
                                style={{
                                  backgroundColor: themeConfig.preview.text,
                                  opacity: 0.3,
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* 主题名称 */}
                        <span
                          className="text-xs font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {themeConfig.label}
                        </span>

                        {/* 选中指示器 */}
                        {isSelected && (
                          <div
                            className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: "var(--accent-color)" }}
                          >
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Tabs.Content>

          {/* Github 同步设置 */}
          <Tabs.Content value="github" className="mt-4">
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
              <div className="flex gap-2">
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
          </Tabs.Content>

          {/* 编辑器设置 */}
          <Tabs.Content value="editor" className="mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
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
              <div className="flex items-center justify-between">
                <Label>显示图标</Label>
                <input
                  type="checkbox"
                  checked={dirSettings.showIcon}
                  onChange={(e) =>
                    setDirSettings({ showIcon: e.target.checked })
                  }
                  className="h-4 w-4"
                  style={{ accentColor: "var(--accent-color)" }}
                />
              </div>
            </div>
          </Tabs.Content>
        </Tabs.Root>
      </DialogContent>
    </Dialog.Root>
  );
}
