import { describe, expect, it, vi } from "vitest";
import type { Reminder, ReminderInput } from "../shared/types";
import {
  ReminderService,
  calculateNextReminderDate,
  createReminderId,
} from "./reminders";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp/keep-notes-test") },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  Notification: class {
    show = vi.fn();
    on = vi.fn();
    once = vi.fn();
  },
}));

vi.mock("./window", () => ({
  openPathInNewWindow: vi.fn(),
}));

const baseInput: ReminderInput = {
  title: "Read notes",
  filePath: "/workspace/notes/today.md",
  scheduledAt: "2026-06-21T09:00:00.000Z",
  repeat: "never",
};

function createTestService(
  options: {
    initial?: Reminder[];
    now?: Date;
    showNotification?: ReturnType<typeof vi.fn>;
    scheduleTimer?: ReturnType<typeof vi.fn>;
    broadcastTriggered?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const saved: Reminder[][] = [];
  const timerDispose = vi.fn();
  const showNotification = options.showNotification ?? vi.fn();
  const openFileInNewWindow = vi.fn();
  const broadcast = vi.fn();
  const service = new ReminderService({
    readReminders: async () => options.initial ?? [],
    writeReminders: async (reminders) => {
      saved.push(reminders);
    },
    now: () => options.now ?? new Date("2026-06-21T08:00:00.000Z"),
    createId: () => createReminderId("test"),
    scheduleTimer:
      options.scheduleTimer ?? vi.fn(() => ({ dispose: timerDispose })),
    showNotification,
    openFileInNewWindow,
    broadcast,
    broadcastTriggered: options.broadcastTriggered,
  });

  return {
    service,
    saved,
    timerDispose,
    showNotification,
    openFileInNewWindow,
    broadcast,
  };
}

describe("calculateNextReminderDate", () => {
  it("calculates preset repeats from the current due date", () => {
    const due = new Date("2026-06-19T09:00:00.000Z");

    expect(
      calculateNextReminderDate(due, { repeat: "hourly" }).toISOString(),
    ).toBe("2026-06-19T10:00:00.000Z");
    expect(
      calculateNextReminderDate(due, { repeat: "daily" }).toISOString(),
    ).toBe("2026-06-20T09:00:00.000Z");
    expect(
      calculateNextReminderDate(due, { repeat: "weekdays" }).toISOString(),
    ).toBe("2026-06-22T09:00:00.000Z");
    expect(
      calculateNextReminderDate(due, { repeat: "weekends" }).toISOString(),
    ).toBe("2026-06-20T09:00:00.000Z");
    expect(
      calculateNextReminderDate(due, { repeat: "weekly" }).toISOString(),
    ).toBe("2026-06-26T09:00:00.000Z");
    expect(
      calculateNextReminderDate(due, { repeat: "biweekly" }).toISOString(),
    ).toBe("2026-07-03T09:00:00.000Z");
    expect(
      calculateNextReminderDate(due, { repeat: "monthly" }).toISOString(),
    ).toBe("2026-07-19T09:00:00.000Z");
    expect(
      calculateNextReminderDate(due, { repeat: "bimonthly" }).toISOString(),
    ).toBe("2026-08-19T09:00:00.000Z");
    expect(
      calculateNextReminderDate(due, { repeat: "quarterly" }).toISOString(),
    ).toBe("2026-09-19T09:00:00.000Z");
    expect(
      calculateNextReminderDate(due, { repeat: "semiannual" }).toISOString(),
    ).toBe("2026-12-19T09:00:00.000Z");
    expect(
      calculateNextReminderDate(due, { repeat: "yearly" }).toISOString(),
    ).toBe("2027-06-19T09:00:00.000Z");
  });

  it("calculates custom repeat intervals", () => {
    const due = new Date("2026-06-21T09:00:00.000Z");

    expect(
      calculateNextReminderDate(due, {
        repeat: "custom",
        customRepeat: { interval: 5, unit: "hour" },
      }).toISOString(),
    ).toBe("2026-06-21T14:00:00.000Z");
    expect(
      calculateNextReminderDate(due, {
        repeat: "custom",
        customRepeat: { interval: 3, unit: "day" },
      }).toISOString(),
    ).toBe("2026-06-24T09:00:00.000Z");
    expect(
      calculateNextReminderDate(due, {
        repeat: "custom",
        customRepeat: { interval: 2, unit: "week" },
      }).toISOString(),
    ).toBe("2026-07-05T09:00:00.000Z");
    expect(
      calculateNextReminderDate(due, {
        repeat: "custom",
        customRepeat: { interval: 4, unit: "month" },
      }).toISOString(),
    ).toBe("2026-10-21T09:00:00.000Z");
    expect(
      calculateNextReminderDate(due, {
        repeat: "custom",
        customRepeat: { interval: 2, unit: "year" },
      }).toISOString(),
    ).toBe("2028-06-21T09:00:00.000Z");
  });
});

describe("ReminderService", () => {
  it("creates reminders with derived file names and timestamps", async () => {
    const { service, saved, broadcast } = createTestService();
    await service.load();

    const reminder = await service.create(baseInput);

    expect(reminder.fileName).toBe("today.md");
    expect(reminder.completed).toBe(false);
    expect(reminder.createdAt).toBe("2026-06-21T08:00:00.000Z");
    expect(reminder.updatedAt).toBe("2026-06-21T08:00:00.000Z");
    expect(saved.at(-1)).toEqual([reminder]);
    expect(broadcast).toHaveBeenCalledWith([reminder]);
  });

  it("updates and completes reminders", async () => {
    const { service } = createTestService();
    await service.load();
    const reminder = await service.create(baseInput);

    const updated = await service.update(reminder.id, { title: "Updated" });
    const completed = await service.complete(reminder.id);

    expect(updated.id).toBe(reminder.id);
    expect(updated.title).toBe("Updated");
    expect(completed.completed).toBe(true);
  });

  it("notifies due one-time reminders once for the same scheduled time", async () => {
    const showNotification = vi.fn(() => ({ show: vi.fn() }));
    const { service } = createTestService({
      now: new Date("2026-06-21T09:01:00.000Z"),
      showNotification,
    });
    await service.load();
    const reminder = await service.create(baseInput);

    await service.processDueReminders();
    await service.processDueReminders();

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot()[0]).toMatchObject({
      id: reminder.id,
      lastNotifiedAt: "2026-06-21T09:00:00.000Z",
    });
  });

  it("schedules newly created overdue reminders to notify immediately", async () => {
    let scheduledCallback: (() => void) | undefined;
    const notification = { show: vi.fn() };
    const showNotification = vi.fn(() => notification);
    const scheduleTimer = vi.fn((callback: () => void, _delay: number) => {
      scheduledCallback = callback;
      return { dispose: vi.fn() };
    });
    const { service } = createTestService({
      now: new Date("2026-06-21T09:01:00.000Z"),
      showNotification,
      scheduleTimer,
    });
    await service.load();

    await service.create(baseInput);
    await scheduledCallback?.();

    expect(scheduleTimer).toHaveBeenLastCalledWith(expect.any(Function), 0);
    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(notification.show).toHaveBeenCalledTimes(1);
  });

  it("broadcasts triggered reminders to renderer windows", async () => {
    const broadcastTriggered = vi.fn();
    const { service } = createTestService({
      now: new Date("2026-06-21T09:01:00.000Z"),
      showNotification: vi.fn(() => ({ show: vi.fn() })),
      broadcastTriggered,
    });
    await service.load();
    const reminder = await service.create(baseInput);

    await service.processDueReminders();

    expect(broadcastTriggered).toHaveBeenCalledWith(
      expect.objectContaining({ id: reminder.id }),
    );
  });

  it("continues processing when desktop notification fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const broadcastTriggered = vi.fn();
    const { service } = createTestService({
      now: new Date("2026-06-21T09:01:00.000Z"),
      showNotification: vi.fn(() => {
        throw new Error("Notifications unavailable");
      }),
      broadcastTriggered,
    });
    await service.load();
    const reminder = await service.create(baseInput);

    await service.processDueReminders();

    expect(broadcastTriggered).toHaveBeenCalledWith(
      expect.objectContaining({ id: reminder.id }),
    );
    expect(service.getSnapshot()[0]).toMatchObject({
      lastNotifiedAt: "2026-06-21T09:00:00.000Z",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to show desktop reminder notification:",
      expect.any(Error),
    );
    consoleError.mockRestore();
  });

  it("advances repeating reminders after notification", async () => {
    const showNotification = vi.fn(() => ({ show: vi.fn() }));
    const { service } = createTestService({
      now: new Date("2026-06-21T09:01:00.000Z"),
      showNotification,
    });
    await service.load();
    const reminder = await service.create({ ...baseInput, repeat: "daily" });

    await service.processDueReminders();

    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot()[0]).toMatchObject({
      id: reminder.id,
      scheduledAt: "2026-06-22T09:00:00.000Z",
      lastNotifiedAt: "2026-06-21T09:00:00.000Z",
    });
  });
});
