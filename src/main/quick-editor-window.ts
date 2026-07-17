import { join } from "node:path";
import process from "node:process";
import { BrowserWindow, globalShortcut, screen } from "electron";
import { is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import { IPC_CHANNELS } from "../shared/constants";
import type {
  QuickEditorWindowContent,
  ShortcutRegistrationResult,
} from "../shared/types";
import { checkAndCloseWindow, focusMainWindow, getMainWindow } from "./window";

const QUICK_EDITOR_WINDOW_WIDTH = 640;
const QUICK_EDITOR_WINDOW_HEIGHT = 420;
const QUICK_EDITOR_WINDOW_MIN_WIDTH = 440;
const QUICK_EDITOR_WINDOW_MIN_HEIGHT = 300;
const MAX_GLOBAL_SHORTCUTS = 4;

export const DEFAULT_QUICK_EDITOR_SHORTCUT = "CmdOrCtrl+Alt+N";

let quickEditorWindow: BrowserWindow | null = null;
const quickEditorWindows = new Set<BrowserWindow>();
let registeredShortcutKeys: string[] = [];
const closingQuickEditorWindows = new Set<BrowserWindow>();
const pendingQuickEditorContents: QuickEditorWindowContent[] = [];
const quickEditorWindowSources = new Map<
  BrowserWindow,
  NonNullable<QuickEditorWindowContent["source"]>
>();

function normalizeQuickEditorWindowContent(
  value: unknown,
): QuickEditorWindowContent | null {
  if (!value || typeof value !== "object") return null;

  const { content, source } = value as Record<string, unknown>;
  if (typeof content !== "string") return null;
  if (source === null) return { content, source: null };
  if (!source || typeof source !== "object") return null;

  const { groupId, tabId, filePath } = source as Record<string, unknown>;
  if (
    typeof groupId !== "string" ||
    typeof tabId !== "string" ||
    (typeof filePath !== "string" && filePath !== null)
  ) {
    return null;
  }

  return { content, source: { groupId, tabId, filePath } };
}

function hasSameQuickEditorSource(
  left: NonNullable<QuickEditorWindowContent["source"]>,
  right: NonNullable<QuickEditorWindowContent["source"]>,
): boolean {
  return (
    left.groupId === right.groupId &&
    left.tabId === right.tabId &&
    left.filePath === right.filePath
  );
}

function toElectronAccelerator(key: string): string {
  return key
    .replace(/CmdOrCtrl/g, "CommandOrControl")
    .replace(/ArrowLeft/g, "Left")
    .replace(/ArrowRight/g, "Right")
    .replace(/ArrowUp/g, "Up")
    .replace(/ArrowDown/g, "Down");
}

function getQuickEditorWindowBounds(
  existingWindowCount: number,
): Electron.Rectangle {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { workArea } = display;
  const width = Math.min(QUICK_EDITOR_WINDOW_WIDTH, workArea.width);
  const height = Math.min(QUICK_EDITOR_WINDOW_HEIGHT, workArea.height);
  // 多个浮窗按级联偏移展示，避免新窗口完全遮住已有编辑器。
  const offset = Math.min(existingWindowCount, 6) * 28;
  const centeredX = Math.round(workArea.x + (workArea.width - width) / 2);
  const centeredY = Math.round(workArea.y + (workArea.height - height) / 2);

  return {
    x: Math.min(
      Math.max(workArea.x, centeredX + offset),
      workArea.x + workArea.width - width,
    ),
    y: Math.min(
      Math.max(workArea.y, centeredY + offset),
      workArea.y + workArea.height - height,
    ),
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

  return createQuickEditorWindow();
}

export function createQuickEditorWindow(
  initialValue: unknown = null,
): BrowserWindow {
  const initialContent = normalizeQuickEditorWindowContent(initialValue);
  const bounds = getQuickEditorWindowBounds(quickEditorWindows.size);
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

  quickEditorWindows.add(win);
  if (initialContent?.source) {
    quickEditorWindowSources.set(win, initialContent.source);
  }
  if (!quickEditorWindow || quickEditorWindow.isDestroyed()) {
    quickEditorWindow = win;
  }

  let hasRevealed = false;
  const revealWhenReady = () => {
    if (hasRevealed) return;
    hasRevealed = true;
    revealQuickEditorWindow(win);
  };

  // 部分 Windows 环境不会稳定触发 ready-to-show，页面加载完成也应立即展示。
  win.once("ready-to-show", revealWhenReady);
  win.webContents.once("did-finish-load", revealWhenReady);
  if (initialContent) {
    win.webContents.once("did-finish-load", () => {
      if (!win.isDestroyed()) {
        win.webContents.send(
          IPC_CHANNELS.QUICK_EDITOR.INITIAL_CONTENT,
          initialContent,
        );
      }
    });
  }

  win.on("close", (event) => {
    if (win.isDestroyed()) return;

    // 已关联来源标签的浮窗内容会实时回写，关闭时无需再走独立草稿的保存确认。
    if (quickEditorWindowSources.has(win)) return;

    event.preventDefault();
    if (closingQuickEditorWindows.has(win)) return;

    // 关闭入口统一经过脏状态检查，避免标题栏按钮和系统快捷键产生不同行为。
    closingQuickEditorWindows.add(win);
    void checkAndCloseWindow(win).finally(() => {
      if (!win.isDestroyed()) {
        closingQuickEditorWindows.delete(win);
      }
    });
  });

  win.once("closed", () => {
    quickEditorWindows.delete(win);
    quickEditorWindowSources.delete(win);
    closingQuickEditorWindows.delete(win);
    if (quickEditorWindow === win) {
      quickEditorWindow =
        [...quickEditorWindows].find((window) => !window.isDestroyed()) ?? null;
    }
  });

  loadQuickEditorWindow(win);
  return win;
}

export function closeQuickEditorWindow(
  win: BrowserWindow | null = quickEditorWindow,
): void {
  if (!win || !quickEditorWindows.has(win) || win.isDestroyed()) return;
  win.close();
}

export function returnToMainWindowFromQuickEditor(
  value: unknown,
  win: BrowserWindow | null = quickEditorWindow,
): void {
  const content = normalizeQuickEditorWindowContent(value);
  if (!content || !win || !quickEditorWindows.has(win) || win.isDestroyed()) {
    return;
  }

  const mainWindow = getMainWindow();
  if (!mainWindow) return;

  // 每个浮窗独立入队，主窗口切焦或热重载后仍能按顺序消费草稿。
  pendingQuickEditorContents.push(content);
  mainWindow.webContents.send(IPC_CHANNELS.QUICK_EDITOR.IMPORT_CONTENT);
  win.destroy();
  focusMainWindow();
}

/** 在关联的标签页与浮窗之间广播实时编辑快照。 */
export function syncQuickEditorContent(
  value: unknown,
  sender: BrowserWindow | null = null,
): void {
  const incomingContent = normalizeQuickEditorWindowContent(value);
  if (!incomingContent?.source) return;

  const senderIsQuickEditor = sender !== null && quickEditorWindows.has(sender);
  const source = senderIsQuickEditor
    ? quickEditorWindowSources.get(sender!)
    : incomingContent.source;
  if (!source) return;

  const content: QuickEditorWindowContent = {
    content: incomingContent.content,
    source,
  };

  if (senderIsQuickEditor) {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(
        IPC_CHANNELS.QUICK_EDITOR.CONTENT_UPDATED,
        content,
      );
    }
  }

  for (const win of quickEditorWindows) {
    const windowSource = quickEditorWindowSources.get(win);
    if (
      win === sender ||
      win.isDestroyed() ||
      !windowSource ||
      !hasSameQuickEditorSource(windowSource, source)
    ) {
      continue;
    }
    win.webContents.send(IPC_CHANNELS.QUICK_EDITOR.CONTENT_UPDATED, content);
  }
}

export function consumePendingQuickEditorContent(): QuickEditorWindowContent | null {
  return pendingQuickEditorContents.shift() ?? null;
}

export function destroyQuickEditorWindow(): void {
  const windows = [...quickEditorWindows];
  quickEditorWindows.clear();
  quickEditorWindowSources.clear();
  closingQuickEditorWindows.clear();
  quickEditorWindow = null;
  windows.forEach((win) => {
    if (!win.isDestroyed()) win.destroy();
  });
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
  pendingQuickEditorContents.length = 0;
  destroyQuickEditorWindow();
}
