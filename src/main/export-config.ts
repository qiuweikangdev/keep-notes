import fs from "node:fs";
import { app } from "electron";
import { join } from "node:path";
import type {
  ExportConfig,
  ExportDirectoryMode,
  ExportFormat,
} from "../shared/types";
import { DEFAULT_EXPORT_CONFIG, EXPORT_FORMATS } from "../shared/types";

const EXPORT_FORMAT_VALUES = new Set<ExportFormat>(
  EXPORT_FORMATS.map((format) => format.value),
);
const EXPORT_DIRECTORY_MODES = new Set<ExportDirectoryMode>([
  "same-as-source",
  "custom",
]);

export class ExportConfigManager {
  private config: ExportConfig;

  constructor() {
    this.config = this.getDefaultConfig();
  }

  /** 获取当前导出配置副本，避免外部直接修改内存状态 */
  getConfig(): ExportConfig {
    return {
      enabledFormats: [...this.config.enabledFormats],
      defaultDirectoryMode: this.config.defaultDirectoryMode,
      customDirectoryPath: this.config.customDirectoryPath,
      openDirectoryAfterExport: this.config.openDirectoryAfterExport,
    };
  }

  /** 更新内存配置，并兼容旧版本缺失字段或非法值 */
  updateConfig(config: Partial<ExportConfig>): void {
    this.config = this.normalizeConfig(config);
  }

  /** 从用户数据目录加载导出配置，配置文件不存在时使用默认值 */
  async loadConfig(): Promise<ExportConfig> {
    try {
      const content = await fs.promises.readFile(this.getConfigPath(), "utf-8");
      const parsed = JSON.parse(content) as unknown;
      if (parsed && typeof parsed === "object") {
        this.updateConfig(parsed as Partial<ExportConfig>);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("Failed to read export config:", error);
      }
    }
    return this.getConfig();
  }

  /** 保存导出配置到用户数据目录，并同步内存状态 */
  async saveConfig(config: ExportConfig): Promise<void> {
    this.updateConfig(config);
    await fs.promises.mkdir(app.getPath("userData"), { recursive: true });
    await fs.promises.writeFile(
      this.getConfigPath(),
      JSON.stringify(this.config, null, 2),
      "utf-8",
    );
  }

  /** 合并默认配置，并过滤不支持的导出格式 */
  private normalizeConfig(config: Partial<ExportConfig>): ExportConfig {
    const defaultConfig = this.getDefaultConfig();
    const enabledFormats = Array.isArray(config.enabledFormats)
      ? config.enabledFormats.filter((format): format is ExportFormat =>
          EXPORT_FORMAT_VALUES.has(format as ExportFormat),
        )
      : defaultConfig.enabledFormats;
    const defaultDirectoryMode = EXPORT_DIRECTORY_MODES.has(
      config.defaultDirectoryMode as ExportDirectoryMode,
    )
      ? (config.defaultDirectoryMode as ExportDirectoryMode)
      : defaultConfig.defaultDirectoryMode;

    return {
      enabledFormats:
        enabledFormats.length > 0
          ? enabledFormats
          : defaultConfig.enabledFormats,
      defaultDirectoryMode,
      customDirectoryPath:
        typeof config.customDirectoryPath === "string"
          ? config.customDirectoryPath || defaultConfig.customDirectoryPath
          : defaultConfig.customDirectoryPath,
      openDirectoryAfterExport:
        typeof config.openDirectoryAfterExport === "boolean"
          ? config.openDirectoryAfterExport
          : defaultConfig.openDirectoryAfterExport,
    };
  }

  /** 自定义目录默认指向系统下载目录，保证首次选择自定义时有可用路径 */
  private getDefaultConfig(): ExportConfig {
    return {
      ...DEFAULT_EXPORT_CONFIG,
      customDirectoryPath: app.getPath("downloads"),
    };
  }

  /** 获取导出配置文件路径 */
  private getConfigPath(): string {
    return join(app.getPath("userData"), "export-config.json");
  }
}

export const exportConfigManager = new ExportConfigManager();
