import * as React from "react";
import { cn } from "@/lib/cn";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
  disabled?: boolean;
  inputAriaLabel?: string;
  swatchAriaLabel?: string;
}

export function ColorPicker({
  value,
  onChange,
  className,
  disabled = false,
  inputAriaLabel,
  swatchAriaLabel,
}: ColorPickerProps) {
  const [showInput, setShowInput] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      onChange(val);
    }
  };

  const handleInputBlur = () => {
    setInputValue(value);
    setShowInput(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (/^#[0-9A-Fa-f]{6}$/.test(inputValue)) {
        onChange(inputValue);
      }
      setShowInput(false);
    }
    if (e.key === "Escape") {
      setInputValue(value);
      setShowInput(false);
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* 通过原生取色器快速选择颜色，同时保留右侧 HEX 手动输入。 */}
      <input
        aria-label={swatchAriaLabel}
        type="color"
        value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#ffffff"}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="h-8 w-8 flex-shrink-0 cursor-pointer rounded-full border-2 bg-transparent p-0 transition-all hover:ring-2 hover:ring-[var(--accent-color)] disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          borderColor: "var(--border-color)",
        }}
      />

      {/* Hex input */}
      <input
        ref={inputRef}
        aria-label={inputAriaLabel}
        type="text"
        value={showInput ? inputValue : value}
        disabled={disabled}
        onChange={handleInputChange}
        onFocus={() => setShowInput(true)}
        onBlur={handleInputBlur}
        onKeyDown={handleInputKeyDown}
        className="w-[90px] h-9 px-3 text-sm rounded-lg font-mono transition-all disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          backgroundColor: "var(--bg-tertiary)",
          border: showInput
            ? "1px solid var(--accent-color)"
            : "1px solid var(--border-color)",
          color: "var(--text-primary)",
          outline: "none",
        }}
      />
    </div>
  );
}
