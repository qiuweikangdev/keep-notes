import { BrowserWindow, ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type { ReminderInput } from "../../shared/types";
import { reminderService } from "../reminders";

function broadcastReminders(): void {
  const reminders = reminderService.getSnapshot();
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.REMINDER.ON_CHANGED, reminders);
    }
  });
}

export async function initializeReminderIpc(): Promise<void> {
  reminderService.setBroadcast(broadcastReminders);
  await reminderService.load();
}

export function registerReminderIpc(): void {
  ipcMain.handle(IPC_CHANNELS.REMINDER.LIST, async () => {
    return reminderService.list();
  });

  ipcMain.handle(
    IPC_CHANNELS.REMINDER.CREATE,
    async (_, input: ReminderInput) => {
      return reminderService.create(input);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.REMINDER.UPDATE,
    async (_, id: string, input: Partial<ReminderInput>) => {
      return reminderService.update(id, input);
    },
  );

  ipcMain.handle(IPC_CHANNELS.REMINDER.DELETE, async (_, id: string) => {
    return reminderService.delete(id);
  });

  ipcMain.handle(IPC_CHANNELS.REMINDER.COMPLETE, async (_, id: string) => {
    return reminderService.complete(id);
  });
}
