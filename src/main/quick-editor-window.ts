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
import { writeFileContent } from "./file";
import { checkAndCloseWindow, focusMainWindow, getMainWindow } from "./window";

const QUICK_EDITOR_WINDOW_WIDTH = 640;
const QUICK_EDITOR_WINDOW_HEIGHT = 420;
const QUICK_EDITOR_WINDOW_MIN_WIDTH = 80;
const QUICK_EDITOR_WINDOW_MIN_HEIGHT = 80;
const QUICK_EDITOR_COLLAPSED_HEIGHT = 38;
const QUICK_EDITOR_COLLAPSE_DURATION = 160;
const QUICK_EDITOR_COLLAPSE_FRAME_INTERVAL = 16;
const MAX_GLOBAL_SHORTCUTS = 4;

interface QuickEditorCollapseState {
  cancelAnimation: (() => void) | null;
  collapsed: boolean;
  expandedHeight: number;
  transition: Promise<boolean> | null;
}

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
const quickEditorFileWrites = new Map<
  string,
  { content: string; isWriting: boolean }
>();
const quickEditorCollapseStates = new Map<
  BrowserWindow,
  QuickEditorCollapseState
>();

/** 串行写入同一来源文件，并在写入期间只保留最新的浮窗快照。 */
function persistQuickEditorFile(filePath: string, content: string): void {
  const current = quickEditorFileWrites.get(filePath);
  if (current) {
    current.content = content;
    return;
  }

  const state = { content, isWriting: false };
  quickEditorFileWrites.set(filePath, state);

  const drain = async () => {
    if (state.isWriting) return;
    state.isWriting = true;

    while (quickEditorFileWrites.get(filePath) === state) {
      const snapshot = state.content;
      try {
        await writeFileContent(filePath, snapshot);
      } catch (error) {
        console.error("Failed to persist quick editor content:", error);
        quickEditorFileWrites.delete(filePath);
        return;
      }

      if (state.content === snapshot) {
        quickEditorFileWrites.delete(filePath);
        return;
      }
    }
  };

  void drain();
}

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

function createQuickEditorCollapseState(
  expandedHeight: number,
): QuickEditorCollapseState {
  return {
    cancelAnimation: null,
    collapsed: false,
    expandedHeight,
    transition: null,
  };
}

function clearQuickEditorCollapseState(win: BrowserWindow): void {
  const state = quickEditorCollapseStates.get(win);
  state?.cancelAnimation?.();
  quickEditorCollapseStates.delete(win);
}

/** 同步主进程折叠状态，并通知浮窗渲染层更新标题栏与编辑区域。 */
function publishQuickEditorCollapsedState(
  win: BrowserWindow,
  state: QuickEditorCollapseState,
  collapsed: boolean,
): void {
  state.collapsed = collapsed;
  if (!win.isDestroyed()) {
    win.webContents.send(
      IPC_CHANNELS.QUICK_EDITOR.COLLAPSED_CHANGED,
      collapsed,
    );
  }
}

function animateQuickEditorHeight(
  win: BrowserWindow,
  state: QuickEditorCollapseState,
  targetHeight: number,
  reduceMotion: boolean,
): Promise<boolean> {
  const startHeight = win.getBounds().height;
  if (reduceMotion || startHeight === targetHeight) {
    const bounds = win.getBounds();
    win.setBounds({ ...bounds, height: targetHeight });
    return Promise.resolve(true);
  }

  const startedAt = Date.now();

  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    const finish = (completed: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      state.cancelAnimation = null;
      resolve(completed);
    };

    const step = () => {
      if (win.isDestroyed()) {
        finish(false);
        return;
      }

      const elapsed = Math.max(Date.now() - startedAt, 0);
      const progress = Math.min(elapsed / QUICK_EDITOR_COLLAPSE_DURATION, 1);
      const easedProgress = 1 - (1 - progress) ** 3;
      const height = Math.round(
        startHeight + (targetHeight - startHeight) * easedProgress,
      );
      const bounds = win.getBounds();
      win.setBounds({ ...bounds, height });

      if (progress === 1) {
        finish(true);
        return;
      }
      timer = setTimeout(step, QUICK_EDITOR_COLLAPSE_FRAME_INTERVAL);
    };

    state.cancelAnimation = () => finish(false);
    timer = setTimeout(step, QUICK_EDITOR_COLLAPSE_FRAME_INTERVAL);
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
  const collapseState = createQuickEditorCollapseState(bounds.height);
  quickEditorCollapseStates.set(win, collapseState);
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

  win.on("will-resize", (_event, newBounds) => {
    if (!collapseState.collapsed || collapseState.transition) return;
    if (newBounds.height === win.getBounds().height) return;

    // 折叠态下纵向拖动即视为展开，横向调整宽度仍保持折叠。
    collapseState.expandedHeight = Math.max(
      newBounds.height,
      QUICK_EDITOR_WINDOW_MIN_HEIGHT,
    );
    win.setMinimumSize(
      QUICK_EDITOR_WINDOW_MIN_WIDTH,
      QUICK_EDITOR_WINDOW_MIN_HEIGHT,
    );
    publishQuickEditorCollapsedState(win, collapseState, false);
  });

  win.once("closed", () => {
    quickEditorWindows.delete(win);
    quickEditorWindowSources.delete(win);
    closingQuickEditorWindows.delete(win);
    clearQuickEditorCollapseState(win);
    if (quickEditorWindow === win) {
      quickEditorWindow =
        [...quickEditorWindows].find((window) => !window.isDestroyed()) ?? null;
    }
  });

  loadQuickEditorWindow(win);
  return win;
}

export function getQuickEditorCollapsed(win: BrowserWindow | null): boolean {
  if (!win || win.isDestroyed() || !quickEditorWindows.has(win)) return false;
  return quickEditorCollapseStates.get(win)?.collapsed ?? false;
}

export function setQuickEditorCollapsed(
  win: BrowserWindow | null,
  collapsed: boolean,
  reduceMotion = false,
): Promise<boolean> {
  if (!win || win.isDestroyed() || !quickEditorWindows.has(win)) {
    return Promise.resolve(false);
  }

  const state = quickEditorCollapseStates.get(win);
  if (!state) return Promise.resolve(false);
  if (state.transition) return state.transition;
  if (state.collapsed === collapsed) return Promise.resolve(collapsed);

  const currentBounds = win.getBounds();
  if (collapsed) {
    state.expandedHeight = Math.max(
      currentBounds.height,
      QUICK_EDITOR_WINDOW_MIN_HEIGHT,
    );
    win.setMinimumSize(
      QUICK_EDITOR_WINDOW_MIN_WIDTH,
      QUICK_EDITOR_COLLAPSED_HEIGHT,
    );
  }

  const targetHeight = collapsed
    ? QUICK_EDITOR_COLLAPSED_HEIGHT
    : Math.max(state.expandedHeight, QUICK_EDITOR_WINDOW_MIN_HEIGHT);

  // 原生窗口尺寸只能由主进程逐帧调整，同时保持当前顶部和水平边界不变。
  const transition = animateQuickEditorHeight(
    win,
    state,
    targetHeight,
    reduceMotion,
  ).then((completed) => {
    if (
      !completed ||
      win.isDestroyed() ||
      quickEditorCollapseStates.get(win) !== state
    ) {
      return false;
    }

    publishQuickEditorCollapsedState(win, state, collapsed);
    if (!collapsed) {
      win.setMinimumSize(
        QUICK_EDITOR_WINDOW_MIN_WIDTH,
        QUICK_EDITOR_WINDOW_MIN_HEIGHT,
      );
    }
    return collapsed;
  });

  state.transition = transition.finally(() => {
    if (quickEditorCollapseStates.get(win) === state) {
      state.transition = null;
    }
  });
  return state.transition;
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
    if (source.filePath) {
      // 来源路径取自主进程创建浮窗时保存的关联关系，不信任渲染进程临时传入的路径。
      persistQuickEditorFile(source.filePath, content.content);
    }

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
  windows.forEach(clearQuickEditorCollapseState);
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
