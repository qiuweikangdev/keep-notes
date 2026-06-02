import localShortcut from "electron-localshortcut";
import { BrowserWindow } from "electron";
import { createWindow } from "../window";

export function registerWindowShortcuts(win: BrowserWindow): void {
  localShortcut.register(win, "CommandOrControl+Shift+N", () => {
    createWindow();
  });
}
