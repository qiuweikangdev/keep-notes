import fs from "node:fs";
import { basename, join } from "node:path";
import { app, Notification } from "electron";
import type {
  Reminder,
  ReminderInput,
  ReminderRepeatCustomRule,
  ReminderRepeatPreset,
  ReminderRepeatUnit,
} from "../shared/types";
import { openPathInNewWindow } from "./window";

const MAX_TIMER_DELAY = 2_147_483_647;

export interface TimerHandle {
  dispose: () => void;
}

interface NotificationHandle {
  show: () => void;
}

interface ReminderServiceDeps {
  readReminders?: () => Promise<Reminder[]>;
  writeReminders?: (reminders: Reminder[]) => Promise<void>;
  now?: () => Date;
  createId?: () => string;
  scheduleTimer?: (callback: () => void, delay: number) => TimerHandle;
  showNotification?: (
    reminder: Reminder,
    onClick: () => void,
  ) => NotificationHandle;
  openFileInNewWindow?: (filePath: string) => Promise<boolean>;
  broadcast?: (reminders: Reminder[]) => void;
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
): NotificationHandle {
  const notification = new Notification({
    title: reminder.title,
    body: reminder.fileName,
  });
  notification.on("click", onClick);
  return notification;
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
  ) => NotificationHandle;
  private readonly openFileInNewWindow: (filePath: string) => Promise<boolean>;
  private broadcast: (reminders: Reminder[]) => void;

  constructor(deps: ReminderServiceDeps = {}) {
    this.readReminders = deps.readReminders ?? readReminderFile;
    this.writeReminders = deps.writeReminders ?? writeReminderFile;
    this.now = deps.now ?? (() => new Date());
    this.createId = deps.createId ?? createReminderId;
    this.scheduleTimer = deps.scheduleTimer ?? createDefaultTimer;
    this.showNotification = deps.showNotification ?? createDefaultNotification;
    this.openFileInNewWindow = deps.openFileInNewWindow ?? openPathInNewWindow;
    this.broadcast = deps.broadcast ?? (() => undefined);
  }

  setBroadcast(broadcast: (reminders: Reminder[]) => void): void {
    this.broadcast = broadcast;
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
    const reminder: Reminder = {
      id: this.createId(),
      title: input.title,
      filePath: input.filePath,
      fileName: basename(input.filePath),
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
      updated = {
        ...reminder,
        ...input,
        fileName: input.filePath ? basename(input.filePath) : reminder.fileName,
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

      this.notify(reminder);
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

  private notify(reminder: Reminder): void {
    const notification = this.showNotification(reminder, () => {
      void this.openFileInNewWindow(reminder.filePath);
    });
    notification.show();
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
