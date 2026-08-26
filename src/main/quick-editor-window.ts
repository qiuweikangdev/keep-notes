import { join } from "node:path";
import process from "node:process";
import { BrowserWindow, globalShortcut, screen } from "electron";
import { is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import { IPC_CHANNELS } from "../shared/constants";
import type {
  ApiResponse,
  QuickEditorSaveResult,
  QuickEditorWindowContent,
  ShortcutRegistrationResult,
} from "../shared/types";
import { CodeResult } from "../shared/types";
import { saveAsDialog, writeFileContent } from "./file";
import { checkAndCloseWindow, focusMainWindow, getMainWindow } from "./window";

const QUICK_EDITOR_WINDOW_WIDTH = 640;
const QUICK_EDITOR_WINDOW_HEIGHT = 420;
const QUICK_EDITOR_WINDOW_MIN_WIDTH = 80;
const QUICK_EDITOR_WINDOW_MIN_HEIGHT = 80;
const QUICK_EDITOR_COLLAPSED_HEIGHT = 38;
const QUICK_EDITOR_EXPAND_RESIZE_THRESHOLD = 100;
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
const pendingQuickEditorContents: Array<{
  mainWindow: BrowserWindow;
  content: QuickEditorWindowContent;
}> = [];
const quickEditorWindowOwners = new Map<BrowserWindow, BrowserWindow>();
const quickEditorWindowSources = new Map<
  BrowserWindow,
  NonNullable<QuickEditorWindowContent["source"]>
>();
const detachedQuickEditorSources = new Map<BrowserWindow, Set<string>>();
interface QuickEditorFileWrite {
  complete: Promise<void>;
  content: string;
  isWriting: boolean;
  resolve: () => void;
}

const quickEditorFileWrites = new Map<string, QuickEditorFileWrite>();
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

  let resolve!: () => void;
  const complete = new Promise<void>((completeWrite) => {
    resolve = completeWrite;
  });
  const state: QuickEditorFileWrite = {
    complete,
    content,
    isWriting: false,
    resolve,
  };
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
        state.resolve();
        return;
      }

      if (state.content === snapshot) {
        quickEditorFileWrites.delete(filePath);
        state.resolve();
        return;
      }
    }
  };

  void drain();
}

function normalizeQuickEditorSource(
  value: unknown,
): NonNullable<QuickEditorWindowContent["source"]> | null {
  if (!value || typeof value !== "object") return null;

  const { groupId, tabId, filePath, temporaryTitle, repositoryRoot } =
    value as Record<string, unknown>;
  if (
    typeof groupId !== "string" ||
    typeof tabId !== "string" ||
    (typeof filePath !== "string" && filePath !== null) ||
    (typeof temporaryTitle !== "string" &&
      temporaryTitle !== null &&
      temporaryTitle !== undefined) ||
    (typeof temporaryTitle === "string" && temporaryTitle.length > 255) ||
    (typeof repositoryRoot !== "string" &&
      repositoryRoot !== null &&
      repositoryRoot !== undefined)
  ) {
    return null;
  }

  return {
    groupId,
    tabId,
    filePath,
    ...(temporaryTitle === undefined ? {} : { temporaryTitle }),
    ...(repositoryRoot === undefined ? {} : { repositoryRoot }),
  };
}

function normalizeQuickEditorWindowContent(
  value: unknown,
): QuickEditorWindowContent | null {
  if (!value || typeof value !== "object") return null;

  const { content, source } = value as Record<string, unknown>;
  if (typeof content !== "string") return null;
  if (source === null) return { content, source: null };
  const normalizedSource = normalizeQuickEditorSource(source);
  if (!normalizedSource) return null;

  return { content, source: normalizedSource };
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

function getQuickEditorSourceKey(
  source: NonNullable<QuickEditorWindowContent["source"]>,
): string {
  return JSON.stringify([source.groupId, source.tabId, source.filePath]);
}

function getQuickEditorMainWindow(win: BrowserWindow): BrowserWindow | null {
  const owner = quickEditorWindowOwners.get(win);
  if (owner) return owner.isDestroyed() ? null : owner;

  const fallback = getMainWindow();
  return fallback && !fallback.isDestroyed() ? fallback : null;
}

function resolveQuickEditorMainWindow(
  sourceWindow?: BrowserWindow | null,
): BrowserWindow | null {
  if (sourceWindow) {
    const owner = quickEditorWindowOwners.get(sourceWindow);
    if (owner) return owner.isDestroyed() ? null : owner;
    if (!sourceWindow.isDestroyed()) return sourceWindow;
  }

  const fallback = getMainWindow();
  return fallback && !fallback.isDestroyed() ? fallback : null;
}

function getDetachedSources(
  mainWindow: BrowserWindow,
  create = false,
): Set<string> | undefined {
  const sources = detachedQuickEditorSources.get(mainWindow);
  if (sources || !create) return sources;

  const nextSources = new Set<string>();
  detachedQuickEditorSources.set(mainWindow, nextSources);
  return nextSources;
}

function clearDetachedQuickEditorSource(
  mainWindow: BrowserWindow | null,
  source: NonNullable<QuickEditorWindowContent["source"]>,
): void {
  if (!mainWindow) return;
  const sources = getDetachedSources(mainWindow);
  sources?.delete(getQuickEditorSourceKey(source));
  if (sources?.size === 0) detachedQuickEditorSources.delete(mainWindow);
}

function isDetachedQuickEditorSource(
  mainWindow: BrowserWindow | null,
  source: NonNullable<QuickEditorWindowContent["source"]>,
): boolean {
  return (
    mainWindow !== null &&
    getDetachedSources(mainWindow)?.has(getQuickEditorSourceKey(source)) ===
      true
  );
}

function getKnownQuickEditorSource(
  source: NonNullable<QuickEditorWindowContent["source"]>,
  mainWindow?: BrowserWindow | null,
): NonNullable<QuickEditorWindowContent["source"]> | undefined {
  for (const [win, knownSource] of quickEditorWindowSources) {
    if (mainWindow && getQuickEditorMainWindow(win) !== mainWindow) {
      continue;
    }
    if (hasSameQuickEditorSource(knownSource, source)) return knownSource;
  }
  return undefined;
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

export function showQuickEditorWindow(
  sourceWindow?: BrowserWindow | null,
): BrowserWindow {
  if (quickEditorWindow && !quickEditorWindow.isDestroyed()) {
    revealQuickEditorWindow(quickEditorWindow);
    return quickEditorWindow;
  }

  return createQuickEditorWindow(null, sourceWindow);
}

export function createQuickEditorWindow(
  initialValue: unknown = null,
  sourceWindow?: BrowserWindow | null,
): BrowserWindow {
  const initialContent = normalizeQuickEditorWindowContent(initialValue);
  const mainWindow = resolveQuickEditorMainWindow(sourceWindow);
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
    hasShadow: process.platform !== "darwin",
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
  if (mainWindow) quickEditorWindowOwners.set(win, mainWindow);
  const collapseState = createQuickEditorCollapseState(bounds.height);
  quickEditorCollapseStates.set(win, collapseState);
  if (initialContent?.source) {
    quickEditorWindowSources.set(win, initialContent.source);
    // 用户再次从主标签显式创建浮窗时，恢复这条来源的双向实时同步。
    clearDetachedQuickEditorSource(mainWindow, initialContent.source);
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

    // 已关联真实文件的浮窗内容会实时回写；未命名标签仍需在关闭时确认保存。
    if (quickEditorWindowSources.get(win)?.filePath) return;

    event.preventDefault();
    if (closingQuickEditorWindows.has(win)) return;

    // 关闭入口统一经过脏状态检查，避免标题栏按钮和系统快捷键产生不同行为。
    closingQuickEditorWindows.add(win);
    void checkAndCloseWindow(win, (filePath, content) => {
      associateQuickEditorFile(win, filePath, content);
    }).finally(() => {
      if (!win.isDestroyed()) {
        closingQuickEditorWindows.delete(win);
      }
    });
  });

  win.on("will-resize", (_event, newBounds) => {
    if (!collapseState.collapsed || collapseState.transition) return;
    if (newBounds.height === win.getBounds().height) return;
    if (newBounds.height <= QUICK_EDITOR_EXPAND_RESIZE_THRESHOLD) return;

    // 高度超过阈值后解除折叠，标题栏操作由渲染层按实际高度独立切换。
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
    quickEditorWindowOwners.delete(win);
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

/**
 * 保存成功后由主进程更新浮窗来源，确保后续编辑继续写入新文件，
 * 并把未命名标签同步升级为真实文件标签。
 */
function associateQuickEditorFile(
  win: BrowserWindow,
  filePath: string,
  content: string,
): NonNullable<QuickEditorWindowContent["source"]> {
  const previousSource = quickEditorWindowSources.get(win);
  const savedSource: NonNullable<QuickEditorWindowContent["source"]> = {
    groupId: previousSource?.groupId ?? "quick-editor",
    tabId: previousSource?.tabId ?? `window-${win.webContents.id}`,
    filePath,
    temporaryTitle: null,
    repositoryRoot: null,
  };
  const savedContent: QuickEditorWindowContent = {
    content,
    source: savedSource,
  };
  const mainWindow = getQuickEditorMainWindow(win);

  for (const candidate of quickEditorWindows) {
    const candidateSource = quickEditorWindowSources.get(candidate);
    const candidateMainWindow = getQuickEditorMainWindow(candidate);
    const isSameDraft =
      candidate === win ||
      (previousSource &&
        candidateSource &&
        candidateMainWindow === mainWindow &&
        hasSameQuickEditorSource(candidateSource, previousSource));
    if (!isSameDraft) continue;

    quickEditorWindowSources.set(candidate, savedSource);
    if (candidate !== win && !candidate.isDestroyed()) {
      candidate.webContents.send(
        IPC_CHANNELS.QUICK_EDITOR.CONTENT_UPDATED,
        savedContent,
      );
    }
  }

  if (!previousSource) return savedSource;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(
      IPC_CHANNELS.QUICK_EDITOR.CONTENT_UPDATED,
      savedContent,
    );
  }
  return savedSource;
}

export async function saveQuickEditorContent(
  value: unknown,
  win: BrowserWindow | null = quickEditorWindow,
): Promise<ApiResponse<QuickEditorSaveResult>> {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    !win ||
    !quickEditorWindows.has(win) ||
    win.isDestroyed()
  ) {
    return { code: CodeResult.Fail, message: "Invalid quick editor content" };
  }

  const source = quickEditorWindowSources.get(win);
  if (source?.filePath) {
    return {
      code: CodeResult.Fail,
      message: "Quick editor is already linked to a file",
    };
  }

  const result = await saveAsDialog(
    win,
    value,
    source?.temporaryTitle ?? undefined,
  );
  if (result.code === CodeResult.Success && result.data) {
    const savedSource = associateQuickEditorFile(
      win,
      result.data.filePath,
      value,
    );
    return {
      code: CodeResult.Success,
      data: { filePath: result.data.filePath, source: savedSource },
    };
  }
  return { code: result.code, message: result.message };
}

export function returnToMainWindowFromQuickEditor(
  value: unknown,
  win: BrowserWindow | null = quickEditorWindow,
): void {
  const content = normalizeQuickEditorWindowContent(value);
  if (!content || !win || !quickEditorWindows.has(win) || win.isDestroyed()) {
    return;
  }

  const mainWindow = getQuickEditorMainWindow(win);
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // 回传内容绑定到创建浮窗的主窗口，避免其他主窗口获得焦点时误消费。
  pendingQuickEditorContents.push({ mainWindow, content });
  mainWindow.webContents.send(IPC_CHANNELS.QUICK_EDITOR.IMPORT_CONTENT);
  win.destroy();
  focusMainWindow(mainWindow);
}

/** 在关联的标签页与浮窗之间广播实时编辑快照。 */
export function syncQuickEditorContent(
  value: unknown,
  sender: BrowserWindow | null = null,
): void {
  const incomingContent = normalizeQuickEditorWindowContent(value);
  if (!incomingContent?.source) return;

  const senderIsQuickEditor = sender !== null && quickEditorWindows.has(sender);
  const mainWindow = senderIsQuickEditor
    ? getQuickEditorMainWindow(sender!)
    : sender;
  const source = senderIsQuickEditor
    ? quickEditorWindowSources.get(sender!)
    : (getKnownQuickEditorSource(incomingContent.source, mainWindow) ??
      incomingContent.source);
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

    if (
      !isDetachedQuickEditorSource(mainWindow, source) &&
      mainWindow &&
      !mainWindow.isDestroyed()
    ) {
      mainWindow.webContents.send(
        IPC_CHANNELS.QUICK_EDITOR.CONTENT_UPDATED,
        content,
      );
    }
  } else {
    // 主标签再次产生编辑时，说明该来源已经重新打开，可恢复浮窗到主窗口的同步。
    clearDetachedQuickEditorSource(mainWindow, source);
  }

  for (const win of quickEditorWindows) {
    const windowSource = quickEditorWindowSources.get(win);
    if (
      win === sender ||
      win.isDestroyed() ||
      !windowSource ||
      (senderIsQuickEditor
        ? !mainWindow || getQuickEditorMainWindow(win) !== mainWindow
        : mainWindow && getQuickEditorMainWindow(win) !== mainWindow) ||
      !hasSameQuickEditorSource(windowSource, source)
    ) {
      continue;
    }
    win.webContents.send(IPC_CHANNELS.QUICK_EDITOR.CONTENT_UPDATED, content);
  }
}

/** 标签关闭后停止把关联浮窗的实时输入推回主窗口，避免自动重建标签。 */
export function detachQuickEditorSource(
  value: unknown,
  sourceWindow?: BrowserWindow | null,
): void {
  const source = normalizeQuickEditorSource(value);
  if (!source) return;

  const mainWindow = resolveQuickEditorMainWindow(sourceWindow);
  if (!mainWindow) return;
  if (!getKnownQuickEditorSource(source, mainWindow)) return;
  getDetachedSources(mainWindow, true)?.add(getQuickEditorSourceKey(source));
}

/** 等待关联浮窗的最新快照落盘，避免 Git 回滚与旧写入任务交错。 */
export async function flushQuickEditorContent(source: unknown): Promise<void> {
  const normalizedSource = normalizeQuickEditorSource(source);
  if (!normalizedSource?.filePath) return;
  await quickEditorFileWrites.get(normalizedSource.filePath)?.complete;
}

/** 将浮窗文件操作请求转交给主窗口，主窗口负责复用完整的编辑器与 Git 状态。 */
/** 回滚完成后销毁同一来源的浮窗，避免旧快照重新写回已回滚文件。 */
export function consumePendingQuickEditorContent(
  mainWindow?: BrowserWindow | null,
): QuickEditorWindowContent | null {
  const pendingIndex = mainWindow
    ? pendingQuickEditorContents.findIndex(
        (pending) => pending.mainWindow === mainWindow,
      )
    : 0;
  if (pendingIndex < 0) return null;

  return pendingQuickEditorContents.splice(pendingIndex, 1)[0]?.content ?? null;
}

export function destroyQuickEditorWindow(): void {
  const windows = [...quickEditorWindows];
  windows.forEach(clearQuickEditorCollapseState);
  quickEditorWindows.clear();
  quickEditorWindowOwners.clear();
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
  detachedQuickEditorSources.clear();
  destroyQuickEditorWindow();
}
