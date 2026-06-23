import { ipcRenderer, type IpcRendererEvent } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type {
  NotificationChannelType,
  NotificationConfig,
} from "../../shared/types";

export const notificationApi = {
  /** 获取当前通知配置 */
  getNotificationConfig: (): Promise<NotificationConfig> =>
    ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION.GET_CONFIG),

  /** 保存通知配置 */
  setNotificationConfig: (config: NotificationConfig): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION.SET_CONFIG, config),

  /** 测试指定通知渠道的连通性 */
  testNotificationChannel: (
    type: NotificationChannelType,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION.TEST_CHANNEL, type),

  /** 监听通知配置变更事件，返回取消监听函数 */
  onNotificationConfigChanged: (
    callback: (config: NotificationConfig) => void,
  ) => {
    const handler = (_event: IpcRendererEvent, config: NotificationConfig) => {
      callback(config);
    };
    ipcRenderer.on(IPC_CHANNELS.NOTIFICATION.ON_CONFIG_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(
        IPC_CHANNELS.NOTIFICATION.ON_CONFIG_CHANGED,
        handler,
      );
    };
  },
};
