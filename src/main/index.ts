import process from "node:process";
import { BrowserWindow, app, session } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { createWindow } from "./window";
import { registerAllIpc } from "./ipc";
import { registerAppMenu } from "./menu";
import { initializeReminderIpc } from "./ipc/reminder.ipc";
import { initializeNotificationIpc } from "./ipc/notification.ipc";

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.keep-notes");

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
