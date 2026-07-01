import { dirname } from "node:path";
import { app, shell } from "electron";
import electronUpdater from "electron-updater";
import type {
  CancellationToken as ElectronUpdaterCancellationToken,
  ProgressInfo,
  UpdateInfo,
} from "electron-updater";
import { APP_AUTHOR, APP_REPOSITORY_URL } from "../shared/constants";
import type { AppInfo, AppUpdateState } from "../shared/types";
import {
  prepareMacUpdatePackage,
  replaceAppWithPreparedUpdate,
} from "./update-installer";

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
  quit?: () => void;
}

interface ShellLike {
  openExternal: (url: string) => Promise<void>;
}

interface AppUpdateControllerOptions {
  app?: AppLike;
  updater?: UpdaterLike;
  shell?: ShellLike;
  createCancellationToken?: () => ElectronUpdaterCancellationToken;
  platform?: NodeJS.Platform;
}

export class AppUpdateController {
  private readonly app: AppLike;
  private readonly updater: UpdaterLike;
  private readonly shell: ShellLike;
  private readonly createCancellationToken: () => ElectronUpdaterCancellationToken;
  private readonly platform: NodeJS.Platform;
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
    this.platform = options.platform ?? process.platform;
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

      if (this.platform === "darwin" && downloadedFiles.length > 0) {
        this.pendingUpdateAppPath = await prepareMacUpdatePackage({
          downloadedFiles,
          tempRoot: this.app.getPath("temp"),
        });
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
    if (this.platform === "darwin") {
      if (!this.pendingUpdateAppPath) {
        this.setState({
          status: "error",
          currentVersion: this.app.getVersion(),
          version: this.state.version,
          message: "更新包尚未准备完成，请重新下载更新。",
        });
        return;
      }

      const currentAppPath = this.getAppBundlePath();
      replaceAppWithPreparedUpdate({
        updateAppPath: this.pendingUpdateAppPath,
        currentAppPath,
        tempRoot: this.app.getPath("temp"),
      });
      this.app.quit?.() ?? app.quit();
      return;
    }

    this.updater.quitAndInstall(false, true);
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
