import type { Reminder } from "@/types";

export type ReminderListTab = "today" | "completed" | "all";

export function getRepeatLabel(
  reminder: Pick<Reminder, "repeat" | "customRepeat">,
): string {
  if (reminder.repeat === "never") return "永不";
  if (reminder.repeat === "hourly") return "每小时";
  if (reminder.repeat === "daily") return "每天";
  if (reminder.repeat === "weekdays") return "工作日";
  if (reminder.repeat === "weekends") return "周末";
  if (reminder.repeat === "weekly") return "每周";
  if (reminder.repeat === "biweekly") return "每两周";
  if (reminder.repeat === "monthly") return "每月";
  if (reminder.repeat === "bimonthly") return "每两个月";
  if (reminder.repeat === "quarterly") return "每 3 个月";
  if (reminder.repeat === "semiannual") return "每 6 个月";
  if (reminder.repeat === "yearly") return "每年";

  const unit = reminder.customRepeat?.unit ?? "day";
  const interval = reminder.customRepeat?.interval ?? 1;
  const unitLabel = {
    hour: "小时",
    day: "天",
    week: "周",
    month: "月",
    year: "年",
  }[unit];
  return `每 ${interval} ${unitLabel}`;
}

export function isReminderToday(reminder: Reminder, now = new Date()): boolean {
  const scheduledAt = new Date(reminder.scheduledAt);
  return (
    scheduledAt.getFullYear() === now.getFullYear() &&
    scheduledAt.getMonth() === now.getMonth() &&
    scheduledAt.getDate() === now.getDate()
  );
}

export function formatReminderDateTime(scheduledAt: string): string {
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function hasNotificationHistory(reminder: Reminder): boolean {
  return (
    reminder.lastNotifiedAt !== undefined ||
    (reminder.notificationHistory?.length ?? 0) > 0
  );
}

export function filterReminders(
  reminders: Reminder[],
  tab: ReminderListTab,
  query: string,
  now = new Date(),
): Reminder[] {
  const normalizedQuery = query.trim().toLowerCase();
  return reminders.filter((reminder) => {
    if (normalizedQuery) {
      return (
        reminder.title.toLowerCase().includes(normalizedQuery) ||
        reminder.fileName.toLowerCase().includes(normalizedQuery)
      );
    }
    if (
      tab === "today" &&
      (reminder.completed || !isReminderToday(reminder, now))
    ) {
      return false;
    }
    if (tab === "completed" && !reminder.completed) {
      return false;
    }
    return true;
  });
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeInputValue(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function getDefaultReminderDateTime(now = new Date()): {
  date: string;
  time: string;
} {
  return {
    date: toDateInputValue(now),
    time: toTimeInputValue(now),
  };
}

export function composeScheduledAt(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

export function splitScheduledAt(scheduledAt: string): {
  date: string;
  time: string;
} {
  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) {
    return getDefaultReminderDateTime();
  }
  return {
    date: toDateInputValue(date),
    time: toTimeInputValue(date),
  };
}
