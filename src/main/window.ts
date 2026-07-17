import { dirname, join } from "node:path";
import fs from "node:fs";
import process from "node:process";
import { BrowserWindow, app, shell, dialog } from "electron";
import { is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import { registerWindowShortcuts } from "./shortcuts";
import { getCachedDirtyState } from "./ipc/editor.ipc";
import { MAC_TRAFFIC_LIGHT_POSITION } from "../shared/title-bar";
import { IPC_CHANNELS } from "../shared/constants";
import type { CloseSaveSnapshot, WindowOpenTarget } from "../shared/types";
import { destroyReminderWindow } from "./reminder-window";

// 平台判断
const isMac = process.platform === "darwin";
const closeInProgressWindows = new WeakSet<BrowserWindow>();
const mainWindows = new Set<BrowserWindow>();

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
  ...(!isMac ? { icon } : {}),
  webPreferences: {
    preload: join(__dirname, "../preload/index.mjs"),
    sandbox: false,
    contextIsolation: true,
    nodeIntegration: false,
  },
};

export function createWindow(initialTarget?: WindowOpenTarget): BrowserWindow {
  const win = new BrowserWindow(windowConfig);
  mainWindows.add(win);

  win.once("closed", () => {
    mainWindows.delete(win);
    if (mainWindows.size === 0) destroyReminderWindow();
  });

  registerWindowShortcuts(win);

  if (!app.isPackaged) {
    win.webContents.openDevTools();
  }

  win.on("ready-to-show", () => {
    win.show();
  });

  if (initialTarget) {
    // 新窗口首次完成加载后，把要打开的工作区/文件交给渲染进程处理。
    win.webContents.once("did-finish-load", () => {
      if (win.isDestroyed()) return;
      win.webContents.send(IPC_CHANNELS.WINDOW.OPEN_TARGET, initialTarget);
    });
  }

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // 窗口关闭前检查是否有未保存内容
  win.on("close", (event) => {
    if (win.isDestroyed()) return;

    event.preventDefault();
    if (closeInProgressWindows.has(win)) return;

    // 必须在第一次异步关闭检查前同步占用当前窗口，避免重复事件并发保存同一批草稿。
    closeInProgressWindows.add(win);
    return checkAndCloseWindow(win).finally(() => {
      // 取消或失败时窗口仍然存在，需要释放占用以允许用户再次关闭。
      if (!win.isDestroyed()) closeInProgressWindows.delete(win);
    });
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}

export function getMainWindow(): BrowserWindow | null {
  const windows = [...mainWindows];
  return (
    windows.toReversed().find((candidate) => !candidate.isDestroyed()) ?? null
  );
}

export function focusMainWindow(): void {
  const win = getMainWindow();

  if (!win) return;

  // 从提醒浮窗返回时恢复最靠后的应用窗口，并把它带回前台。
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

export async function resolveWindowOpenTarget(
  targetPath: string,
  stat: typeof fs.promises.stat = fs.promises.stat,
): Promise<WindowOpenTarget> {
  const stats = await stat(targetPath);

  // 文件夹直接作为新窗口工作区，文件则打开其所在目录并额外定位文件。
  if (stats.isDirectory()) {
    return { rootPath: targetPath };
  }

  if (stats.isFile()) {
    return {
      rootPath: dirname(targetPath),
      filePath: targetPath,
    };
  }

  throw new Error(`Unsupported open target: ${targetPath}`);
}

export async function openPathInNewWindow(
  targetPath: string,
  deps: {
    createWindow?: (target?: WindowOpenTarget) => BrowserWindow | void;
    stat?: typeof fs.promises.stat;
  } = {},
): Promise<boolean> {
  const {
    createWindow: createWindowImpl = createWindow,
    stat = fs.promises.stat,
  } = deps;

  try {
    const initialTarget = await resolveWindowOpenTarget(targetPath, stat);
    createWindowImpl(initialTarget);
    return true;
  } catch (error) {
    console.error("Error while opening in new window:", error);
    return false;
  }
}

function isCloseSaveSnapshot(value: unknown): value is CloseSaveSnapshot {
  if (typeof value !== "object" || value === null) return false;

  const snapshot = value as Record<string, unknown>;
  return (
    typeof snapshot.groupId === "string" &&
    typeof snapshot.tabId === "string" &&
    typeof snapshot.content === "string" &&
    (typeof snapshot.filePath === "string" || snapshot.filePath === null)
  );
}

export async function checkAndCloseWindow(win: BrowserWindow): Promise<void> {
  if (win.isDestroyed()) return;

  try {
    const isDirty = getCachedDirtyState(win);

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
  }
}

export async function saveAndClose(win: BrowserWindow): Promise<void> {
  if (win.isDestroyed()) return;

  try {
    while (!win.isDestroyed()) {
      const serializedSnapshot = await win.webContents.executeJavaScript(
        `(() => {
          if (typeof window.__getNextDirtyEditor !== "function") {
            throw new Error("Close-save snapshot bridge is unavailable");
          }
          return Promise.resolve(window.__getNextDirtyEditor()).then((snapshot) => JSON.stringify(snapshot));
        })()`,
      );
      const parsedSnapshot: unknown = JSON.parse(serializedSnapshot);

      if (parsedSnapshot === null) {
        win.destroy();
        return;
      }

      // 渲染进程数据属于跨进程输入，必须逐字段校验后才能用于写盘。
      if (!isCloseSaveSnapshot(parsedSnapshot)) {
        throw new Error("Invalid close-save snapshot");
      }
      const snapshot = parsedSnapshot;

      let savedPath = snapshot.filePath;
      if (!savedPath) {
        const saveResult = await dialog.showSaveDialog(win, {
          title: "保存文件",
          defaultPath: "未命名.md",
          filters: [
            { name: "Markdown", extensions: ["md"] },
            { name: "所有文件", extensions: ["*"] },
          ],
        });

        if (win.isDestroyed()) return;
        if (saveResult.canceled || !saveResult.filePath) return;
        savedPath = saveResult.filePath;
      }

      await fs.promises.writeFile(savedPath, snapshot.content, "utf-8");
      if (win.isDestroyed()) return;

      // 仅在回调存在时确认本次快照保存，并把写盘内容传回以检测并发编辑。
      await win.webContents.executeJavaScript(
        `(() => {
          if (typeof window.__onCloseSaveSuccess !== "function") {
            throw new Error("Close-save success bridge is unavailable");
          }
          return window.__onCloseSaveSuccess(${JSON.stringify(snapshot.groupId)}, ${JSON.stringify(snapshot.tabId)}, ${JSON.stringify(savedPath)}, ${JSON.stringify(snapshot.content)});
        })()`,
      );
    }
  } catch (error) {
    console.error("Error during save:", error);
  }
}
