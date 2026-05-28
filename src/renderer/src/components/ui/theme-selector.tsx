import * as React from "react";
import { cn } from "@/lib/cn";
import { themes, type ThemeName } from "@/config/themes";

interface ThemeSelectorProps {
  value: ThemeName;
  onChange: (theme: ThemeName) => void;
  className?: string;
}

export function ThemeSelector({
  value,
  onChange,
  className,
}: ThemeSelectorProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const themeNames = Object.keys(themes) as ThemeName[];
  const currentTheme = themes[value];

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 h-9 px-3 pr-8 text-sm rounded-lg transition-all cursor-pointer"
        style={{
          backgroundColor: "var(--bg-tertiary)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
          outline: "none",
          minWidth: "140px",
        }}
      >
        <div
          className="flex items-center justify-center w-5 h-4 rounded-sm text-[10px] font-bold"
          style={{
            backgroundColor: currentTheme.preview.accent,
            color: "#ffffff",
          }}
        >
          Aa
        </div>
        <span>{currentTheme.label}</span>
      </button>

      <div
        className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: "var(--text-muted)" }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1 rounded-lg py-1 z-50 animate-fade-in overflow-hidden"
          style={{
            minWidth: "200px",
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border-color)",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
          }}
        >
          {themeNames.map((name) => {
            const theme = themes[name];
            const isSelected = name === value;
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  onChange(name);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-all"
                style={{
                  backgroundColor: isSelected
                    ? "var(--active-bg)"
                    : "transparent",
                  color: isSelected
                    ? "var(--accent-color)"
                    : "var(--text-primary)",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected)
                    e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected)
                    e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <div
                  className="flex items-center justify-center w-5 h-4 rounded-sm text-[10px] font-bold flex-shrink-0"
                  style={{
                    backgroundColor: theme.preview.accent,
                    color: "#ffffff",
                  }}
                >
                  Aa
                </div>
                <span className="flex-1 text-left">{theme.label}</span>
                {isSelected && (
                  <svg
                    className="w-4 h-4 flex-shrink-0 ml-1"
                    style={{ color: "var(--accent-color)" }}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
