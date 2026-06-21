import { ipcRenderer, type IpcRendererEvent } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type { Reminder, ReminderInput } from "../../shared/types";

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

  onRemindersChanged: (callback: (reminders: Reminder[]) => void) => {
    const handler = (_event: IpcRendererEvent, reminders: Reminder[]) => {
      callback(reminders);
    };
    ipcRenderer.on(IPC_CHANNELS.REMINDER.ON_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.REMINDER.ON_CHANGED, handler);
    };
  },
};
