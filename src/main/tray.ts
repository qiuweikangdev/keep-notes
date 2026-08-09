import process from "node:process";
import { Menu, Tray, app, nativeImage, screen } from "electron";
import icon from "../../resources/icon.png?asset";
import macTrayIcon from "../../resources/tray-iconTemplate.png?asset";
import { showReminderWindow } from "./reminder-window";
import { showQuickEditorWindow } from "./quick-editor-window";
import { createWindow, focusMainWindow, getMainWindow } from "./window";

const COLOR_TRAY_ICON_SIZE = 20;
const DISPLAY_CHANGE_REFRESH_DELAY_MS = 300;

let tray: Tray | null = null;
let displayChangeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let displayChangeListenersRegistered = false;

function destroyTrayInstance(): void {
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
}

export function refreshTray(): Tray {
  // macOS 会把状态栏项目留在原显示器；重新创建后由系统放到当前可用菜单栏。
  destroyTrayInstance();
  return createTray();
}

function scheduleTrayRefresh(): void {
  if (displayChangeRefreshTimer) clearTimeout(displayChangeRefreshTimer);
  displayChangeRefreshTimer = setTimeout(() => {
    displayChangeRefreshTimer = null;
    refreshTray();
  }, DISPLAY_CHANGE_REFRESH_DELAY_MS);
}

function registerDisplayChangeListeners(): void {
  if (displayChangeListenersRegistered) return;
  screen.on("display-added", scheduleTrayRefresh);
  screen.on("display-removed", scheduleTrayRefresh);
  screen.on("display-metrics-changed", scheduleTrayRefresh);
  displayChangeListenersRegistered = true;
}

function unregisterDisplayChangeListeners(): void {
  if (!displayChangeListenersRegistered) return;
  screen.off("display-added", scheduleTrayRefresh);
  screen.off("display-removed", scheduleTrayRefresh);
  screen.off("display-metrics-changed", scheduleTrayRefresh);
  displayChangeListenersRegistered = false;
}

function createTrayIcon(): Electron.NativeImage {
  if (process.platform === "darwin") {
    // macOS 使用透明背景的 Template 图标，由系统自动适配菜单栏的深浅颜色。
    const templateIcon = nativeImage.createFromPath(macTrayIcon);
    templateIcon.setTemplateImage(true);
    return templateIcon;
  }

  // Windows/Linux 保留应用主色，避免使用 macOS 的单色模板图标。
  return nativeImage.createFromPath(icon).resize({
    width: COLOR_TRAY_ICON_SIZE,
    height: COLOR_TRAY_ICON_SIZE,
  });
}

function showMainWindow(action?: string): void {
  const existingWindow = getMainWindow();
  const win = existingWindow ?? createWindow();

  focusMainWindow();
  if (!action) return;

  const sendAction = () => {
    if (!win.isDestroyed()) win.webContents.send("menu:action", action);
  };

  // 启动阶段渲染页可能仍在加载，设置动作应等待订阅完成后再发送。
  if (win.webContents.isLoadingMainFrame()) {
    win.webContents.once("did-finish-load", sendAction);
  } else {
    sendAction();
  }
}

export function createTray(): Tray {
  if (tray && !tray.isDestroyed()) return tray;

  const trayIcon = createTrayIcon();
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "打开 Keep Notes",
      click: () => showMainWindow(),
    },
    { type: "separator" },
    {
      label: "设置",
      click: () => showMainWindow("openSettings"),
    },
    {
      label: "提醒事项浮窗",
      click: () => showReminderWindow(),
    },
    {
      label: "编辑器浮窗",
      click: () => showQuickEditorWindow(),
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => app.quit(),
    },
  ]);

  tray = new Tray(trayIcon);
  tray.setToolTip("Keep Notes");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => showMainWindow());
  registerDisplayChangeListeners();
  if (!app.isPackaged) {
    setTimeout(() => {
      if (!tray || tray.isDestroyed()) return;
      console.info("Keep Notes tray initialized:", {
        bounds: tray.getBounds(),
        displays: screen.getAllDisplays().map((display) => display.bounds),
        iconEmpty: trayIcon.isEmpty(),
        iconSize: trayIcon.getSize(),
      });
    }, 1000);
  }
  return tray;
}

export function disposeTray(): void {
  if (displayChangeRefreshTimer) clearTimeout(displayChangeRefreshTimer);
  displayChangeRefreshTimer = null;
  unregisterDisplayChangeListeners();
  destroyTrayInstance();
}
