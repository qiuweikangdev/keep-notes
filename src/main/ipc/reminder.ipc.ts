import { BrowserWindow, ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type { Reminder, ReminderInput } from "../../shared/types";
import { reminderService } from "../reminders";
import {
  configureReminderGlobalShortcuts,
  closeReminderEditorWindow,
  hideReminderWindow,
  prewarmReminderEditorWindow,
  resizeReminderEditorWindow,
  resizeReminderWindow,
  setReminderWindowTheme,
  showReminderEditorWindow,
  showReminderWindow,
} from "../reminder-window";
import { getBrowserWindow } from "../utils";
import { focusMainWindow } from "../window";

function broadcastReminders(): void {
  const reminders = reminderService.getSnapshot();
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.REMINDER.ON_CHANGED, reminders);
    }
  });
}

function broadcastTriggeredReminder(reminder: Reminder): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.REMINDER.ON_TRIGGERED, reminder);
    }
  });
}

export async function initializeReminderIpc(): Promise<void> {
  reminderService.setBroadcast(broadcastReminders);
  reminderService.setTriggeredBroadcast(broadcastTriggeredReminder);
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

  ipcMain.handle(
    IPC_CHANNELS.REMINDER.SET_GLOBAL_SHORTCUT,
    (_, keys: unknown) => {
      if (
        !Array.isArray(keys) ||
        !keys.every((key) => typeof key === "string" && key.length <= 100)
      ) {
        return { success: false, failedKeys: [] };
      }

      return configureReminderGlobalShortcuts(keys);
    },
  );

  ipcMain.on(IPC_CHANNELS.REMINDER.SET_WINDOW_THEME, (_, theme: unknown) => {
    setReminderWindowTheme(theme);
  });

  ipcMain.on(IPC_CHANNELS.REMINDER.SHOW_WINDOW, () => {
    showReminderWindow();
  });

  ipcMain.on(IPC_CHANNELS.REMINDER.HIDE_WINDOW, () => {
    hideReminderWindow();
  });

  ipcMain.on(IPC_CHANNELS.REMINDER.RETURN_TO_MAIN_WINDOW, () => {
    hideReminderWindow();
    focusMainWindow();
  });

  ipcMain.on(IPC_CHANNELS.REMINDER.RESIZE_WINDOW, (event, height: unknown) => {
    resizeReminderWindow(getBrowserWindow(event), height);
  });

  ipcMain.on(IPC_CHANNELS.REMINDER.PREWARM_EDITOR_WINDOW, () => {
    prewarmReminderEditorWindow();
  });

  ipcMain.on(
    IPC_CHANNELS.REMINDER.SHOW_EDITOR_WINDOW,
    (_, reminderId: unknown) => {
      showReminderEditorWindow(
        typeof reminderId === "string" && reminderId.length <= 100
          ? reminderId
          : undefined,
      );
    },
  );

  ipcMain.on(
    IPC_CHANNELS.REMINDER.RESIZE_EDITOR_WINDOW,
    (event, height: unknown) => {
      resizeReminderEditorWindow(getBrowserWindow(event), height);
    },
  );

  ipcMain.on(IPC_CHANNELS.REMINDER.CLOSE_EDITOR_WINDOW, (event) => {
    closeReminderEditorWindow(getBrowserWindow(event));
  });
}
