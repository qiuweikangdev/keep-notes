declare module "electron-localshortcut" {
  import type { BrowserWindow } from "electron";

  type Accelerator = string | string[];
  type ShortcutCallback = () => void;

  interface ElectronLocalShortcut {
    disableAll(win: BrowserWindow): void;
    enableAll(win: BrowserWindow): void;
    isRegistered(win: BrowserWindow, accelerator: string): boolean;
    isRegistered(accelerator: string): boolean;
    register(
      win: BrowserWindow,
      accelerator: Accelerator,
      callback: ShortcutCallback,
    ): void;
    register(accelerator: Accelerator, callback: ShortcutCallback): void;
    unregister(win: BrowserWindow, accelerator: Accelerator): void;
    unregister(accelerator: Accelerator): void;
    unregisterAll(win?: BrowserWindow): void;
  }

  const localShortcut: ElectronLocalShortcut;
  export = localShortcut;
}
