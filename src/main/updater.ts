import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app, shell } from "electron";
import electronUpdater from "electron-updater";
import type {
  CancellationToken as ElectronUpdaterCancellationToken,
  ProgressInfo,
  UpdateInfo,
} from "electron-updater";
import { APP_AUTHOR, APP_REPOSITORY_URL } from "../shared/constants";
import type { AppInfo, AppUpdateState } from "../shared/types";

const { autoUpdater, CancellationToken: CancellationTokenCtor } =
  electronUpdater;

type UpdateListener = (state: AppUpdateState) => void;

interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates: () => Promise<{
    isUpdateAvailable: boolean;
    updateInfo: UpdateInfo;
  } | null>;
  downloadUpdate: (
    cancellationToken?: ElectronUpdaterCancellationToken,
  ) => Promise<string[]>;
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
}

interface AppLike {
  getVersion: () => string;
  isPackaged: boolean;
  getPath: (name: string) => string;
}

interface ShellLike {
  openExternal: (url: string) => Promise<void>;
}

interface AppUpdateControllerOptions {
  app?: AppLike;
  updater?: UpdaterLike;
  shell?: ShellLike;
  createCancellationToken?: () => ElectronUpdaterCancellationToken;
}

/**
 * 绕过 ShipIt 签名验证，直接替换应用包。
 *
 * 背景：macOS 上 electron-updater 默认通过 ShipIt 替换应用，
 * ShipIt 在替换前会验证代码签名。ad-hoc 签名打包进 zip 后跨机器失效。
 *
 * 方案：不调用 quitAndInstall()（那是 ShipIt 路径），而是生成一个
 * 独立的 shell 脚本——等旧应用退出后直接 rm + cp 替换 .app，再 open 新版本。
 */
function spawnReplaceScript(
  updateAppPath: string,
  currentAppPath: string,
): void {
  const tmpDir = join(app.getPath("temp"), "keep-notes-update");
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  const scriptPath = join(tmpDir, "replace.sh");
  // 注意：单引号包裹路径，防止路径包含空格时出错
  const script = `#!/bin/bash
set -e

# 等待旧应用完全退出
sleep 2

# 删除旧版本
rm -rf '${currentAppPath}'

# 把新应用拷贝到 Applications
cp -R '${updateAppPath}' '${currentAppPath}'

# 启动新版本
open '${currentAppPath}'

# 清理临时目录
rm -rf '${tmpDir}'
`;
  writeFileSync(scriptPath, script, { mode: 0o755 });

  spawn("/bin/sh", [scriptPath], {
    detached: true,
    stdio: "ignore",
    cwd: "/",
  }).unref();
}

export class AppUpdateController {
  private readonly app: AppLike;
  private readonly updater: UpdaterLike;
  private readonly shell: ShellLike;
  private readonly createCancellationToken: () => ElectronUpdaterCancellationToken;
  private readonly listeners = new Set<UpdateListener>();
  private cancellationToken: ElectronUpdaterCancellationToken | null = null;
  private state: AppUpdateState;
  /** macOS 上下载完成后的更新包 .app 路径（用于绕过 ShipIt 的替换脚本） */
  private pendingUpdateAppPath: string | null = null;

  constructor(options: AppUpdateControllerOptions = {}) {
    this.app = options.app ?? app;
    this.updater = options.updater ?? autoUpdater;
    this.shell = options.shell ?? shell;
    this.createCancellationToken =
      options.createCancellationToken ?? (() => new CancellationTokenCtor());
    this.state = {
      status: "idle",
      currentVersion: this.app.getVersion(),
    };

    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.registerUpdaterEvents();
  }

  getAppInfo(): AppInfo {
    return {
      version: this.app.getVersion(),
      repositoryUrl: APP_REPOSITORY_URL,
      author: APP_AUTHOR,
    };
  }

  getState(): AppUpdateState {
    return {
      ...this.state,
      progress: this.state.progress && { ...this.state.progress },
    };
  }

  subscribe(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async checkForUpdates(): Promise<AppUpdateState> {
    if (
      this.state.status === "checking" ||
      this.state.status === "downloading"
    ) {
      return this.getState();
    }

    if (!this.app.isPackaged) {
      return this.setState({
        status: "error",
        currentVersion: this.app.getVersion(),
        message: "开发模式仅预览更新界面；请使用安装版检查 GitHub 更新。",
      });
    }

    this.setState({
      status: "checking",
      currentVersion: this.app.getVersion(),
      message: "正在检查更新...",
    });

    try {
      const result = await this.updater.checkForUpdates();
      if (!result?.isUpdateAvailable) {
        return this.setState({
          status: "not-available",
          currentVersion: this.app.getVersion(),
          message: "当前已是最新版本。",
        });
      }

      if (
        this.state.status === "checking" ||
        this.state.status === "available"
      ) {
        this.setState({
          status: "available",
          currentVersion: this.app.getVersion(),
          version: result.updateInfo.version,
          message: `发现新版本 v${result.updateInfo.version}`,
        });
      }

      return this.getState();
    } catch (error) {
      return this.setState({
        status: "error",
        currentVersion: this.app.getVersion(),
        message: this.toErrorMessage(error),
      });
    }
  }

  cancelUpdate(): AppUpdateState {
    this.cancellationToken?.cancel();
    this.cancellationToken = null;
    return this.setState({
      status: "canceled",
      currentVersion: this.app.getVersion(),
      version: this.state.version,
      message: "已取消更新操作。",
    });
  }

  async downloadUpdate(): Promise<AppUpdateState> {
    if (this.state.status !== "available" || !this.state.version) {
      return this.getState();
    }

    this.cancellationToken = this.createCancellationToken();
    this.setState({
      status: "downloading",
      currentVersion: this.app.getVersion(),
      version: this.state.version,
      message: "正在下载更新...",
      progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
    });

    try {
      const downloadedFiles = await this.updater.downloadUpdate(
        this.cancellationToken,
      );

      // 记录下载后的 .app 路径，installUpdate 时绕过 ShipIt 直接替换
      if (process.platform === "darwin" && downloadedFiles.length > 0) {
        const firstApp = downloadedFiles.find((f) => f.endsWith(".app"));
        if (firstApp) {
          this.pendingUpdateAppPath = firstApp;
        }
      }
    } catch (error) {
      if (this.state.status === "canceled") return this.getState();
      this.cancellationToken = null;
      this.setState({
        status: "error",
        currentVersion: this.app.getVersion(),
        version: this.state.version,
        message: this.toErrorMessage(error),
      });
    }

    return this.getState();
  }

  installUpdate(): void {
    if (process.platform === "darwin" && this.pendingUpdateAppPath) {
      // macOS: 绕过 ShipIt 签名验证，用独立脚本直接替换 .app
      const currentAppPath = this.getAppBundlePath();
      spawnReplaceScript(this.pendingUpdateAppPath, currentAppPath);
      app.quit();
    } else {
      this.updater.quitAndInstall(false, true);
    }
  }

  async openRepository(): Promise<boolean> {
    await this.shell.openExternal(APP_REPOSITORY_URL);
    return true;
  }

  /**
   * 获取当前运行应用的 .app 包路径
   * 例如 /Applications/Keep Notes.app
   */
  private getAppBundlePath(): string {
    // app.getPath("exe") 返回:
    //   macOS: /Applications/Keep Notes.app/Contents/MacOS/Keep Notes
    // 向上两级到 Contents，再向上一级到 .app
    return dirname(dirname(dirname(this.app.getPath("exe"))));
  }

  private registerUpdaterEvents(): void {
    this.updater.on("update-available", (info: UpdateInfo) => {
      this.setState({
        status: "available",
        currentVersion: this.app.getVersion(),
        version: info.version,
        message: `发现新版本 v${info.version}`,
      });
    });

    this.updater.on("update-not-available", () => {
      this.setState({
        status: "not-available",
        currentVersion: this.app.getVersion(),
        message: "当前已是最新版本。",
      });
    });

    this.updater.on("download-progress", (progress: ProgressInfo) => {
      this.setState({
        status: "downloading",
        currentVersion: this.app.getVersion(),
        version: this.state.version,
        progress: {
          percent: progress.percent,
          transferred: progress.transferred,
          total: progress.total,
          bytesPerSecond: progress.bytesPerSecond,
        },
        message: "正在下载更新...",
      });
    });

    this.updater.on("update-downloaded", (info: UpdateInfo) => {
      this.cancellationToken = null;
      this.setState({
        status: "downloaded",
        currentVersion: this.app.getVersion(),
        version: info.version,
        progress: this.state.progress,
        message: "更新已下载，重启应用后安装。",
      });
    });

    this.updater.on("update-cancelled", (info: UpdateInfo) => {
      this.cancellationToken = null;
      this.setState({
        status: "canceled",
        currentVersion: this.app.getVersion(),
        version: info.version,
        message: "已取消更新操作。",
      });
    });

    this.updater.on("error", (error: Error) => {
      if (this.state.status === "canceled") return;
      this.cancellationToken = null;
      this.setState({
        status: "error",
        currentVersion: this.app.getVersion(),
        version: this.state.version,
        message: this.toErrorMessage(error),
      });
    });
  }

  private setState(nextState: AppUpdateState): AppUpdateState {
    this.state = nextState;
    const snapshot = this.getState();
    this.listeners.forEach((listener) => listener(snapshot));
    return snapshot;
  }

  private toErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    // 404 表示 Release 尚未发布完成（GitHub Actions 打包中）
    if (message.includes("404")) {
      return "暂无可用更新，请稍后再试。";
    }
    return message || "更新操作失败，请稍后再试。";
  }
}

export const appUpdateController = new AppUpdateController();
