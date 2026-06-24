import { Notification } from "electron";

interface DesktopNotificationOptions {
  title: string;
  body?: string;
}

interface DesktopNotificationHandle {
  show: () => Promise<void>;
}

const activeNotifications = new Set<Notification>();

function retainNotification(notification: Notification): () => void {
  activeNotifications.add(notification);

  let releaseTimer: NodeJS.Timeout | null = null;
  const release = () => {
    if (releaseTimer) {
      clearTimeout(releaseTimer);
      releaseTimer = null;
    }
    activeNotifications.delete(notification);
  };

  notification.once("close", release);

  // macOS 通知展示是异步的，短暂保留引用，避免对象过早释放导致系统没有展示。
  releaseTimer = setTimeout(release, 60_000);
  releaseTimer.unref?.();

  return release;
}

export function isDesktopNotificationSupported(): boolean {
  return Notification.isSupported();
}

export function createDesktopNotification(
  options: DesktopNotificationOptions,
  onClick?: () => void,
): DesktopNotificationHandle {
  const notification = new Notification(options);

  if (onClick) {
    notification.on("click", onClick);
  }

  return {
    show: () => {
      const release = retainNotification(notification);

      return new Promise((resolve, reject) => {
        let settled = false;
        let settleTimer: NodeJS.Timeout | null = null;

        const settle = (callback: () => void) => {
          if (settled) return;
          settled = true;
          if (settleTimer) {
            clearTimeout(settleTimer);
            settleTimer = null;
          }
          callback();
        };

        notification.once("show", () => {
          settle(resolve);
        });

        notification.once("failed", (_event, error) => {
          release();
          settle(() => {
            reject(new Error(error || "桌面通知发送失败"));
          });
        });

        // 如果底层系统既没有确认展示也没有返回失败，避免测试按钮一直等待。
        settleTimer = setTimeout(() => {
          release();
          settle(() => {
            reject(new Error("桌面通知发送超时"));
          });
        }, 5_000);
        settleTimer.unref?.();

        try {
          notification.show();
        } catch (error) {
          release();
          settle(() => {
            reject(error);
          });
        }
      });
    },
  };
}
