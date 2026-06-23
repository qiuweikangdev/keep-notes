import { BrowserWindow, ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type {
  NotificationChannelType,
  NotificationConfig,
} from "../../shared/types";
import { notificationChannelManager } from "../notification-channels/manager";

/** 向所有窗口广播通知配置变更 */
function broadcastConfig(config: NotificationConfig): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.NOTIFICATION.ON_CONFIG_CHANGED, config);
    }
  });
}

/** 初始化通知 IPC，从持久化存储加载配置 */
export async function initializeNotificationIpc(): Promise<void> {
  await notificationChannelManager.loadConfig();
}

/** 注册通知相关的 IPC 处理器 */
export function registerNotificationIpc(): void {
  // 获取当前通知配置
  ipcMain.handle(IPC_CHANNELS.NOTIFICATION.GET_CONFIG, async () => {
    return notificationChannelManager.getConfig();
  });

  // 保存通知配置并广播变更
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATION.SET_CONFIG,
    async (_, config: NotificationConfig) => {
      await notificationChannelManager.saveConfig(config);
      broadcastConfig(notificationChannelManager.getConfig());
    },
  );

  // 测试指定通知渠道的连通性
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATION.TEST_CHANNEL,
    async (_, type: NotificationChannelType) => {
      return notificationChannelManager.testChannel(type);
    },
  );
}
