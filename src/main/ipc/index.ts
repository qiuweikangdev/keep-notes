import { registerFileIpc } from "./file.ipc";
import { registerTreeIpc } from "./tree.ipc";
import { registerGitIpc } from "./git.ipc";
import { registerMenuIpc } from "./menu.ipc";
import { registerEditorIpc } from "./editor.ipc";
import { registerUpdaterIpc } from "./updater.ipc";
import { registerReminderIpc } from "./reminder.ipc";
import { registerNotificationIpc } from "./notification.ipc";
import { registerExportIpc } from "./export.ipc";

export function registerAllIpc(): void {
  registerFileIpc();
  registerTreeIpc();
  registerGitIpc();
  registerMenuIpc();
  registerEditorIpc();
  registerUpdaterIpc();
  registerReminderIpc();
  registerNotificationIpc();
  registerExportIpc();
}
