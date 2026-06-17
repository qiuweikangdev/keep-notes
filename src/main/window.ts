import { join } from "node:path";
import fs from "node:fs";
import process from "node:process";
import { BrowserWindow, app, shell, dialog } from "electron";
import { is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import { registerWindowShortcuts } from "./shortcuts";
import { getCachedDirtyState } from "./ipc/editor.ipc";
import { MAC_TRAFFIC_LIGHT_POSITION } from "../shared/title-bar";

// 平台判断
const isMac = process.platform === "darwin";

// macOS: 使用原生标题栏隐藏模式，显示红绿灯按钮
// Windows/Linux: 使用无边框透明窗口，自定义标题栏
const windowConfig: Electron.BrowserWindowConstructorOptions = {
  width: 900,
  height: 670,
  minWidth: 400,
  minHeight: 400,
  show: false,
  resizable: true,
  hasShadow: true,
  ...(isMac
    ? {
        // macOS: 隐藏标题栏但保留原生红绿灯按钮
        titleBarStyle: "hidden",
        trafficLightPosition: MAC_TRAFFIC_LIGHT_POSITION,
      }
    : {
        // Windows/Linux: 无边框透明窗口
        frame: false,
        transparent: true,
      }),
  ...(process.platform === "linux" ? { icon } : {}),
  webPreferences: {
    preload: join(__dirname, "../preload/index.mjs"),
    sandbox: false,
    contextIsolation: true,
    nodeIntegration: false,
  },
};

export function createWindow(): BrowserWindow {
  const win = new BrowserWindow(windowConfig);

  registerWindowShortcuts(win);

  if (!app.isPackaged) {
    win.webContents.openDevTools();
  }

  win.on("ready-to-show", () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // 窗口关闭前检查是否有未保存内容
  win.on("close", (event) => {
    if (win.isDestroyed()) return;

    event.preventDefault();

    checkAndCloseWindow(win);
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}

async function checkAndCloseWindow(win: BrowserWindow): Promise<void> {
  if (win.isDestroyed()) return;

  try {
    const isDirty = getCachedDirtyState();

    if (isDirty) {
      const result = await dialog.showMessageBox(win, {
        type: "question",
        buttons: ["保存", "不保存", "取消"],
        defaultId: 0,
        cancelId: 2,
        title: "保存更改",
        message: "是否保存当前文档的更改？",
        detail: "未保存的内容将会丢失。",
      });

      if (win.isDestroyed()) return;

      switch (result.response) {
        case 0: {
          // 保存
          await saveAndClose(win);
          break;
        }
        case 1: {
          // 不保存，直接关闭
          win.destroy();
          break;
        }
        case 2: {
          // 取消，不做任何操作
          break;
        }
      }
    } else {
      win.destroy();
    }
  } catch (error) {
    console.error("Error during close:", error);
    if (!win.isDestroyed()) {
      win.destroy();
    }
  }
}

async function saveAndClose(win: BrowserWindow): Promise<void> {
  if (win.isDestroyed()) return;

  try {
    // 获取渲染进程的内容和文件路径
    const editorState = await win.webContents.executeJavaScript(
      `JSON.stringify({
        content: window.__getEditorContent ? window.__getEditorContent() : '',
        filePath: window.__getFilePath ? window.__getFilePath() : null
      })`,
    );

    const { content, filePath } = JSON.parse(editorState);

    if (!content) {
      win.destroy();
      return;
    }

    // 如果有文件路径，直接保存
    if (filePath) {
      await fs.promises.writeFile(filePath, content, "utf-8");
      if (!win.isDestroyed()) {
        await win.webContents.executeJavaScript(
          `window.__onSaveSuccess && window.__onSaveSuccess()`,
        );
        win.destroy();
      }
      return;
    }

    // 无文件路径，弹出另存为对话框
    const saveResult = await dialog.showSaveDialog(win, {
      title: "保存文件",
      defaultPath: "未命名.md",
      filters: [
        { name: "Markdown", extensions: ["md"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });

    if (win.isDestroyed()) return;

    if (!saveResult.canceled && saveResult.filePath) {
      await fs.promises.writeFile(saveResult.filePath, content, "utf-8");
      if (!win.isDestroyed()) {
        await win.webContents.executeJavaScript(
          `window.__onSaveAsSuccess && window.__onSaveAsSuccess("${saveResult.filePath.replace(/\\/g, "\\\\")}")`,
        );
        win.destroy();
      }
    }
    // 如果取消，不做任何操作（窗口保持打开）
  } catch (error) {
    console.error("Error during save:", error);
    if (!win.isDestroyed()) {
      win.destroy();
    }
  }
}
