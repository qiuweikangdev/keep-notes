import process from "node:process";
import { BrowserWindow, app, session } from "electron";
import { electronApp, optimizer } from "@electron-toolkit/utils";
import { createWindow } from "./window";
import { registerAllIpc } from "./ipc";
import { registerShortcuts } from "./shortcuts";

app.whenReady().then(() => {
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

  createWindow();
  registerAllIpc();
  registerShortcuts();

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
