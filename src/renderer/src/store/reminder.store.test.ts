import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Reminder } from "@/types";
import { useReminderStore } from "./reminder.store";

const reminder: Reminder = {
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

describe("useReminderStore", () => {
  beforeEach(() => {
    useReminderStore.setState({
      reminders: [],
      isEditorOpen: false,
      editingReminderId: null,
      draftFilePath: null,
      isListOpen: false,
    });

    window.electronAPI = {
      ...window.electronAPI,
      listReminders: vi.fn(async () => [reminder]),
      createReminder: vi.fn(async () => reminder),
      updateReminder: vi.fn(async () => reminder),
      deleteReminder: vi.fn(async () => true),
      completeReminder: vi.fn(async () => ({ ...reminder, completed: true })),
      onRemindersChanged: vi.fn(() => () => undefined),
    };
  });

  it("loads reminders from the preload API", async () => {
    await useReminderStore.getState().loadReminders();

    expect(window.electronAPI.listReminders).toHaveBeenCalled();
    expect(useReminderStore.getState().reminders).toEqual([reminder]);
  });

  it("opens create dialog for a file", () => {
    useReminderStore.getState().openCreateDialog("/workspace/notes/today.md");

    expect(useReminderStore.getState()).toMatchObject({
      isEditorOpen: true,
      editingReminderId: null,
      draftFilePath: "/workspace/notes/today.md",
    });
  });

  it("creates reminders and closes the editor", async () => {
    useReminderStore.getState().openCreateDialog("/workspace/notes/today.md");

    await useReminderStore.getState().createReminder({
      title: "Read notes",
      filePath: "/workspace/notes/today.md",
      scheduledAt: "2026-06-21T09:00:00.000Z",
      repeat: "never",
    });

    expect(window.electronAPI.createReminder).toHaveBeenCalled();
    expect(useReminderStore.getState()).toMatchObject({
      reminders: [reminder],
      isEditorOpen: false,
      draftFilePath: null,
    });
  });
});
