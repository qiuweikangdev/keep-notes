import process from "node:process";
import { join } from "node:path";
import { app, session } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import {
  createWindow,
  focusMainWindow,
  getMainWindow,
  openMarkdownFileInCurrentWindow,
} from "./window";
import { registerAllIpc } from "./ipc";
import { registerAppMenu } from "./menu";
import { initializeReminderIpc } from "./ipc/reminder.ipc";
import { initializeNotificationIpc } from "./ipc/notification.ipc";
import { initializeExportIpc } from "./ipc/export.ipc";
import { registerWindowsZoomInShortcut } from "./zoom-shortcuts";
import {
  configureReminderGlobalShortcuts,
  DEFAULT_REMINDER_SHORTCUT,
  disposeReminderWindow,
} from "./reminder-window";
import {
  configureQuickEditorGlobalShortcuts,
  DEFAULT_QUICK_EDITOR_SHORTCUT,
  disposeQuickEditorWindow,
} from "./quick-editor-window";
import { createTray, disposeTray, refreshTray } from "./tray";
import {
  getMarkdownFilePathsFromCommandLine,
  normalizeMarkdownFilePath,
} from "./markdown-open";

const APP_ID = "com.keep-notes";
const APP_NAME = "Keep Notes";

app.setName(APP_NAME);

const pendingMarkdownFilePaths = new Set(
  getMarkdownFilePathsFromCommandLine(process.argv),
);
let canOpenMarkdownFiles = false;

function requestMarkdownFileOpen(filePath: string): void {
  const markdownPath = normalizeMarkdownFilePath(filePath);
  if (!markdownPath) return;

  if (!canOpenMarkdownFiles) {
    pendingMarkdownFilePaths.add(markdownPath);
    return;
  }

  void openMarkdownFileInCurrentWindow(markdownPath);
}

// macOS 会通过 open-file 事件把 Finder 的“打开方式”请求交给已启动或正在启动的应用。
app.on("open-file", (event, filePath) => {
  event.preventDefault();
  requestMarkdownFileOpen(filePath);
});

if (!app.isPackaged) {
  // 开发版使用独立数据目录，避免与已安装版本争用缓存和网络状态文件。
  app.setPath("userData", join(app.getPath("appData"), `${APP_NAME} Dev`));

  if (process.platform === "win32") {
    // Windows 开发环境可能缺少 GPU 运行时或沙箱权限，禁用硬件加速避免启动崩溃。
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch("disable-gpu");
    app.commandLine.appendSwitch("disable-gpu-compositing");
    app.commandLine.appendSwitch("disable-gpu-sandbox");
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine, workingDirectory) => {
    // 重复启动只唤醒已有主窗口，避免多个进程争抢全局快捷键。
    if (process.platform === "darwin") refreshTray();
    const markdownFilePaths = getMarkdownFilePathsFromCommandLine(
      commandLine,
      workingDirectory,
    );
    if (markdownFilePaths.length > 0) {
      markdownFilePaths.forEach(requestMarkdownFileOpen);
      return;
    }
    if (!getMainWindow()) {
      createWindow();
    } else {
      focusMainWindow();
    }
  });

  app.whenReady().then(async () => {
    electronApp.setAppUserModelId(APP_ID);

    // 开发模式下运行的是 Electron.app，显式设置 Dock 图标可避免显示默认 Electron 图标。
    if (process.platform === "darwin" && app.dock) {
      app.dock.setIcon(icon);
    }

    app.on("browser-window-created", (_, window) => {
      optimizer.watchWindowShortcuts(window, { zoom: true });
      registerWindowsZoomInShortcut(window);
    });

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
        },
      });
    });

    // 注册 macOS 应用菜单
    registerAppMenu();

    registerAllIpc();
    // 主窗口渲染层尚未加载时也要先注册默认全局快捷键，避免启动早期按键无响应。
    configureReminderGlobalShortcuts([DEFAULT_REMINDER_SHORTCUT]);
    configureQuickEditorGlobalShortcuts([DEFAULT_QUICK_EDITOR_SHORTCUT]);
    await initializeReminderIpc();
    await initializeNotificationIpc();
    await initializeExportIpc();
    createTray();
    // 主窗口在后台预加载，可从系统托盘或 macOS Dock 随时唤醒。
    createWindow(undefined, { show: false });
    canOpenMarkdownFiles = true;
    pendingMarkdownFilePaths.forEach((filePath) => {
      void openMarkdownFileInCurrentWindow(filePath);
    });
    pendingMarkdownFilePaths.clear();

    app.on("activate", () => {
      // 从 Dock 激活时刷新状态栏项目，处理显示器仅熄屏但仍被系统识别的情况。
      if (process.platform === "darwin") refreshTray();
      if (!getMainWindow()) {
        createWindow();
      } else {
        focusMainWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  // 托盘应用在所有窗口关闭后继续运行，由托盘菜单显式退出。
});

app.on("will-quit", () => {
  disposeTray();
  disposeReminderWindow();
  disposeQuickEditorWindow();
});
