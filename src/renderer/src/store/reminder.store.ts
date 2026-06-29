import { create } from "zustand";
import type { Reminder, ReminderInput } from "@/types";

interface ReminderState {
  reminders: Reminder[];
  isEditorOpen: boolean;
  editingReminderId: string | null;
  draftFilePath: string | null;
  isListOpen: boolean;
  triggeredReminder: Reminder | null;
  loadReminders: () => Promise<void>;
  subscribeToReminderChanges: () => () => void;
  subscribeToReminderTriggers: () => () => void;
  openCreateDialog: (filePath?: string) => void;
  openEditDialog: (reminderId: string) => void;
  closeEditor: () => void;
  openList: () => void;
  closeList: () => void;
  closeTriggeredReminder: () => void;
  createReminder: (input: ReminderInput) => Promise<Reminder>;
  updateReminder: (
    id: string,
    input: Partial<ReminderInput>,
  ) => Promise<Reminder>;
  deleteReminder: (id: string) => Promise<boolean>;
  completeReminder: (id: string) => Promise<Reminder>;
}

function upsertReminder(reminders: Reminder[], reminder: Reminder): Reminder[] {
  const exists = reminders.some((item) => item.id === reminder.id);
  if (!exists) return [...reminders, reminder];

  // 主进程广播和接口返回可能乱序到达，按 id 覆盖可避免同一提醒在列表中重复出现。
  return reminders.map((item) => (item.id === reminder.id ? reminder : item));
}

export const useReminderStore = create<ReminderState>()((set) => ({
  reminders: [],
  isEditorOpen: false,
  editingReminderId: null,
  draftFilePath: null,
  isListOpen: false,
  triggeredReminder: null,

  loadReminders: async () => {
    const reminders = await window.electronAPI.listReminders();
    set({ reminders });
  },

  subscribeToReminderChanges: () => {
    return window.electronAPI.onRemindersChanged((reminders) => {
      set({ reminders });
    });
  },

  subscribeToReminderTriggers: () => {
    return window.electronAPI.onReminderTriggered((reminder) => {
      set({ triggeredReminder: reminder });
    });
  },

  openCreateDialog: (filePath) => {
    set({
      isEditorOpen: true,
      editingReminderId: null,
      draftFilePath: filePath ?? null,
    });
  },

  openEditDialog: (reminderId) => {
    set({
      isEditorOpen: true,
      editingReminderId: reminderId,
      draftFilePath: null,
    });
  },

  closeEditor: () => {
    set({
      isEditorOpen: false,
      editingReminderId: null,
      draftFilePath: null,
    });
  },

  openList: () => set({ isListOpen: true }),

  closeList: () => set({ isListOpen: false }),

  closeTriggeredReminder: () => set({ triggeredReminder: null }),

  createReminder: async (input) => {
    const reminder = await window.electronAPI.createReminder(input);
    set((state) => ({
      reminders: upsertReminder(state.reminders, reminder),
      isEditorOpen: false,
      editingReminderId: null,
      draftFilePath: null,
    }));
    return reminder;
  },

  updateReminder: async (id, input) => {
    const reminder = await window.electronAPI.updateReminder(id, input);
    set((state) => ({
      reminders: upsertReminder(state.reminders, reminder),
      isEditorOpen: false,
      editingReminderId: null,
      draftFilePath: null,
    }));
    return reminder;
  },

  deleteReminder: async (id) => {
    const deleted = await window.electronAPI.deleteReminder(id);
    if (deleted) {
      set((state) => ({
        reminders: state.reminders.filter((item) => item.id !== id),
      }));
    }
    return deleted;
  },

  completeReminder: async (id) => {
    const reminder = await window.electronAPI.completeReminder(id);
    set((state) => ({
      reminders: upsertReminder(state.reminders, reminder),
    }));
    return reminder;
  },
}));
