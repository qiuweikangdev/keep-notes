import { describe, expect, it } from "vitest";
import type { Reminder } from "@/types";
import {
  filterReminders,
  getDefaultReminderDateTime,
  getRepeatLabel,
  isReminderToday,
} from "./reminder-format";

const baseReminder: Reminder = {
  id: "reminder-1",
  title: "Read notes",
  filePath: "/workspace/notes/today.md",
  fileName: "today.md",
  scheduledAt: "2026-06-21T09:00:00.000Z",
  repeat: "never",
  completed: false,
  createdAt: "2026-06-21T08:00:00.000Z",
  updatedAt: "2026-06-21T08:00:00.000Z",
};

describe("getRepeatLabel", () => {
  it("formats preset and custom repeat labels", () => {
    expect(getRepeatLabel({ repeat: "never" })).toBe("永不");
    expect(getRepeatLabel({ repeat: "hourly" })).toBe("每小时");
    expect(getRepeatLabel({ repeat: "daily" })).toBe("每天");
    expect(getRepeatLabel({ repeat: "weekdays" })).toBe("工作日");
    expect(getRepeatLabel({ repeat: "weekends" })).toBe("周末");
    expect(getRepeatLabel({ repeat: "weekly" })).toBe("每周");
    expect(getRepeatLabel({ repeat: "biweekly" })).toBe("每两周");
    expect(getRepeatLabel({ repeat: "monthly" })).toBe("每月");
    expect(getRepeatLabel({ repeat: "bimonthly" })).toBe("每两个月");
    expect(getRepeatLabel({ repeat: "quarterly" })).toBe("每 3 个月");
    expect(getRepeatLabel({ repeat: "semiannual" })).toBe("每 6 个月");
    expect(getRepeatLabel({ repeat: "yearly" })).toBe("每年");
    expect(
      getRepeatLabel({
        repeat: "custom",
        customRepeat: { interval: 5, unit: "hour" },
      }),
    ).toBe("每 5 小时");
    expect(
      getRepeatLabel({
        repeat: "custom",
        customRepeat: { interval: 3, unit: "day" },
      }),
    ).toBe("每 3 天");
  });
});

describe("isReminderToday", () => {
  it("matches reminders scheduled on the same local day", () => {
    expect(
      isReminderToday(baseReminder, new Date("2026-06-21T12:00:00.000Z")),
    ).toBe(true);
    expect(
      isReminderToday(baseReminder, new Date("2026-06-22T00:00:00.000Z")),
    ).toBe(false);
  });
});

describe("filterReminders", () => {
  it("filters by tab and search query", () => {
    const completed: Reminder = {
      ...baseReminder,
      id: "reminder-2",
      title: "Finished task",
      completed: true,
      fileName: "archive.md",
    };
    const tomorrow: Reminder = {
      ...baseReminder,
      id: "reminder-3",
      title: "Tomorrow task",
      fileName: "tomorrow.md",
      scheduledAt: "2026-06-22T09:00:00.000Z",
    };
    const notified: Reminder = {
      ...baseReminder,
      id: "reminder-4",
      title: "Notified task",
      fileName: "notified.md",
      lastNotifiedAt: "2026-06-21T09:01:00.000Z",
      notificationHistory: [
        {
          scheduledAt: "2026-06-21T09:00:00.000Z",
          notifiedAt: "2026-06-21T09:01:00.000Z",
        },
      ],
    };
    const reminders = [baseReminder, completed, tomorrow, notified];
    const now = new Date("2026-06-21T12:00:00.000Z");

    expect(filterReminders(reminders, "today", "", now)).toEqual([
      baseReminder,
      notified,
    ]);
    expect(filterReminders(reminders, "all", "", now)).toEqual([
      tomorrow,
      baseReminder,
      completed,
      notified,
    ]);
    expect(filterReminders(reminders, "completed", "", now)).toEqual([
      completed,
    ]);
    expect(filterReminders(reminders, "all", "today", now)).toEqual([
      baseReminder,
    ]);
    expect(filterReminders(reminders, "today", "finished", now)).toEqual([
      completed,
    ]);
    expect(filterReminders(reminders, "completed", "notified", now)).toEqual([
      notified,
    ]);
  });

  it("sorts visible reminders by scheduled time in descending order", () => {
    const older: Reminder = {
      ...baseReminder,
      id: "reminder-older",
      title: "Older task",
      scheduledAt: "2026-06-21T08:00:00.000Z",
    };
    const latest: Reminder = {
      ...baseReminder,
      id: "reminder-latest",
      title: "Latest task",
      scheduledAt: "2026-06-23T08:00:00.000Z",
    };
    const middle: Reminder = {
      ...baseReminder,
      id: "reminder-middle",
      title: "Middle task",
      scheduledAt: "2026-06-22T08:00:00.000Z",
    };

    expect(filterReminders([older, latest, middle], "all", "")).toEqual([
      latest,
      middle,
      older,
    ]);
  });
});

describe("getDefaultReminderDateTime", () => {
  it("uses the current local time as the default reminder time", () => {
    expect(getDefaultReminderDateTime(new Date("2026-06-21T08:02:00"))).toEqual(
      {
        date: "2026-06-21",
        time: "08:02",
      },
    );
  });
});
