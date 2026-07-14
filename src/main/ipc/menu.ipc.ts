import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import { getBrowserWindow } from "../utils";

const MIN_ZOOM_FACTOR = 0.5;
const MAX_ZOOM_FACTOR = 1.5;

export function registerMenuIpc(): void {
  ipcMain.on(IPC_CHANNELS.WINDOW.MINIMIZE, (event) => {
    const win = getBrowserWindow(event);
    win?.minimize();
  });

  ipcMain.on(IPC_CHANNELS.WINDOW.MAXIMIZE, (event) => {
    const win = getBrowserWindow(event);
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  // 窗口关闭由 window.ts 中的 close 事件处理
  // 这里保留兼容性，但实际由 close 事件拦截
  ipcMain.on(IPC_CHANNELS.WINDOW.CLOSE, (event) => {
    const win = getBrowserWindow(event);
    win?.close();
  });

  // 获取窗口位置（用于 JS 拖拽）
  ipcMain.handle(IPC_CHANNELS.WINDOW.GET_POSITION, (event) => {
    const win = getBrowserWindow(event);
    return win?.getPosition() ?? [0, 0];
  });

  // 设置窗口位置（用于 JS 拖拽）
  ipcMain.on(
    IPC_CHANNELS.WINDOW.SET_POSITION,
    (event, x: number, y: number) => {
      const win = getBrowserWindow(event);
      win?.setPosition(x, y);
    },
  );

  // 判断窗口是否最大化
  ipcMain.handle(IPC_CHANNELS.WINDOW.IS_MAXIMIZED, (event) => {
    const win = getBrowserWindow(event);
    return win?.isMaximized() ?? false;
  });

  // 缩放比例只能由主进程修改，避免向渲染进程暴露 WebContents 能力。
  ipcMain.handle(IPC_CHANNELS.WINDOW.GET_ZOOM_FACTOR, (event) => {
    const win = getBrowserWindow(event);
    return win?.webContents.getZoomFactor() ?? 1;
  });

  ipcMain.handle(
    IPC_CHANNELS.WINDOW.SET_ZOOM_FACTOR,
    (event, zoomFactor: number) => {
      const win = getBrowserWindow(event);
      if (!win || !Number.isFinite(zoomFactor)) return 1;

      // 限制用户输入范围，防止过小或过大的缩放影响应用可用性。
      const normalizedZoomFactor = Math.min(
        Math.max(zoomFactor, MIN_ZOOM_FACTOR),
        MAX_ZOOM_FACTOR,
      );
      win.webContents.setZoomFactor(normalizedZoomFactor);
      return normalizedZoomFactor;
    },
  );
}
