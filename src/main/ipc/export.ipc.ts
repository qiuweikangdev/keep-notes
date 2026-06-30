import { BrowserWindow, ipcMain } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type { ExportConfig } from "../../shared/types";
import { exportConfigManager } from "../export-config";

/** 向所有窗口广播导出配置变更 */
function broadcastConfig(config: ExportConfig): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.EXPORT.ON_CONFIG_CHANGED, config);
    }
  });
}

/** 初始化导出配置 IPC，从持久化存储加载配置 */
export async function initializeExportIpc(): Promise<void> {
  await exportConfigManager.loadConfig();
}

/** 注册导出配置相关 IPC 处理器 */
export function registerExportIpc(): void {
  // 获取当前导出配置
  ipcMain.handle(IPC_CHANNELS.EXPORT.GET_CONFIG, async () => {
    return exportConfigManager.getConfig();
  });

  // 保存导出配置并广播变更
  ipcMain.handle(
    IPC_CHANNELS.EXPORT.SET_CONFIG,
    async (_, config: ExportConfig) => {
      await exportConfigManager.saveConfig(config);
      broadcastConfig(exportConfigManager.getConfig());
    },
  );
}
