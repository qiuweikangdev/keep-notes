import * as React from "react";
import { cn } from "@/lib/cn";

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingRow({
  label,
  description,
  children,
  className,
}: SettingRowProps) {
  return (
    <div
      className={cn("flex items-center justify-between py-3.5", className)}
      style={{ borderBottom: "1px solid var(--border-color)" }}
    >
      <div className="flex flex-col gap-0.5 mr-4">
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
          {label}
        </span>
        {description && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {description}
          </span>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}
