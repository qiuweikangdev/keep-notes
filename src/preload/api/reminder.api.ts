import { ipcRenderer, type IpcRendererEvent } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type {
  Reminder,
  ReminderInput,
  ShortcutRegistrationResult,
} from "../../shared/types";

export const reminderApi = {
  listReminders: (): Promise<Reminder[]> => {
    return ipcRenderer.invoke(IPC_CHANNELS.REMINDER.LIST);
  },

  createReminder: (input: ReminderInput): Promise<Reminder> => {
    return ipcRenderer.invoke(IPC_CHANNELS.REMINDER.CREATE, input);
  },

  updateReminder: (
    id: string,
    input: Partial<ReminderInput>,
  ): Promise<Reminder> => {
    return ipcRenderer.invoke(IPC_CHANNELS.REMINDER.UPDATE, id, input);
  },

  deleteReminder: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke(IPC_CHANNELS.REMINDER.DELETE, id);
  },

  completeReminder: (id: string): Promise<Reminder> => {
    return ipcRenderer.invoke(IPC_CHANNELS.REMINDER.COMPLETE, id);
  },

  setReminderGlobalShortcut: (
    keys: string[],
  ): Promise<ShortcutRegistrationResult> => {
    return ipcRenderer.invoke(IPC_CHANNELS.REMINDER.SET_GLOBAL_SHORTCUT, keys);
  },

  showReminderWindow: (): void => {
    ipcRenderer.send(IPC_CHANNELS.REMINDER.SHOW_WINDOW);
  },

  hideReminderWindow: (): void => {
    ipcRenderer.send(IPC_CHANNELS.REMINDER.HIDE_WINDOW);
  },

  resizeReminderWindow: (height: number): void => {
    ipcRenderer.send(IPC_CHANNELS.REMINDER.RESIZE_WINDOW, height);
  },

  showReminderEditorWindow: (reminderId?: string): void => {
    ipcRenderer.send(IPC_CHANNELS.REMINDER.SHOW_EDITOR_WINDOW, reminderId);
  },

  resizeReminderEditorWindow: (height: number): void => {
    ipcRenderer.send(IPC_CHANNELS.REMINDER.RESIZE_EDITOR_WINDOW, height);
  },

  closeReminderEditorWindow: (): void => {
    ipcRenderer.send(IPC_CHANNELS.REMINDER.CLOSE_EDITOR_WINDOW);
  },

  onReminderWindowShown: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.REMINDER.WINDOW_SHOWN, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.REMINDER.WINDOW_SHOWN, handler);
    };
  },

  onRemindersChanged: (callback: (reminders: Reminder[]) => void) => {
    const handler = (_event: IpcRendererEvent, reminders: Reminder[]) => {
      callback(reminders);
    };
    ipcRenderer.on(IPC_CHANNELS.REMINDER.ON_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.REMINDER.ON_CHANGED, handler);
    };
  },

  onReminderTriggered: (callback: (reminder: Reminder) => void) => {
    const handler = (_event: IpcRendererEvent, reminder: Reminder) => {
      callback(reminder);
    };
    ipcRenderer.on(IPC_CHANNELS.REMINDER.ON_TRIGGERED, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.REMINDER.ON_TRIGGERED, handler);
    };
  },
};
