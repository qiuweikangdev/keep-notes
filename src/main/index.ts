import process from "node:process";
import { BrowserWindow, app, session } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import { createWindow } from "./window";
import { registerAllIpc } from "./ipc";
import { registerAppMenu } from "./menu";
import { initializeReminderIpc } from "./ipc/reminder.ipc";
import { initializeNotificationIpc } from "./ipc/notification.ipc";

const APP_ID = "com.keep-notes";
const APP_NAME = "Keep Notes";

app.setName(APP_NAME);

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
