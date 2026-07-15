import { ipcMain, type BrowserWindow } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import { getBrowserWindow } from "../utils";

const dirtyStateByWebContentsId = new Map<number, boolean>();

export function registerEditorIpc(): void {
  // 渲染进程通知主进程脏状态变化
  ipcMain.on(
    IPC_CHANNELS.EDITOR.UPDATE_DIRTY_STATE,
    (event, isDirty: boolean) => {
      const senderId = event.sender.id;

      if (!dirtyStateByWebContentsId.has(senderId)) {
        // 每个渲染进程只注册一次销毁清理，避免缓存和监听器随脏状态更新持续增长。
        event.sender.once("destroyed", () => {
          dirtyStateByWebContentsId.delete(senderId);
        });
      }

      dirtyStateByWebContentsId.set(senderId, isDirty);
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

// 关闭检查只能读取当前窗口对应的渲染进程状态，避免多窗口互相覆盖。
export function getCachedDirtyState(win: BrowserWindow): boolean {
  return dirtyStateByWebContentsId.get(win.webContents.id) ?? false;
}
