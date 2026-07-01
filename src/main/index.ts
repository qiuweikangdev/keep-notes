import process from "node:process";
import { join } from "node:path";
import { BrowserWindow, app, session } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import { createWindow } from "./window";
import { registerAllIpc } from "./ipc";
import { registerAppMenu } from "./menu";
import { initializeReminderIpc } from "./ipc/reminder.ipc";
import { initializeNotificationIpc } from "./ipc/notification.ipc";
import { initializeExportIpc } from "./ipc/export.ipc";

const APP_ID = "com.keep-notes";
const APP_NAME = "Keep Notes";

app.setName(APP_NAME);

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

app.whenReady().then(async () => {
  electronApp.setAppUserModelId(APP_ID);

  // 开发模式下运行的是 Electron.app，显式设置 Dock 图标可避免显示默认 Electron 图标。
  if (process.platform === "darwin" && app.dock) {
    app.dock.setIcon(icon);
  }

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
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
  await initializeReminderIpc();
  await initializeNotificationIpc();
  await initializeExportIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
