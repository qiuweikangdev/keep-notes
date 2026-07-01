import fs from "node:fs";
import { basename, join } from "node:path";
import { app } from "electron";
import type {
  Reminder,
  ReminderInput,
  NotificationConfig,
  ReminderRepeatCustomRule,
  ReminderRepeatPreset,
  ReminderRepeatUnit,
} from "../shared/types";
import { notificationChannelManager } from "./notification-channels/manager";
import { createAppNotification } from "./app-notification";
import { openPathInNewWindow } from "./window";

const MAX_TIMER_DELAY = 2_147_483_647;
const SNOOZE_DELAY = 5 * 60 * 1000;

export interface TimerHandle {
  dispose: () => void;
}

interface NotificationHandle {
  show: () => void | Promise<void>;
}

type ReminderNotificationOptions = NotificationConfig["desktop"];

interface ReminderServiceDeps {
  readReminders?: () => Promise<Reminder[]>;
  writeReminders?: (reminders: Reminder[]) => Promise<void>;
  now?: () => Date;
  createId?: () => string;
  scheduleTimer?: (callback: () => void, delay: number) => TimerHandle;
  showNotification?: (
    reminder: Reminder,
    onClick: () => void,
    onSnooze: () => void,
    options: ReminderNotificationOptions,
  ) => NotificationHandle;
  getNotificationConfig?: () => NotificationConfig;
  openFileInNewWindow?: (filePath: string) => Promise<boolean>;
  broadcast?: (reminders: Reminder[]) => void;
  broadcastTriggered?: (reminder: Reminder) => void;
}

export function createReminderId(prefix = "reminder"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getReminderStoragePath(): string {
  return join(app.getPath("userData"), "reminders.json");
}

export async function readReminderFile(): Promise<Reminder[]> {
  try {
    const content = await fs.promises.readFile(
      getReminderStoragePath(),
      "utf-8",
    );
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? (parsed as Reminder[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Failed to read reminders:", error);
    }
    return [];
  }
}

export async function writeReminderFile(reminders: Reminder[]): Promise<void> {
  await fs.promises.mkdir(app.getPath("userData"), { recursive: true });
  await fs.promises.writeFile(
    getReminderStoragePath(),
    JSON.stringify(reminders, null, 2),
    "utf-8",
  );
}

function addDatePart(
  date: Date,
  unit: ReminderRepeatUnit,
  interval: number,
): Date {
  const next = new Date(date);
  if (unit === "hour") next.setHours(next.getHours() + interval);
  if (unit === "day") next.setDate(next.getDate() + interval);
  if (unit === "week") next.setDate(next.getDate() + interval * 7);
  if (unit === "month") next.setMonth(next.getMonth() + interval);
  if (unit === "year") next.setFullYear(next.getFullYear() + interval);
  return next;
}

function nextMatchingDay(date: Date, matches: (day: number) => boolean): Date {
  let next = addDatePart(date, "day", 1);
  while (!matches(next.getDay())) {
    next = addDatePart(next, "day", 1);
  }
  return next;
}

export function calculateNextReminderDate(
  from: Date,
  rule: {
    repeat: ReminderRepeatPreset;
    customRepeat?: ReminderRepeatCustomRule;
  },
): Date {
  switch (rule.repeat) {
    case "hourly":
      return addDatePart(from, "hour", 1);
    case "daily":
      return addDatePart(from, "day", 1);
    case "weekdays":
      return nextMatchingDay(from, (day) => day >= 1 && day <= 5);
    case "weekends":
      return nextMatchingDay(from, (day) => day === 0 || day === 6);
    case "weekly":
      return addDatePart(from, "week", 1);
    case "biweekly":
      return addDatePart(from, "week", 2);
    case "monthly":
      return addDatePart(from, "month", 1);
    case "bimonthly":
      return addDatePart(from, "month", 2);
    case "quarterly":
      return addDatePart(from, "month", 3);
    case "semiannual":
      return addDatePart(from, "month", 6);
    case "yearly":
      return addDatePart(from, "year", 1);
    case "custom": {
      const custom = rule.customRepeat ?? { interval: 1, unit: "day" as const };
      return addDatePart(from, custom.unit, Math.max(1, custom.interval));
    }
    case "never":
      return from;
  }
}

function createDefaultNotification(
  reminder: Reminder,
  onClick: () => void,
  onSnooze: () => void,
  options: ReminderNotificationOptions,
): NotificationHandle {
  return createAppNotification(
    {
      ...options,
      title: reminder.title,
      body: reminder.fileName || undefined,
      detail: new Date(reminder.scheduledAt).toLocaleString("zh-CN"),
      openLabel: reminder.filePath ? "查看详情" : undefined,
    },
    onClick,
    onSnooze,
  );
}

function createDefaultTimer(callback: () => void, delay: number): TimerHandle {
  const timer = setTimeout(callback, delay);
  return {
    dispose: () => clearTimeout(timer),
  };
}

export class ReminderService {
  private reminders: Reminder[] = [];
  private timer: TimerHandle | null = null;
  private readonly readReminders: () => Promise<Reminder[]>;
  private readonly writeReminders: (reminders: Reminder[]) => Promise<void>;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly scheduleTimer: (
    callback: () => void,
    delay: number,
  ) => TimerHandle;
  private readonly showNotification: (
    reminder: Reminder,
    onClick: () => void,
    onSnooze: () => void,
    options: ReminderNotificationOptions,
  ) => NotificationHandle;
  private readonly getNotificationConfig: () => NotificationConfig;
  private readonly openFileInNewWindow: (filePath: string) => Promise<boolean>;
  private broadcast: (reminders: Reminder[]) => void;
  private broadcastTriggered: (reminder: Reminder) => void;

  constructor(deps: ReminderServiceDeps = {}) {
    this.readReminders = deps.readReminders ?? readReminderFile;
    this.writeReminders = deps.writeReminders ?? writeReminderFile;
    this.now = deps.now ?? (() => new Date());
    this.createId = deps.createId ?? createReminderId;
    this.scheduleTimer = deps.scheduleTimer ?? createDefaultTimer;
    this.showNotification = deps.showNotification ?? createDefaultNotification;
    this.getNotificationConfig =
      deps.getNotificationConfig ??
      (() => notificationChannelManager.getConfig());
    this.openFileInNewWindow = deps.openFileInNewWindow ?? openPathInNewWindow;
    this.broadcast = deps.broadcast ?? (() => undefined);
    this.broadcastTriggered = deps.broadcastTriggered ?? (() => undefined);
  }

  setBroadcast(broadcast: (reminders: Reminder[]) => void): void {
    this.broadcast = broadcast;
  }

  setTriggeredBroadcast(broadcast: (reminder: Reminder) => void): void {
    this.broadcastTriggered = broadcast;
  }

  async load(): Promise<Reminder[]> {
    this.reminders = await this.readReminders();
    this.scheduleAll();
    return this.getSnapshot();
  }

  async list(): Promise<Reminder[]> {
    return this.getSnapshot();
  }

  getSnapshot(): Reminder[] {
    return this.reminders.map((reminder) => ({ ...reminder }));
  }

  async create(input: ReminderInput): Promise<Reminder> {
    const timestamp = this.now().toISOString();
    const filePath = input.filePath ?? "";
    const reminder: Reminder = {
      id: this.createId(),
      title: input.title,
      filePath,
      fileName: filePath ? basename(filePath) : "",
      scheduledAt: input.scheduledAt,
      repeat: input.repeat,
      customRepeat: input.customRepeat,
      completed: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.reminders = [...this.reminders, reminder];
    await this.persistAndNotify();
    return { ...reminder };
  }

  async update(id: string, input: Partial<ReminderInput>): Promise<Reminder> {
    const timestamp = this.now().toISOString();
    let updated: Reminder | null = null;

    this.reminders = this.reminders.map((reminder) => {
      if (reminder.id !== id) return reminder;
      const filePath = input.filePath ?? reminder.filePath;
      updated = {
        ...reminder,
        ...input,
        filePath,
        fileName: filePath ? basename(filePath) : "",
        updatedAt: timestamp,
      };
      return updated;
    });

    if (!updated) {
      throw new Error(`Reminder not found: ${id}`);
    }

    await this.persistAndNotify();
    return { ...updated };
  }

  async delete(id: string): Promise<boolean> {
    const before = this.reminders.length;
    this.reminders = this.reminders.filter((reminder) => reminder.id !== id);
    const removed = this.reminders.length !== before;
    if (removed) {
      await this.persistAndNotify();
    }
    return removed;
  }

  async complete(id: string): Promise<Reminder> {
    return this.update(id, { completed: true } as Partial<ReminderInput> & {
      completed: boolean;
    });
  }

  async processDueReminders(): Promise<void> {
    const now = this.now();
    let changed = false;

    // 到期检测在主进程执行，避免任意渲染窗口重载导致提醒丢失。
    for (const reminder of this.reminders) {
      if (reminder.completed) continue;
      const dueAt = new Date(reminder.scheduledAt);
      if (Number.isNaN(dueAt.getTime()) || dueAt > now) continue;
      if (
        reminder.repeat === "never" &&
        reminder.lastNotifiedAt === reminder.scheduledAt
      ) {
        continue;
      }

      await this.notify(reminder);
      reminder.lastNotifiedAt = reminder.scheduledAt;

      if (reminder.repeat !== "never") {
        reminder.scheduledAt = calculateNextReminderDate(
          dueAt,
          reminder,
        ).toISOString();
      }

      reminder.updatedAt = now.toISOString();
      changed = true;
    }

    if (changed) {
      await this.persistAndNotify();
    } else {
      this.scheduleAll();
    }
  }

  private async notify(reminder: Reminder): Promise<void> {
    const config = this.getNotificationConfig();

    // 系统通知可能被操作系统权限拦截，先广播给渲染进程显示应用内提醒兜底。
    this.broadcastTriggered({ ...reminder });

    // 桌面通知受配置控制
    if (config.desktop.enabled) {
      try {
        const notification = this.showNotification(
          reminder,
          () => {
            // 无关联文件的提醒只展示通知，不触发文件打开动作。
            if (reminder.filePath) {
              void this.openFileInNewWindow(reminder.filePath);
            }
          },
          () => {
            void this.snoozeReminder(reminder.id);
          },
          config.desktop,
        );
        await notification.show();
      } catch (error) {
        console.error("Failed to show desktop reminder notification:", error);
      }
    }

    // 发送远程通知（邮件等）
    await notificationChannelManager.sendAll(reminder);
  }

  private async snoozeReminder(id: string): Promise<void> {
    const now = this.now();
    const snoozedAt = new Date(now.getTime() + SNOOZE_DELAY).toISOString();
    let changed = false;

    // 稍后提醒只移动当前提醒的下一次触发时间，不改标题、关联文件和重复配置。
    this.reminders = this.reminders.map((reminder) => {
      if (reminder.id !== id || reminder.completed) return reminder;
      changed = true;
      return {
        ...reminder,
        scheduledAt: snoozedAt,
        updatedAt: now.toISOString(),
      };
    });

    if (changed) {
      await this.persistAndNotify();
    }
  }

  private async persistAndNotify(): Promise<void> {
    await this.writeReminders(this.getSnapshot());
    this.broadcast(this.getSnapshot());
    this.scheduleAll();
  }

  private scheduleAll(): void {
    this.timer?.dispose();
    this.timer = null;

    const now = this.now().getTime();
    const nextReminder = this.reminders
      .filter((reminder) => !reminder.completed)
      .map((reminder) => new Date(reminder.scheduledAt).getTime())
      .filter((time) => !Number.isNaN(time))
      .sort((a, b) => a - b)[0];

    if (nextReminder === undefined) return;

    const delay = Math.max(0, Math.min(nextReminder - now, MAX_TIMER_DELAY));
    this.timer = this.scheduleTimer(() => {
      void this.processDueReminders();
    }, delay);
  }
}

export const reminderService = new ReminderService();
