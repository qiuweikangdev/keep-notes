import { Check, ChevronDown, Monitor } from "lucide-react";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import {
  getThemeConfig,
  resolveTheme,
  themeOptions,
  type ThemeName,
} from "@/config/themes";
import { cn } from "@/lib/cn";

interface ThemeSelectorProps {
  value: ThemeName;
  onChange: (theme: ThemeName) => void;
  className?: string;
}

function ThemePreview({ theme }: { theme: ThemeName }) {
  if (theme === "system") {
    return (
      <span
        aria-hidden="true"
        data-theme-preview={theme}
        className="flex h-4 w-5 shrink-0 items-center justify-center rounded-[4px] border"
        style={{
          backgroundColor: "var(--bg-tertiary)",
          borderColor: "var(--border-color)",
          color: "var(--text-secondary)",
        }}
      >
        <Monitor className="h-3 w-3" strokeWidth={1.75} />
      </span>
    );
  }

  const config = getThemeConfig(resolveTheme(theme));

  return (
    <span
      aria-hidden="true"
      data-theme-preview={theme}
      className="relative h-4 w-5 shrink-0 overflow-hidden rounded-[4px] border"
      style={{
        backgroundColor: config.preview.bg,
        borderColor: config.colors.borderColor,
      }}
    >
      <span
        className="absolute inset-y-0 left-0 w-[7px]"
        style={{ backgroundColor: config.preview.sidebar }}
      />
      <span
        aria-hidden="true"
        data-theme-preview-accent="true"
        className="absolute left-[10px] top-[4px] h-px w-[6px] rounded-full"
        style={{ backgroundColor: config.preview.accent }}
      />
      <span
        aria-hidden="true"
        className="absolute left-[10px] top-[7px] h-px w-[7px] rounded-full"
        style={{
          backgroundColor: config.preview.text,
          opacity: 0.55,
        }}
      />
      <span
        aria-hidden="true"
        className="absolute left-[10px] top-[10px] h-px w-[5px] rounded-full"
        style={{
          backgroundColor: config.preview.text,
          opacity: 0.35,
        }}
      />
    </span>
  );
}

export function ThemeSelector({
  value,
  onChange,
  className,
}: ThemeSelectorProps) {
  const selectedOption =
    themeOptions.find((option) => option.value === value) ?? themeOptions[0];

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`选择主题，当前为${selectedOption.label}`}
          className={cn(
            "theme-dropdown-trigger flex h-8 min-w-[160px] items-center gap-2 rounded-md px-2.5 text-xs outline-none",
            className,
          )}
        >
          <ThemePreview theme={value} />
          <span className="flex-1 text-left">{selectedOption.label}</span>
          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={5}
          className="theme-dropdown-content z-[120] min-w-[190px] rounded-lg p-1 outline-none"
        >
          {themeOptions.map((option) => {
            const isSelected = option.value === value;

            return (
              <DropdownMenu.Item
                key={option.value}
                data-selected={isSelected ? "true" : undefined}
                onSelect={() => onChange(option.value)}
                className="theme-dropdown-item flex cursor-default select-none items-center gap-2.5 rounded-md px-2 py-1.5 text-xs outline-none"
              >
                <ThemePreview theme={option.value} />
                <span className="flex-1">{option.label}</span>
                {isSelected ? (
                  <Check
                    aria-hidden="true"
                    className="h-3.5 w-3.5"
                    style={{ color: "var(--accent-color)" }}
                  />
                ) : null}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
