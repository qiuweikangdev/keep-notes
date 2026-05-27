import { globalShortcut } from "electron";
import { createWindow } from "../window";

export function registerShortcuts(): void {
  globalShortcut.register("CommandOrControl+Shift+N", () => {
    createWindow();
  });
}
