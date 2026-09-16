import { cn } from "@/lib/cn";

interface FontSelectorProps {
  value: string;
  onChange: (font: string) => void;
  options: { label: string; value: string }[];
  className?: string;
}

export function FontSelector({
  value,
  onChange,
  options,
  className,
}: FontSelectorProps) {
  return (
    <div className={cn("relative", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="theme-select h-9 min-w-[120px] cursor-pointer appearance-none rounded-lg px-3 pr-8 text-sm"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
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
    </div>
  );
}
