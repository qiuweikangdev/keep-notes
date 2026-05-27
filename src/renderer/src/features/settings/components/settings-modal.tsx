import { useState } from "react";
import { useUIStore } from "@/store/ui.store";
import { useUserStore } from "@/store/user.store";
import { useTreeStore } from "@/store/tree.store";
import { useElectron } from "@/hooks/use-electron";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function SettingsModal() {
  const { isSettingsOpen, setSettingsOpen } = useUIStore();
  const { githubInfo, setGithubInfo } = useUserStore();
  const { dirSettings, setDirSettings } = useTreeStore();
  const { gitDownload, gitUpload } = useElectron();
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
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <Dialog.Title>设置</Dialog.Title>
        </DialogHeader>

        <Tabs.Root defaultValue="github" className="w-full">
          <Tabs.List className="grid w-full grid-cols-2">
            <Tabs.Trigger value="github">Github 同步</Tabs.Trigger>
            <Tabs.Trigger value="theme">目录主题</Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="github" className="space-y-4">
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

          <Tabs.Content value="theme" className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>目录颜色</Label>
                <select
                  className="p-2 border rounded-md bg-background"
                  value={dirSettings.dirColor}
                  onChange={(e) =>
                    setDirSettings({ dirColor: e.target.value as any })
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
                />
              </div>
            </div>
          </Tabs.Content>
        </Tabs.Root>
      </DialogContent>
    </Dialog.Root>
  );
}
