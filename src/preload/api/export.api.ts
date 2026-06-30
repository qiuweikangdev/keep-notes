import { ipcRenderer, type IpcRendererEvent } from "electron";
import { IPC_CHANNELS } from "../../shared/constants";
import type { ExportConfig } from "../../shared/types";

export const exportApi = {
  /** 获取当前导出配置 */
  getExportConfig: (): Promise<ExportConfig> =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT.GET_CONFIG),

  /** 保存导出配置 */
  setExportConfig: (config: ExportConfig): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT.SET_CONFIG, config),

  /** 监听导出配置变更事件，返回取消监听函数 */
  onExportConfigChanged: (callback: (config: ExportConfig) => void) => {
    const handler = (_event: IpcRendererEvent, config: ExportConfig) => {
      callback(config);
    };
    ipcRenderer.on(IPC_CHANNELS.EXPORT.ON_CONFIG_CHANGED, handler);
    return () => {
      ipcRenderer.removeListener(
        IPC_CHANNELS.EXPORT.ON_CONFIG_CHANGED,
        handler,
      );
    };
  },
};
