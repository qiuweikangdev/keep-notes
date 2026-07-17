import { join } from "node:path";
import process from "node:process";
import { BrowserWindow, globalShortcut, screen } from "electron";
import { is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import type { ShortcutRegistrationResult } from "../shared/types";
import { checkAndCloseWindow, focusMainWindow } from "./window";

const QUICK_EDITOR_WINDOW_WIDTH = 640;
const QUICK_EDITOR_WINDOW_HEIGHT = 420;
const QUICK_EDITOR_WINDOW_MIN_WIDTH = 440;
const QUICK_EDITOR_WINDOW_MIN_HEIGHT = 300;
const MAX_GLOBAL_SHORTCUTS = 4;

export const DEFAULT_QUICK_EDITOR_SHORTCUT = "CmdOrCtrl+Alt+N";

let quickEditorWindow: BrowserWindow | null = null;
let registeredShortcutKeys: string[] = [];
let closeInProgress = false;
let focusMainAfterClose = false;

function toElectronAccelerator(key: string): string {
  return key
    .replace(/CmdOrCtrl/g, "CommandOrControl")
    .replace(/ArrowLeft/g, "Left")
    .replace(/ArrowRight/g, "Right")
    .replace(/ArrowUp/g, "Up")
    .replace(/ArrowDown/g, "Down");
}

function getQuickEditorWindowBounds(): Electron.Rectangle {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { workArea } = display;
  const width = Math.min(QUICK_EDITOR_WINDOW_WIDTH, workArea.width);
  const height = Math.min(QUICK_EDITOR_WINDOW_HEIGHT, workArea.height);

  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  };
}

function revealQuickEditorWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;

  win.setAlwaysOnTop(true, "floating");
  win.show();
  win.focus();
}

function loadQuickEditorWindow(win: BrowserWindow): void {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    const rendererUrl = new URL(process.env.ELECTRON_RENDERER_URL);
    rendererUrl.searchParams.set("window", "quick-editor");
    void win.loadURL(rendererUrl.toString());
    return;
  }

  void win.loadFile(join(__dirname, "../renderer/index.html"), {
    query: { window: "quick-editor" },
  });
}

export function showQuickEditorWindow(): BrowserWindow {
  if (quickEditorWindow && !quickEditorWindow.isDestroyed()) {
    revealQuickEditorWindow(quickEditorWindow);
    return quickEditorWindow;
  }

  const bounds = getQuickEditorWindowBounds();
  const win = new BrowserWindow({
    ...bounds,
    minWidth: QUICK_EDITOR_WINDOW_MIN_WIDTH,
    minHeight: QUICK_EDITOR_WINDOW_MIN_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: true,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    title: "快速编辑",
    ...(process.platform !== "darwin" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  quickEditorWindow = win;
  closeInProgress = false;
  focusMainAfterClose = false;

  let hasRevealed = false;
  const revealWhenReady = () => {
    if (hasRevealed) return;
    hasRevealed = true;
    revealQuickEditorWindow(win);
  };

  // 部分 Windows 环境不会稳定触发 ready-to-show，页面加载完成也应立即展示。
  win.once("ready-to-show", revealWhenReady);
  win.webContents.once("did-finish-load", revealWhenReady);

  win.on("close", (event) => {
    if (win.isDestroyed()) return;

    event.preventDefault();
    if (closeInProgress) return;

    // 关闭入口统一经过脏状态检查，避免标题栏按钮和系统快捷键产生不同行为。
    closeInProgress = true;
    void checkAndCloseWindow(win).finally(() => {
      if (!win.isDestroyed()) {
        closeInProgress = false;
        focusMainAfterClose = false;
      }
    });
  });

  win.once("closed", () => {
    if (quickEditorWindow === win) quickEditorWindow = null;
    closeInProgress = false;

    if (focusMainAfterClose) {
      focusMainAfterClose = false;
      focusMainWindow();
    }
  });

  loadQuickEditorWindow(win);
  return win;
}

export function closeQuickEditorWindow(
  win: BrowserWindow | null = quickEditorWindow,
): void {
  if (!win || win !== quickEditorWindow || win.isDestroyed()) return;
  win.close();
}

export function returnToMainWindowFromQuickEditor(
  win: BrowserWindow | null = quickEditorWindow,
): void {
  if (!win || win !== quickEditorWindow || win.isDestroyed()) return;
  focusMainAfterClose = true;
  win.close();
}

export function destroyQuickEditorWindow(): void {
  focusMainAfterClose = false;
  closeInProgress = false;
  if (quickEditorWindow && !quickEditorWindow.isDestroyed()) {
    quickEditorWindow.destroy();
  }
  quickEditorWindow = null;
}

function unregisterKeys(keys: string[]): void {
  keys.forEach((key) => globalShortcut.unregister(toElectronAccelerator(key)));
}

function registerKeys(keys: string[]): string[] {
  const failures: string[] = [];
  keys.forEach((key) => {
    try {
      if (
        !globalShortcut.register(
          toElectronAccelerator(key),
          showQuickEditorWindow,
        )
      ) {
        failures.push(key);
      }
    } catch {
      failures.push(key);
    }
  });
  return failures;
}

export function configureQuickEditorGlobalShortcuts(
  keys: string[],
): ShortcutRegistrationResult {
  const normalizedKeys = [...new Set(keys.map((key) => key.trim()))]
    .filter(Boolean)
    .slice(0, MAX_GLOBAL_SHORTCUTS);

  if (
    normalizedKeys.length === registeredShortcutKeys.length &&
    normalizedKeys.every((key, index) => key === registeredShortcutKeys[index])
  ) {
    return { success: true, failedKeys: [] };
  }

  const previousKeys = [...registeredShortcutKeys];
  unregisterKeys(previousKeys);

  const failedKeys = registerKeys(normalizedKeys);
  if (failedKeys.length === 0) {
    registeredShortcutKeys = normalizedKeys;
    return { success: true, failedKeys: [] };
  }

  unregisterKeys(normalizedKeys.filter((key) => !failedKeys.includes(key)));
  const rollbackFailures = registerKeys(previousKeys);
  registeredShortcutKeys = previousKeys.filter(
    (key) => !rollbackFailures.includes(key),
  );

  return { success: false, failedKeys };
}

export function disposeQuickEditorWindow(): void {
  unregisterKeys(registeredShortcutKeys);
  registeredShortcutKeys = [];
  destroyQuickEditorWindow();
}
