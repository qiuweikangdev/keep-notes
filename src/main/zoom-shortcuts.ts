import process from "node:process";
import type { BrowserWindow } from "electron";

const ZOOM_LEVEL_STEP = 1;

/**
 * 为 Windows 的 Ctrl + 加号补齐缩放处理。
 * 部分键盘布局会将该组合键报告为 Equal、NumpadAdd，或只提供按键值；
 * Chromium 默认快捷键无法稳定识别。
 */
export function registerWindowsZoomInShortcut(win: BrowserWindow): void {
  if (process.platform !== "win32") return;

  win.webContents.on("before-input-event", (event, input) => {
    if (
      input.type !== "keyDown" ||
      !input.control ||
      input.alt ||
      input.meta ||
      !isPlusKey(input)
    ) {
      return;
    }

    // 显式调整缩放级别，并阻止 Chromium 再次处理同一个按键事件。
    win.webContents.setZoomLevel(
      win.webContents.getZoomLevel() + ZOOM_LEVEL_STEP,
    );
    event.preventDefault();
  });
}

function isPlusKey(input: Electron.KeyboardInputEvent): boolean {
  return (
    input.code === "Equal" ||
    input.code === "NumpadAdd" ||
    input.key === "+" ||
    input.key === "Add"
  );
}
