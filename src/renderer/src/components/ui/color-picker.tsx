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
  const colorInputRef = React.useRef<HTMLInputElement>(null);
  const normalizedColor = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#ffffff";
  const pickerAriaLabel = swatchAriaLabel
    ? `${swatchAriaLabel}取色器`
    : undefined;

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
      {/* 隐藏浏览器原生色块外观，只借用原生取色器能力。 */}
      <input
        ref={colorInputRef}
        aria-label={pickerAriaLabel}
        type="color"
        value={normalizedColor}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="sr-only"
      />
      <button
        type="button"
        aria-label={swatchAriaLabel}
        data-color-swatch="true"
        disabled={disabled}
        onClick={() => colorInputRef.current?.click()}
        className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-all hover:ring-2 hover:ring-[var(--accent-color)] disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          backgroundColor: "var(--bg-tertiary)",
          border: "1px solid var(--border-color)",
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.06)",
        }}
      >
        <span
          className="h-5 w-5 rounded-sm"
          style={{
            backgroundColor: normalizedColor,
            border: "1px solid rgba(255, 255, 255, 0.28)",
          }}
        />
      </button>

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
