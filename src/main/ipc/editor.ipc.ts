import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import { getBrowserWindow } from "../utils";

// 主进程缓存的脏状态
let cachedDirtyState = false;

export function registerEditorIpc(): void {
  // 渲染进程通知主进程脏状态变化
  ipcMain.on(
    IPC_CHANNELS.EDITOR.UPDATE_DIRTY_STATE,
    (_event, isDirty: boolean) => {
      cachedDirtyState = isDirty;
    },
  );

  // 保存草稿
  ipcMain.handle(
    IPC_CHANNELS.EDITOR.SAVE_DRAFT,
    async (event): Promise<boolean> => {
      try {
        const win = getBrowserWindow(event);
        if (!win) return false;

        const result = await win.webContents.executeJavaScript(
          "typeof window.__saveDraft === 'function' ? window.__saveDraft() : false",
        );
        return result !== false;
      } catch (error) {
        console.error("Error saving draft:", error);
        return false;
      }
    },
  );
}

// 导出给 window.ts 使用
export function getCachedDirtyState(): boolean {
  return cachedDirtyState;
}

export function setCachedDirtyState(state: boolean): void {
  cachedDirtyState = state;
}
