import { join } from "node:path";
import process from "node:process";
import { BrowserWindow, globalShortcut, screen } from "electron";
import { is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import { IPC_CHANNELS } from "../shared/constants";
import type { ShortcutRegistrationResult } from "../shared/types";

const REMINDER_WINDOW_WIDTH = 536;
const REMINDER_WINDOW_INITIAL_HEIGHT = 180;
const REMINDER_WINDOW_MIN_HEIGHT = 120;
const REMINDER_WINDOW_MAX_HEIGHT = 440;
const REMINDER_EDITOR_WINDOW_WIDTH = 440;
const REMINDER_EDITOR_WINDOW_INITIAL_HEIGHT = 420;
const REMINDER_EDITOR_WINDOW_MIN_HEIGHT = 280;
const REMINDER_EDITOR_WINDOW_MAX_HEIGHT = 700;
const REMINDER_EDITOR_LAYER_OFFSET_Y = 40;
const MAX_GLOBAL_SHORTCUTS = 4;

let reminderWindow: BrowserWindow | null = null;
let reminderEditorWindow: BrowserWindow | null = null;
let reminderEditorWindowReady = false;
let shouldRevealReminderEditorWindow = false;
let registeredShortcutKeys: string[] = [];
let shouldCenterNextResize = true;

function toElectronAccelerator(key: string): string {
  return key
    .replace(/CmdOrCtrl/g, "CommandOrControl")
    .replace(/ArrowLeft/g, "Left")
    .replace(/ArrowRight/g, "Right")
    .replace(/ArrowUp/g, "Up")
    .replace(/ArrowDown/g, "Down");
}

function getReminderWindowBounds(
  requestedHeight = REMINDER_WINDOW_INITIAL_HEIGHT,
): Electron.Rectangle {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { workArea } = display;
  const width = Math.min(REMINDER_WINDOW_WIDTH, workArea.width);
  const height = Math.min(requestedHeight, workArea.height);

  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  };
}

function notifyReminderWindowShown(win: BrowserWindow): void {
  win.webContents.send(IPC_CHANNELS.REMINDER.WINDOW_SHOWN);
}

function revealReminderWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;

  win.setAlwaysOnTop(true, "floating");
  win.show();
  win.focus();
  notifyReminderWindowShown(win);
}

export function resizeReminderWindow(
  win: BrowserWindow | null,
  requestedHeight: unknown,
): void {
  if (
    !win ||
    win !== reminderWindow ||
    win.isDestroyed() ||
    typeof requestedHeight !== "number" ||
    !Number.isFinite(requestedHeight)
  ) {
    return;
  }

  const bounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2),
  });
  const height = Math.min(
    Math.max(Math.ceil(requestedHeight), REMINDER_WINDOW_MIN_HEIGHT),
    Math.min(REMINDER_WINDOW_MAX_HEIGHT, display.workArea.height),
  );

  if (height === bounds.height) {
    shouldCenterNextResize = false;
    return;
  }

  // 首次按内容调整高度时保持视觉居中；之后保留用户拖动后的左上角位置。
  const y = shouldCenterNextResize
    ? Math.round(display.workArea.y + (display.workArea.height - height) / 2)
    : bounds.y;

  win.setBounds({ ...bounds, y, height });
  shouldCenterNextResize = false;
}

function loadReminderWindow(win: BrowserWindow): void {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    const rendererUrl = new URL(process.env.ELECTRON_RENDERER_URL);
    rendererUrl.searchParams.set("window", "reminders");
    void win.loadURL(rendererUrl.toString());
    return;
  }

  void win.loadFile(join(__dirname, "../renderer/index.html"), {
    query: { window: "reminders" },
  });
}

function getReminderEditorWindowBounds(): Electron.Rectangle {
  const listBounds = reminderWindow?.getBounds();
  const anchor = listBounds
    ? {
        x: Math.round(listBounds.x + listBounds.width / 2),
        y: Math.round(listBounds.y + listBounds.height / 2),
      }
    : screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(anchor);
  const width = Math.min(REMINDER_EDITOR_WINDOW_WIDTH, workArea.width);
  const height = Math.min(
    REMINDER_EDITOR_WINDOW_INITIAL_HEIGHT,
    workArea.height,
  );
  const centeredX = Math.round(workArea.x + (workArea.width - width) / 2);
  const centeredY = Math.round(workArea.y + (workArea.height - height) / 2);

  if (!listBounds) {
    return { x: centeredX, y: centeredY, width, height };
  }

  // 编辑窗默认叠放在列表窗前方，并向下错开一个层级间距，保留后方窗口轮廓。
  const x = Math.min(
    Math.max(
      Math.round(listBounds.x + (listBounds.width - width) / 2),
      workArea.x,
    ),
    workArea.x + workArea.width - width,
  );
  const y = Math.min(
    Math.max(listBounds.y + REMINDER_EDITOR_LAYER_OFFSET_Y, workArea.y),
    workArea.y + workArea.height - height,
  );

  return { x, y, width, height };
}

function loadReminderEditorWindow(
  win: BrowserWindow,
  reminderId?: string,
): void {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    const rendererUrl = new URL(process.env.ELECTRON_RENDERER_URL);
    rendererUrl.searchParams.set("window", "reminder-editor");
    if (reminderId) rendererUrl.searchParams.set("reminderId", reminderId);
    void win.loadURL(rendererUrl.toString());
    return;
  }

  void win.loadFile(join(__dirname, "../renderer/index.html"), {
    query: {
      window: "reminder-editor",
      ...(reminderId ? { reminderId } : {}),
    },
  });
}

function createReminderEditorWindow(
  reminderId: string | undefined,
  revealWhenReady: boolean,
): BrowserWindow {
  const parentWindow =
    reminderWindow && !reminderWindow.isDestroyed() ? reminderWindow : null;
  const win = new BrowserWindow({
    ...getReminderEditorWindowBounds(),
    ...(parentWindow ? { parent: parentWindow } : {}),
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    ...(!process.platform.startsWith("darwin") ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  reminderEditorWindow = win;
  reminderEditorWindowReady = false;
  shouldRevealReminderEditorWindow = revealWhenReady;
  win.once("ready-to-show", () => {
    if (win !== reminderEditorWindow || win.isDestroyed()) return;
    reminderEditorWindowReady = true;
    if (shouldRevealReminderEditorWindow) revealReminderEditorWindow(win);
  });
  win.on("blur", () => {
    if (win !== reminderEditorWindow || win.isDestroyed()) return;
    closeReminderEditorWindow(win);
  });
  win.once("closed", () => {
    if (reminderEditorWindow !== win) return;
    reminderEditorWindow = null;
    reminderEditorWindowReady = false;
    shouldRevealReminderEditorWindow = false;
  });
  loadReminderEditorWindow(win, reminderId);

  return win;
}

function revealReminderEditorWindow(win: BrowserWindow): void {
  if (win !== reminderEditorWindow || win.isDestroyed()) return;

  const currentBounds = win.getBounds();
  const targetBounds = getReminderEditorWindowBounds();
  win.setBounds({ ...targetBounds, height: currentBounds.height });
  win.setAlwaysOnTop(true, "floating");
  win.show();
  win.focus();
}

function destroyReminderEditorWindow(): void {
  const win = reminderEditorWindow;
  reminderEditorWindow = null;
  reminderEditorWindowReady = false;
  shouldRevealReminderEditorWindow = false;

  if (win && !win.isDestroyed()) win.destroy();
}

export function prewarmReminderEditorWindow(): BrowserWindow {
  if (reminderEditorWindow && !reminderEditorWindow.isDestroyed()) {
    return reminderEditorWindow;
  }

  // 列表打开后后台加载创建表单，用户点击“+”时只需显示已就绪窗口。
  return createReminderEditorWindow(undefined, false);
}

export function showReminderEditorWindow(reminderId?: string): BrowserWindow {
  if (reminderId) {
    destroyReminderEditorWindow();
    return createReminderEditorWindow(reminderId, true);
  }

  const win = prewarmReminderEditorWindow();
  shouldRevealReminderEditorWindow = true;
  if (reminderEditorWindowReady) revealReminderEditorWindow(win);

  return win;
}

export function resizeReminderEditorWindow(
  win: BrowserWindow | null,
  requestedHeight: unknown,
): void {
  if (
    !win ||
    win !== reminderEditorWindow ||
    win.isDestroyed() ||
    typeof requestedHeight !== "number" ||
    !Number.isFinite(requestedHeight)
  ) {
    return;
  }

  const bounds = win.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2),
  });
  const height = Math.min(
    Math.max(Math.ceil(requestedHeight), REMINDER_EDITOR_WINDOW_MIN_HEIGHT),
    Math.min(REMINDER_EDITOR_WINDOW_MAX_HEIGHT, display.workArea.height),
  );
  const y = Math.min(
    Math.max(bounds.y, display.workArea.y),
    display.workArea.y + display.workArea.height - height,
  );

  win.setBounds({ ...bounds, y, height });
}

export function closeReminderEditorWindow(win?: BrowserWindow | null): void {
  if (win && win !== reminderEditorWindow) return;
  const shouldPrewarm =
    reminderWindow !== null &&
    !reminderWindow.isDestroyed() &&
    reminderWindow.isVisible();

  destroyReminderEditorWindow();
  if (shouldPrewarm) prewarmReminderEditorWindow();
}

export function showReminderWindow(): BrowserWindow {
  if (reminderWindow && !reminderWindow.isDestroyed()) {
    revealReminderWindow(reminderWindow);
    return reminderWindow;
  }

  shouldCenterNextResize = true;
  const win = new BrowserWindow({
    ...getReminderWindowBounds(),
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    ...(!process.platform.startsWith("darwin") ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  reminderWindow = win;
  win.on("blur", () => {
    const editorIsVisible =
      reminderEditorWindow !== null &&
      !reminderEditorWindow.isDestroyed() &&
      reminderEditorWindow.isVisible();

    // 新建/编辑提醒是父浮窗上的子任务，切换到子浮窗时保留列表层级。
    if (!editorIsVisible) hideReminderWindow();
  });
  win.once("ready-to-show", () => revealReminderWindow(win));
  win.once("closed", () => {
    if (reminderWindow === win) {
      reminderWindow = null;
      shouldCenterNextResize = true;
    }
  });
  loadReminderWindow(win);

  return win;
}

export function hideReminderWindow(): void {
  if (reminderWindow && !reminderWindow.isDestroyed()) {
    reminderWindow.hide();
  }
}

export function destroyReminderWindow(): void {
  destroyReminderEditorWindow();
  if (reminderWindow && !reminderWindow.isDestroyed()) {
    reminderWindow.destroy();
  }
  reminderWindow = null;
  shouldCenterNextResize = true;
}

function unregisterKeys(keys: readonly string[]): void {
  for (const key of keys) {
    globalShortcut.unregister(toElectronAccelerator(key));
  }
}

function registerKeys(keys: readonly string[]): string[] {
  const failedKeys: string[] = [];

  for (const key of keys) {
    try {
      const registered = globalShortcut.register(
        toElectronAccelerator(key),
        showReminderWindow,
      );
      if (!registered) failedKeys.push(key);
    } catch {
      failedKeys.push(key);
    }
  }

  return failedKeys;
}

export function configureReminderGlobalShortcuts(
  keys: readonly string[],
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

  const previousKeys = registeredShortcutKeys;
  unregisterKeys(previousKeys);

  const failedKeys = registerKeys(normalizedKeys);
  if (failedKeys.length === 0) {
    registeredShortcutKeys = normalizedKeys;
    return { success: true, failedKeys: [] };
  }

  // 新绑定存在系统冲突时回滚，确保用户原来的全局快捷键继续可用。
  unregisterKeys(normalizedKeys.filter((key) => !failedKeys.includes(key)));
  const rollbackFailures = registerKeys(previousKeys);
  registeredShortcutKeys = previousKeys.filter(
    (key) => !rollbackFailures.includes(key),
  );

  return { success: false, failedKeys };
}

export function disposeReminderWindow(): void {
  unregisterKeys(registeredShortcutKeys);
  registeredShortcutKeys = [];
  destroyReminderWindow();
}
