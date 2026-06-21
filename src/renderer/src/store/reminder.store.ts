import { create } from "zustand";
import type { Reminder, ReminderInput } from "@/types";

interface ReminderState {
  reminders: Reminder[];
  isEditorOpen: boolean;
  editingReminderId: string | null;
  draftFilePath: string | null;
  isListOpen: boolean;
  loadReminders: () => Promise<void>;
  subscribeToReminderChanges: () => () => void;
  openCreateDialog: (filePath: string) => void;
  openEditDialog: (reminderId: string) => void;
  closeEditor: () => void;
  openList: () => void;
  closeList: () => void;
  createReminder: (input: ReminderInput) => Promise<Reminder>;
  updateReminder: (
    id: string,
    input: Partial<ReminderInput>,
  ) => Promise<Reminder>;
  deleteReminder: (id: string) => Promise<boolean>;
  completeReminder: (id: string) => Promise<Reminder>;
}

export const useReminderStore = create<ReminderState>()((set) => ({
  reminders: [],
  isEditorOpen: false,
  editingReminderId: null,
  draftFilePath: null,
  isListOpen: false,

  loadReminders: async () => {
    const reminders = await window.electronAPI.listReminders();
    set({ reminders });
  },

  subscribeToReminderChanges: () => {
    return window.electronAPI.onRemindersChanged((reminders) => {
      set({ reminders });
    });
  },

  openCreateDialog: (filePath) => {
    set({
      isEditorOpen: true,
      editingReminderId: null,
      draftFilePath: filePath,
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

  createReminder: async (input) => {
    const reminder = await window.electronAPI.createReminder(input);
    set((state) => ({
      reminders: [...state.reminders, reminder],
      isEditorOpen: false,
      editingReminderId: null,
      draftFilePath: null,
    }));
    return reminder;
  },

  updateReminder: async (id, input) => {
    const reminder = await window.electronAPI.updateReminder(id, input);
    set((state) => ({
      reminders: state.reminders.map((item) =>
        item.id === reminder.id ? reminder : item,
      ),
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
      reminders: state.reminders.map((item) =>
        item.id === reminder.id ? reminder : item,
      ),
    }));
    return reminder;
  },
}));
