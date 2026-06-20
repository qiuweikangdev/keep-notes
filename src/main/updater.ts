import { app, shell } from "electron";
import electronUpdater from "electron-updater";
import { CancellationToken } from "builder-util-runtime";
import type { ProgressInfo, UpdateInfo } from "electron-updater";
import { APP_AUTHOR, APP_REPOSITORY_URL } from "../shared/constants";
import type { AppInfo, AppUpdateState } from "../shared/types";

const { autoUpdater } = electronUpdater;

type UpdateListener = (state: AppUpdateState) => void;

interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates: () => Promise<{
    isUpdateAvailable: boolean;
    updateInfo: UpdateInfo;
  } | null>;
  downloadUpdate: (cancellationToken?: CancellationToken) => Promise<string[]>;
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
}

interface AppLike {
  getVersion: () => string;
  isPackaged: boolean;
}

interface ShellLike {
  openExternal: (url: string) => Promise<void>;
}

interface AppUpdateControllerOptions {
  app?: AppLike;
  updater?: UpdaterLike;
  shell?: ShellLike;
  createCancellationToken?: () => CancellationToken;
}

export class AppUpdateController {
  private readonly app: AppLike;
  private readonly updater: UpdaterLike;
  private readonly shell: ShellLike;
  private readonly createCancellationToken: () => CancellationToken;
  private readonly listeners = new Set<UpdateListener>();
  private cancellationToken: CancellationToken | null = null;
  private state: AppUpdateState;

  constructor(options: AppUpdateControllerOptions = {}) {
    this.app = options.app ?? app;
    this.updater = options.updater ?? autoUpdater;
    this.shell = options.shell ?? shell;
    this.createCancellationToken =
      options.createCancellationToken ?? (() => new CancellationToken());
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
        void this.startDownload(result.updateInfo);
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

  installUpdate(): void {
    this.updater.quitAndInstall(false, true);
  }

  async openRepository(): Promise<boolean> {
    await this.shell.openExternal(APP_REPOSITORY_URL);
    return true;
  }

  private registerUpdaterEvents(): void {
    this.updater.on("update-available", (info: UpdateInfo) => {
      this.setState({
        status: "available",
        currentVersion: this.app.getVersion(),
        version: info.version,
        message: `发现新版本 v${info.version}，开始下载...`,
      });
      void this.startDownload(info);
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

  private async startDownload(info: UpdateInfo): Promise<void> {
    if (this.state.status === "downloading") return;

    this.cancellationToken = this.createCancellationToken();
    this.setState({
      status: "downloading",
      currentVersion: this.app.getVersion(),
      version: info.version,
      message: "正在下载更新...",
      progress: { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 },
    });

    try {
      await this.updater.downloadUpdate(this.cancellationToken);
    } catch (error) {
      if (this.state.status === "canceled") return;
      this.cancellationToken = null;
      this.setState({
        status: "error",
        currentVersion: this.app.getVersion(),
        version: info.version,
        message: this.toErrorMessage(error),
      });
    }
  }

  private setState(nextState: AppUpdateState): AppUpdateState {
    this.state = nextState;
    const snapshot = this.getState();
    this.listeners.forEach((listener) => listener(snapshot));
    return snapshot;
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "更新操作失败，请稍后再试。";
  }
}

export const appUpdateController = new AppUpdateController();
