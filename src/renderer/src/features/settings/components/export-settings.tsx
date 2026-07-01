import { useEffect } from "react";
import { Check, ChevronDown, FolderOpen } from "lucide-react";
import { useExportStore } from "@/store/export.store";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { EXPORT_FORMATS } from "@/types";
import type { ExportDirectoryMode, ExportFormat } from "@/types";

interface ExportSettingsProps {
  portalContainer?: HTMLElement | null;
}

const directoryOptions: Array<{
  value: ExportDirectoryMode;
  label: string;
}> = [
  { value: "same-as-source", label: "和原文件同一目录下" },
  { value: "custom", label: "自定义" },
];

const DROPDOWN_CONTENT_CLASS =
  "z-[60] min-w-[220px] rounded-md border p-1 shadow-lg bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-primary)]";
const DROPDOWN_ITEM_CLASS =
  "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-[var(--hover-bg)]";
const EXPORT_SETTING_ROW_CLASS = "grid grid-cols-[180px_1fr] gap-4 py-3.5";

function getFormatSummary(enabledFormats: ExportFormat[]): string {
  const labels = EXPORT_FORMATS.filter((format) =>
    enabledFormats.includes(format.value),
  ).map((format) => format.label);

  if (labels.length === 0) return "请选择格式";
  if (labels.length <= 2) return labels.join("、");
  return `${labels.slice(0, 2).join("、")} 等 ${labels.length} 项`;
}

function getDirectoryLabel(mode: ExportDirectoryMode): string {
  return (
    directoryOptions.find((option) => option.value === mode)?.label ??
    directoryOptions[0].label
  );
}

export function ExportSettings({ portalContainer }: ExportSettingsProps) {
  const { config, loadConfig, updateConfig, subscribeToChanges } =
    useExportStore();

  useEffect(() => {
    void loadConfig();
    const unsubscribe = subscribeToChanges();
    return unsubscribe;
  }, [loadConfig, subscribeToChanges]);

  /** 切换导出格式，至少保留一种格式用于后续导出动作 */
  const handleToggleFormat = (format: ExportFormat, checked: boolean) => {
    const nextFormats = checked
      ? Array.from(new Set([...config.enabledFormats, format]))
      : config.enabledFormats.filter((item) => item !== format);

    if (nextFormats.length === 0) return;
    void updateConfig({ enabledFormats: nextFormats });
  };

  /** 选择自定义导出目录，并把目录路径写入配置 */
  const handleSelectCustomDirectory = async () => {
    const selectedPath = await window.electronAPI.getSelectedPath();
    if (!selectedPath) return;

    await updateConfig({
      defaultDirectoryMode: "custom",
      customDirectoryPath: selectedPath,
    });
  };

  return (
    <div className="space-y-0">
      <div style={{ borderBottom: "1px solid var(--border-color)" }}>
        <div
          data-testid="export-format-row"
          className={`${EXPORT_SETTING_ROW_CLASS} items-start`}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-sm" style={{ color: "var(--text-primary)" }}>
              导出格式
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              选择后续导出功能可用的文件格式
            </span>
          </div>
          <DropdownMenu.Root modal={false}>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label="导出格式"
                className="flex h-8 w-full items-center justify-between gap-2 rounded-md px-2.5 text-sm outline-none transition-colors"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <span className="truncate">
                  {getFormatSummary(config.enabledFormats)}
                </span>
                <ChevronDown
                  className="h-4 w-4 flex-shrink-0"
                  style={{ color: "var(--text-muted)" }}
                />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal container={portalContainer}>
              <DropdownMenu.Content
                aria-label="导出格式"
                data-export-settings-dropdown
                align="end"
                sideOffset={6}
                className={DROPDOWN_CONTENT_CLASS}
              >
                {EXPORT_FORMATS.map((format) => (
                  <DropdownMenu.CheckboxItem
                    key={format.value}
                    checked={config.enabledFormats.includes(format.value)}
                    onCheckedChange={(checked) =>
                      handleToggleFormat(format.value, checked)
                    }
                    onSelect={(event) => event.preventDefault()}
                    className={DROPDOWN_ITEM_CLASS}
                  >
                    <span className="flex h-4 w-4 items-center justify-center">
                      {config.enabledFormats.includes(format.value) ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : null}
                    </span>
                    {format.label}
                  </DropdownMenu.CheckboxItem>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      <div style={{ borderBottom: "1px solid var(--border-color)" }}>
        <div
          data-testid="export-directory-row"
          className={`${EXPORT_SETTING_ROW_CLASS} items-start`}
        >
          <label className="text-sm" style={{ color: "var(--text-primary)" }}>
            默认的导出文件夹
          </label>
          <div className="space-y-2">
            <DropdownMenu.Root modal={false}>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  aria-label="默认的导出文件夹"
                  className="flex h-8 w-full items-center justify-between gap-2 rounded-md px-2.5 text-sm outline-none transition-colors"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  <span className="truncate">
                    {getDirectoryLabel(config.defaultDirectoryMode)}
                  </span>
                  <ChevronDown
                    className="h-4 w-4 flex-shrink-0"
                    style={{ color: "var(--text-muted)" }}
                  />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal container={portalContainer}>
                <DropdownMenu.Content
                  aria-label="默认的导出文件夹"
                  data-export-settings-dropdown
                  align="end"
                  sideOffset={6}
                  className={DROPDOWN_CONTENT_CLASS}
                >
                  {directoryOptions.map((option) => (
                    <DropdownMenu.Item
                      key={option.value}
                      className={DROPDOWN_ITEM_CLASS}
                      onSelect={() =>
                        void updateConfig({
                          defaultDirectoryMode: option.value,
                        })
                      }
                    >
                      <span className="flex h-4 w-4 items-center justify-center">
                        {config.defaultDirectoryMode === option.value ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : null}
                      </span>
                      {option.label}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>

            {config.defaultDirectoryMode === "custom" ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={config.customDirectoryPath}
                  placeholder="请选择导出文件夹"
                  className="h-8 flex-1 rounded-md px-2 text-sm"
                  style={{
                    backgroundColor: "var(--bg-tertiary)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  aria-label="选择自定义导出文件夹"
                  title="选择自定义导出文件夹"
                  onClick={() => void handleSelectCustomDirectory()}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
                  style={{
                    backgroundColor: "transparent",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  <FolderOpen className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div>
        <div
          data-testid="export-after-row"
          className={`${EXPORT_SETTING_ROW_CLASS} items-center`}
        >
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>
            导出后
          </span>
          <label
            className="flex items-center gap-2 text-sm"
            style={{ color: "var(--text-primary)" }}
          >
            <Switch
              checked={config.openDirectoryAfterExport}
              onCheckedChange={(checked) =>
                void updateConfig({
                  openDirectoryAfterExport: checked,
                })
              }
            />
            打开导出文件所在目录
          </label>
        </div>
      </div>
    </div>
  );
}
