import { Buffer } from "node:buffer";
import fs from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { BrowserWindow, screen } from "electron";
import iconPath from "../../resources/icon.png?asset";

const IS_MAC = process.platform === "darwin";
const MAC_NOTIFICATION_WIDTH = 440;
const MAC_NOTIFICATION_HEIGHT = 150;
const WINDOWS_NOTIFICATION_WIDTH = 420;
const WINDOWS_NOTIFICATION_HEIGHT = 214;
const NOTIFICATION_MARGIN = 24;
const AUTO_CLOSE_DELAY = 12_000;
const NOTIFICATION_ACTION_PROTOCOL = "keep-notes-notification:";

export interface AppNotificationOptions {
  title: string;
  body?: string;
  detail?: string;
  openLabel?: string;
  requireInteraction?: boolean;
}

interface AppNotificationHandle {
  show: () => Promise<void>;
}

const activeNotificationWindows = new Set<BrowserWindow>();
let cachedIconDataUrl: string | null = null;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createActionUrl(action: "confirm" | "open"): string {
  return `${NOTIFICATION_ACTION_PROTOCOL}//${action}`;
}

function resolveIconPath(): string {
  const normalizedIconPath = iconPath.split("?")[0];
  const workspaceIconPath = join(
    process.cwd(),
    normalizedIconPath.replace(/^\/+/, ""),
  );
  const fallbackIconPath = join(process.cwd(), "resources", "icon.png");
  const candidates = [normalizedIconPath, workspaceIconPath, fallbackIconPath];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return normalizedIconPath;
}

function getIconDataUrl(): string {
  if (cachedIconDataUrl) return cachedIconDataUrl;

  const iconBuffer = fs.readFileSync(resolveIconPath());
  cachedIconDataUrl = `data:image/png;base64,${iconBuffer.toString("base64")}`;
  return cachedIconDataUrl;
}

function createNotificationHtml(options: AppNotificationOptions): string {
  const title = escapeHtml(options.title);
  const body = escapeHtml(options.body || "提醒事项");
  const detail = options.detail ? escapeHtml(options.detail) : "";
  const openLabel = escapeHtml(options.openLabel || "打开");
  const openAction = createActionUrl("open");
  const confirmAction = createActionUrl("confirm");
  const platformClass = IS_MAC ? "platform-mac" : "platform-windows";
  const iconUrl = escapeHtml(getIconDataUrl());

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; navigate-to ${NOTIFICATION_ACTION_PROTOCOL};" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: transparent;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Microsoft YaHei UI", sans-serif;
      user-select: none;
    }
    body { padding: 0; }
    .notification {
      width: 100%;
      height: 100%;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      backdrop-filter: blur(30px) saturate(1.55);
    }
    .content {
      flex: 1;
      min-width: 0;
      display: grid;
      grid-template-columns: 48px 1fr;
      gap: 14px;
    }
    .app-icon {
      width: 48px;
      height: 48px;
      border-radius: 11px;
      object-fit: cover;
      flex: 0 0 auto;
    }
    .text { min-width: 0; }
    .meta {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 12px;
      min-width: 0;
      margin-bottom: 4px;
    }
    .app-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
      font-weight: 700;
      line-height: 20px;
    }
    .time {
      font-size: 13px;
      font-weight: 600;
      color: rgba(58, 66, 84, 0.74);
    }
    .window-actions {
      display: none;
      align-items: center;
      gap: 18px;
      color: rgba(255, 255, 255, 0.78);
      font-size: 18px;
      line-height: 1;
    }
    .window-action {
      color: inherit;
      text-decoration: none;
    }
    .window-action.more {
      transform: translateY(-2px);
    }
    .title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 16px;
      font-weight: 700;
      line-height: 21px;
    }
    .body {
      margin-top: 2px;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      font-size: 14px;
      line-height: 19px;
    }
    .detail {
      margin-top: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12px;
      line-height: 16px;
    }
    .actions {
      display: flex;
      gap: 8px;
    }
    .button {
      height: 31px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 16px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
      -webkit-app-region: no-drag;
    }
    .platform-mac .notification {
      border: 1px solid rgba(255, 255, 255, 0.44);
      border-radius: 20px;
      background: rgba(236, 239, 247, 0.82);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.36),
        0 10px 24px rgba(31, 41, 55, 0.18);
      color: rgba(8, 12, 20, 0.94);
    }
    .platform-mac .content {
      padding: 18px 24px 4px 24px;
    }
    .platform-mac .body {
      color: rgba(17, 24, 39, 0.82);
    }
    .platform-mac .detail {
      color: rgba(58, 66, 84, 0.68);
    }
    .platform-mac .actions {
      justify-content: flex-end;
      padding: 4px 22px 16px 86px;
    }
    .platform-mac .button {
      min-width: 86px;
      border-radius: 8px;
      border: 1px solid rgba(74, 85, 104, 0.26);
      color: rgba(17, 24, 39, 0.9);
      background: rgba(255, 255, 255, 0.2);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.38);
    }
    .platform-mac .button.primary {
      border-color: transparent;
      background: linear-gradient(180deg, #278dff 0%, #0a72e8 100%);
      color: white;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
    }
    .platform-windows .notification {
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      background: rgba(16, 24, 31, 0.96);
      box-shadow: 0 14px 28px rgba(0, 0, 0, 0.32);
      color: rgba(255, 255, 255, 0.96);
    }
    .platform-windows .content {
      grid-template-columns: 46px 1fr;
      gap: 15px;
      padding: 22px 20px 10px;
    }
    .platform-windows .app-icon {
      width: 46px;
      height: 46px;
      border-radius: 9px;
    }
    .platform-windows .app-name {
      font-size: 17px;
      font-weight: 600;
    }
    .platform-windows .time {
      display: none;
    }
    .platform-windows .window-actions {
      display: flex;
    }
    .platform-windows .title {
      margin-top: 26px;
      font-size: 24px;
      line-height: 30px;
      font-weight: 650;
    }
    .platform-windows .body {
      color: rgba(255, 255, 255, 0.72);
    }
    .platform-windows .detail {
      color: rgba(255, 255, 255, 0.54);
    }
    .platform-windows .actions {
      padding: 12px 20px 20px;
    }
    .platform-windows .button {
      flex: 1;
      height: 40px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.04);
      background: rgba(255, 255, 255, 0.12);
      color: rgba(255, 255, 255, 0.94);
      font-size: 16px;
      font-weight: 500;
    }
    .platform-windows .button.primary {
      background: rgba(255, 255, 255, 0.14);
      color: white;
    }
    @media (prefers-reduced-motion: no-preference) {
      .notification {
        animation: notification-in 160ms cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes notification-in {
        from {
          opacity: 0;
          transform: translateY(-8px) scale(0.985);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
    }
  </style>
</head>
<body class="${platformClass}">
  <section class="notification" aria-label="Keep Notes 提醒通知">
    <div class="content">
      <img class="app-icon" src="${iconUrl}" alt="" aria-hidden="true" />
      <div class="text">
        <div class="meta">
          <div class="app-name">Keep Notes</div>
          <div class="time">现在</div>
          <div class="window-actions" aria-hidden="true">
            <span class="window-action more">•••</span>
            <a class="window-action" href="${confirmAction}" aria-label="关闭">×</a>
          </div>
        </div>
        <div class="title">${title}</div>
        <div class="body">${body}</div>
        ${detail ? `<div class="detail">${detail}</div>` : ""}
      </div>
    </div>
    <div class="actions">
      <a class="button" href="${confirmAction}">确认</a>
      ${options.openLabel ? `<a class="button primary" href="${openAction}">${openLabel}</a>` : ""}
    </div>
  </section>
</body>
</html>`;
}

function createDataUrl(html: string): string {
  return `data:text/html;base64,${Buffer.from(html, "utf-8").toString("base64")}`;
}

function getNotificationBounds(): Electron.Rectangle {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { workArea } = display;
  const width = IS_MAC ? MAC_NOTIFICATION_WIDTH : WINDOWS_NOTIFICATION_WIDTH;
  const height = IS_MAC ? MAC_NOTIFICATION_HEIGHT : WINDOWS_NOTIFICATION_HEIGHT;
  const y = IS_MAC
    ? workArea.y + NOTIFICATION_MARGIN
    : workArea.y + workArea.height - height - NOTIFICATION_MARGIN;

  return {
    x: Math.round(workArea.x + workArea.width - width - NOTIFICATION_MARGIN),
    y: Math.round(y),
    width,
    height,
  };
}

export function isAppNotificationSupported(): boolean {
  return true;
}

export function createAppNotification(
  options: AppNotificationOptions,
  onOpen?: () => void,
): AppNotificationHandle {
  return {
    show: () =>
      new Promise((resolve, reject) => {
        const win = new BrowserWindow({
          ...getNotificationBounds(),
          show: false,
          frame: false,
          transparent: true,
          resizable: false,
          fullscreenable: false,
          skipTaskbar: true,
          alwaysOnTop: true,
          backgroundColor: "#00000000",
          hasShadow: false,
          ...(IS_MAC
            ? {
                vibrancy: "popover",
                visualEffectState: "active",
              }
            : {}),
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
          },
        });

        activeNotificationWindows.add(win);

        let autoCloseTimer: NodeJS.Timeout | null = null;
        let settleTimer: NodeJS.Timeout | null = null;
        let settled = false;

        const clearTimers = () => {
          if (autoCloseTimer) {
            clearTimeout(autoCloseTimer);
            autoCloseTimer = null;
          }
          if (settleTimer) {
            clearTimeout(settleTimer);
            settleTimer = null;
          }
        };

        const settle = (callback: () => void) => {
          if (settled) return;
          settled = true;
          if (settleTimer) {
            clearTimeout(settleTimer);
            settleTimer = null;
          }
          callback();
        };

        const closeWindow = () => {
          if (!win.isDestroyed()) {
            win.close();
          }
        };

        const handleAction = (url: string): boolean => {
          let action = "";
          try {
            const parsed = new URL(url);
            if (parsed.protocol !== NOTIFICATION_ACTION_PROTOCOL) return false;
            action = parsed.hostname || parsed.pathname.replace("/", "");
          } catch {
            return false;
          }

          if (action === "open") {
            onOpen?.();
            if (!options.requireInteraction) {
              closeWindow();
            }
            return true;
          }

          if (action === "confirm") {
            closeWindow();
            return true;
          }

          return false;
        };

        win.webContents.on("will-navigate", (event, url) => {
          if (handleAction(url)) {
            event.preventDefault();
          }
        });

        win.webContents.setWindowOpenHandler(({ url }) => {
          handleAction(url);
          return { action: "deny" };
        });

        win.once("ready-to-show", () => {
          if (win.isDestroyed()) return;

          win.setAlwaysOnTop(true, "floating");
          win.showInactive();

          // 非持续提醒保持类似系统通知的短暂停留，持续提醒只由用户确认关闭。
          if (!options.requireInteraction) {
            autoCloseTimer = setTimeout(closeWindow, AUTO_CLOSE_DELAY);
            autoCloseTimer.unref?.();
          }

          settle(resolve);
        });

        win.webContents.once("did-fail-load", (_event, _code, description) => {
          closeWindow();
          settle(() =>
            reject(new Error(description || "应用通知窗口加载失败")),
          );
        });

        win.once("closed", () => {
          clearTimers();
          activeNotificationWindows.delete(win);
        });

        settleTimer = setTimeout(() => {
          closeWindow();
          settle(() => reject(new Error("应用通知窗口加载超时")));
        }, 5_000);
        settleTimer.unref?.();

        void win.loadURL(createDataUrl(createNotificationHtml(options)));
      }),
  };
}
