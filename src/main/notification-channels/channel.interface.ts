import type { NotificationChannelType, Reminder } from "../../shared/types";

/** 通知渠道接口，定义所有通知渠道必须实现的方法 */
export interface NotificationChannel {
  type: NotificationChannelType;
  /** 发送提醒通知 */
  send(reminder: Reminder): Promise<void>;
  /** 测试渠道连通性 */
  test(): Promise<{ success: boolean; error?: string }>;
}
