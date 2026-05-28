import * as React from "react";
import { cn } from "@/lib/cn";

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  className?: string;
}

export function ColorPicker({ value, onChange, className }: ColorPickerProps) {
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
      {/* Color swatch */}
      <button
        type="button"
        className="relative w-8 h-8 rounded-full border-2 overflow-hidden flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-[var(--accent-color)] transition-all"
        style={{
          borderColor: "var(--border-color)",
        }}
        onClick={() => {
          setShowInput(!showInput);
          setTimeout(() => inputRef.current?.focus(), 100);
        }}
      >
        <div className="absolute inset-0" style={{ backgroundColor: value }} />
      </button>

      {/* Hex input */}
      <input
        ref={inputRef}
        type="text"
        value={showInput ? inputValue : value}
        onChange={handleInputChange}
        onFocus={() => setShowInput(true)}
        onBlur={handleInputBlur}
        onKeyDown={handleInputKeyDown}
        className="w-[90px] h-9 px-3 text-sm rounded-lg font-mono transition-all"
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
