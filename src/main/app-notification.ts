import { Buffer } from "node:buffer";
import fs from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { BrowserWindow, screen } from "electron";
import { APP_NAME } from "../shared/constants";
import type {
  DesktopChannelConfig,
  NotificationSizePreset,
} from "../shared/types";
import iconPath from "../../resources/icon.png?asset";

const IS_MAC = process.platform === "darwin";
const MAC_NOTIFICATION_MARGIN = 24;
const WINDOWS_NOTIFICATION_MARGIN = 8;
const AUTO_CLOSE_DELAY = 12_000;
const NOTIFICATION_ACTION_PROTOCOL = "keep-notes-notification:";
const DEFAULT_APP_NAME_FONT_SIZE = 18;
const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const NOTIFICATION_SIZE_PRESETS: Record<
  "mac" | "windows",
  Record<NotificationSizePreset, { width: number; height: number }>
> = {
  windows: {
    small: { width: 360, height: 190 },
    medium: { width: 384, height: 188 },
    large: { width: 440, height: 220 },
  },
  mac: {
    small: { width: 336, height: 156 },
    medium: { width: 356, height: 144 },
    large: { width: 400, height: 168 },
  },
};

type NotificationVisualOptions = Pick<
  DesktopChannelConfig,
  | "showAppIcon"
  | "useCustomAppearance"
  | "appNameFontSize"
  | "appNameColor"
  | "titleFontSize"
  | "titleColor"
  | "showActions"
  | "backgroundColor"
  | "sizePreset"
>;

export interface AppNotificationOptions extends Partial<NotificationVisualOptions> {
  appName?: string;
  title: string;
  body?: string;
  detail?: string;
  openLabel?: string;
  requireInteraction?: boolean;
}

interface AppNotificationHandle {
  show: () => Promise<void>;
}

interface NormalizedNotificationVisualOptions {
  showAppIcon: boolean;
  appNameFontSize: number;
  appNameLineHeight: number;
  appNameColor: string;
  titleFontSize: number;
  titleLineHeight: number;
  titleColor: string;
  showActions: boolean;
  backgroundColor?: string;
  sizePreset: NotificationSizePreset;
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

function createActionUrl(action: "close" | "open" | "snooze"): string {
  return `${NOTIFICATION_ACTION_PROTOCOL}//${action}`;
}

function normalizeHexColor(value: string | undefined): string | undefined {
  return value && HEX_COLOR_PATTERN.test(value) ? value : undefined;
}

function normalizeSizePreset(
  sizePreset: NotificationSizePreset | undefined,
): NotificationSizePreset {
  return sizePreset === "small" || sizePreset === "large"
    ? sizePreset
    : "medium";
}

function normalizeNotificationVisualOptions(
  options: AppNotificationOptions,
): NormalizedNotificationVisualOptions {
  const useCustomAppearance = options.useCustomAppearance !== false;
  const rawFontSize =
    useCustomAppearance &&
    typeof options.appNameFontSize === "number" &&
    Number.isFinite(options.appNameFontSize)
      ? options.appNameFontSize
      : DEFAULT_APP_NAME_FONT_SIZE;
  const appNameFontSize = Math.min(28, Math.max(12, rawFontSize));
  const rawTitleFontSize =
    useCustomAppearance &&
    typeof options.titleFontSize === "number" &&
    Number.isFinite(options.titleFontSize)
      ? options.titleFontSize
      : 21;
  const titleFontSize = Math.min(30, Math.max(14, rawTitleFontSize));

  // 先把可视配置收敛到安全值，避免用户输入直接进入 CSS 或窗口尺寸计算。
  return {
    showAppIcon: options.showAppIcon !== false,
    appNameFontSize,
    appNameLineHeight:
      IS_MAC && appNameFontSize === DEFAULT_APP_NAME_FONT_SIZE
        ? DEFAULT_APP_NAME_FONT_SIZE
        : Math.round(appNameFontSize * 1.2),
    appNameColor: useCustomAppearance
      ? (normalizeHexColor(options.appNameColor) ?? "currentColor")
      : "currentColor",
    titleFontSize,
    titleLineHeight: IS_MAC
      ? Math.round(titleFontSize * 1.31)
      : Math.round(titleFontSize * 1.29),
    titleColor: useCustomAppearance
      ? (normalizeHexColor(options.titleColor) ?? "currentColor")
      : "currentColor",
    showActions: options.showActions !== false,
    backgroundColor: useCustomAppearance
      ? normalizeHexColor(options.backgroundColor)
      : undefined,
    sizePreset: normalizeSizePreset(
      useCustomAppearance ? options.sizePreset : undefined,
    ),
  };
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
  const visualOptions = normalizeNotificationVisualOptions(options);
  const appName = escapeHtml(options.appName?.trim() || APP_NAME);
  const title = escapeHtml(options.title);
  const body = options.body?.trim() ? escapeHtml(options.body) : "";
  const detail = options.detail ? escapeHtml(options.detail) : "";
  const confirmLabel = "稍后提醒";
  const openLabel = escapeHtml(options.openLabel || "查看详情");
  const openAction = createActionUrl("open");
  const closeAction = createActionUrl("close");
  const snoozeAction = createActionUrl("snooze");
  const platformClass = IS_MAC ? "platform-mac" : "platform-windows";
  const iconMarkup = visualOptions.showAppIcon
    ? `<img class="app-icon" src="${escapeHtml(getIconDataUrl())}" alt="" aria-hidden="true" />`
    : "";
  const contentStyle = visualOptions.showAppIcon
    ? ""
    : ' style="grid-template-columns: 1fr;"';
  const notificationStyles = [
    `--app-name-font-size: ${visualOptions.appNameFontSize}px;`,
    `--app-name-line-height: ${visualOptions.appNameLineHeight}px;`,
    `--app-name-color: ${visualOptions.appNameColor};`,
    `--title-font-size: ${visualOptions.titleFontSize}px;`,
    `--title-line-height: ${visualOptions.titleLineHeight}px;`,
    `--title-color: ${visualOptions.titleColor};`,
    visualOptions.backgroundColor
      ? `--notification-bg: ${visualOptions.backgroundColor};`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const actionsMarkup = visualOptions.showActions
    ? `<div class="actions">
      <a class="button" href="${snoozeAction}"><svg class="clock-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.6" stroke="currentColor" stroke-width="1.8" /><path d="M12 7.2V12l3.4 2.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /><circle cx="12" cy="12" r="1.15" fill="currentColor" /></svg><span>${confirmLabel}</span></a>
      ${options.openLabel ? `<a class="button primary" href="${openAction}">${openLabel}</a>` : ""}
    </div>`
    : "";

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
      backdrop-filter: blur(34px) saturate(1.58);
    }
    .content {
      flex: 1;
      min-width: 0;
      display: grid;
      grid-template-columns: 72px 1fr;
      gap: 22px;
    }
    .app-icon {
      width: 72px;
      height: 72px;
      border-radius: 17px;
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
      margin-bottom: 10px;
    }
    .app-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--app-name-color);
      font-size: var(--app-name-font-size);
      font-weight: 700;
      line-height: var(--app-name-line-height);
    }
    .time {
      font-size: 24px;
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
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: inherit;
      text-decoration: none;
      -webkit-app-region: no-drag;
    }
    .window-action.more {
      transform: translateY(-2px);
    }
    .close-icon {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      stroke-width: 2.4;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--title-font-size);
      font-weight: 750;
      line-height: var(--title-line-height);
      color: var(--title-color);
    }
    .body {
      margin-top: 2px;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      font-size: 26px;
      line-height: 34px;
    }
    .detail {
      margin-top: 7px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 22px;
      line-height: 28px;
    }
    .actions {
      display: flex;
      gap: 18px;
    }
    .button {
      height: 52px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 0 28px;
      font-size: 26px;
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
      -webkit-app-region: no-drag;
    }
    .clock-icon {
      display: none;
      width: 30px;
      height: 30px;
      flex: 0 0 auto;
      opacity: 0.92;
      overflow: visible;
      shape-rendering: geometricPrecision;
    }
    .platform-mac .notification {
      --notification-bg:
        radial-gradient(circle at 15% 0%, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0) 38%),
        linear-gradient(135deg, rgba(252, 239, 247, 0.88) 0%, rgba(241, 229, 250, 0.82) 48%, rgba(226, 217, 248, 0.78) 100%);
      border: 1px solid rgba(255, 255, 255, 0.5);
      border-radius: 16px;
      background: var(--notification-bg);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.52),
        0 18px 40px rgba(54, 43, 72, 0.24);
      color: rgba(8, 12, 20, 0.94);
    }
    .platform-mac .content {
      grid-template-columns: 36px 1fr;
      gap: 12px;
      padding: 8px 18px 0 18px;
    }
    .platform-mac .app-icon {
      width: 36px;
      height: 36px;
      border-radius: 8px;
    }
    .platform-mac .meta {
      min-height: 36px;
      margin-bottom: 1px;
    }
    .platform-mac .app-name {
      font-size: var(--app-name-font-size);
      line-height: var(--app-name-line-height);
      font-weight: 700;
      transform: translateY(-2px);
    }
    .platform-mac .time {
      display: none;
    }
    .platform-mac .window-actions {
      display: flex;
      color: rgba(58, 66, 84, 0.74);
      font-size: 20px;
    }
    .platform-mac .title {
      font-size: var(--title-font-size);
      line-height: var(--title-line-height);
      font-weight: 750;
    }
    .platform-mac .body {
      margin-top: 0;
      font-size: 14px;
      line-height: 18px;
    }
    .platform-mac .body {
      color: rgba(17, 24, 39, 0.82);
    }
    .platform-mac .detail {
      margin-top: 2px;
      font-size: 11px;
      line-height: 14px;
      color: rgba(58, 66, 84, 0.68);
    }
    .platform-mac .actions {
      gap: 8px;
      justify-content: flex-end;
      padding: 4px 16px 10px 66px;
    }
    .platform-mac .button {
      min-width: 78px;
      height: 26px;
      border-radius: 7px;
      border: 1px solid rgba(79, 85, 105, 0.24);
      color: rgba(17, 24, 39, 0.9);
      background: rgba(255, 255, 255, 0.22);
      padding: 0 13px;
      font-size: 14px;
      font-weight: 600;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.42),
        0 1px 2px rgba(31, 41, 55, 0.08);
    }
    .platform-mac .button.primary {
      border-color: transparent;
      background: linear-gradient(180deg, #2f95ff 0%, #086fe8 100%);
      color: white;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
    }
    .platform-windows .notification {
      --notification-bg:
        radial-gradient(circle at 18% 0%, rgba(69, 82, 96, 0.28), rgba(69, 82, 96, 0) 34%),
        linear-gradient(135deg, rgba(25, 33, 41, 0.98) 0%, rgba(13, 20, 28, 0.98) 100%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      background: var(--notification-bg);
      box-shadow: 0 14px 28px rgba(0, 0, 0, 0.32);
      color: rgba(255, 255, 255, 0.96);
    }
    .platform-windows .content {
      grid-template-columns: 34px 1fr;
      gap: 12px;
      padding: 18px 18px 0;
    }
    .platform-windows .app-icon {
      width: 34px;
      height: 34px;
      border-radius: 8px;
    }
    .platform-windows .meta {
      min-height: 34px;
      margin-bottom: 0;
    }
    .platform-windows .app-name {
      font-size: var(--app-name-font-size);
      line-height: var(--app-name-line-height);
      font-weight: 600;
      transform: translateY(-2px);
    }
    .platform-windows .time {
      display: none;
    }
    .platform-windows .window-actions {
      display: flex;
      padding-top: 0;
      font-size: 20px;
    }
    .platform-windows .title {
      margin-top: 14px;
      font-size: var(--title-font-size);
      line-height: var(--title-line-height);
      font-weight: 650;
    }
    .platform-windows .body {
      margin-top: 2px;
      font-size: 15px;
      line-height: 20px;
      color: rgba(255, 255, 255, 0.72);
    }
    .platform-windows .detail {
      margin-top: 6px;
      font-size: 13px;
      line-height: 18px;
      color: rgba(255, 255, 255, 0.54);
    }
    .platform-windows .actions {
      gap: 10px;
      padding: 8px 18px 14px;
    }
    .platform-windows .button {
      flex: 1;
      height: 36px;
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.04);
      background: rgba(255, 255, 255, 0.12);
      color: rgba(255, 255, 255, 0.94);
      font-size: 15px;
      font-weight: 500;
    }
    .platform-windows .button.primary {
      background: rgba(255, 255, 255, 0.14);
      color: white;
    }
    .platform-windows .clock-icon {
      display: block;
      width: 18px;
      height: 18px;
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
  <section class="notification" aria-label="${appName} 提醒通知" style="${notificationStyles}">
    <div class="content"${contentStyle}>
      ${iconMarkup}
      <div class="text">
        <div class="meta">
          <div class="app-name">${appName}</div>
          <div class="window-actions" aria-hidden="true">
            <a class="window-action" href="${closeAction}" aria-label="关闭"><svg class="close-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6 6 18" /><path d="M6 6l12 12" /></svg></a>
          </div>
        </div>
        <div class="title">${title}</div>
        ${body ? `<div class="body">${body}</div>` : ""}
        ${detail ? `<div class="detail">${detail}</div>` : ""}
      </div>
    </div>
    ${actionsMarkup}
  </section>
</body>
</html>`;
}

function createDataUrl(html: string): string {
  return `data:text/html;base64,${Buffer.from(html, "utf-8").toString("base64")}`;
}

function getNotificationBounds(
  options: AppNotificationOptions,
): Electron.Rectangle {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { workArea } = display;
  const sizePreset =
    options.useCustomAppearance === false ? undefined : options.sizePreset;
  const { width, height } =
    NOTIFICATION_SIZE_PRESETS[IS_MAC ? "mac" : "windows"][
      normalizeSizePreset(sizePreset)
    ];
  const margin = IS_MAC ? MAC_NOTIFICATION_MARGIN : WINDOWS_NOTIFICATION_MARGIN;
  const y = IS_MAC
    ? workArea.y + margin
    : workArea.y + workArea.height - height - margin;

  return {
    x: Math.round(workArea.x + workArea.width - width - margin),
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
  onSnooze?: () => void,
): AppNotificationHandle {
  return {
    show: () =>
      new Promise((resolve, reject) => {
        const win = new BrowserWindow({
          ...getNotificationBounds(options),
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
            closeWindow();
            return true;
          }

          if (action === "snooze") {
            onSnooze?.();
            closeWindow();
            return true;
          }

          if (action === "close") {
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
