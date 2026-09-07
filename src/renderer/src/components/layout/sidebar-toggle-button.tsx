import type { CSSProperties, MouseEventHandler } from "react";
import { cn } from "@/lib/cn";

interface SidebarToggleIconProps {
  collapsed: boolean;
}

export function SidebarToggleIcon({ collapsed }: SidebarToggleIconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <line
        x1="5"
        y1="6"
        x2="5"
        y2="10"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {!collapsed && (
        <line
          x1="8"
          y1="6"
          x2="8"
          y2="10"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      )}
    </svg>
  );
}

interface SidebarToggleButtonProps {
  collapsed: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  label?: string;
  className?: string;
  style?: CSSProperties;
}

export function SidebarToggleButton({
  collapsed,
  onClick,
  label,
  className,
  style,
}: SidebarToggleButtonProps) {
  const accessibleLabel = label ?? (collapsed ? "展开侧边栏" : "收起侧边栏");

  return (
    <button
      type="button"
      aria-label={accessibleLabel}
      aria-expanded={!collapsed}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md transition-all",
        className,
      )}
      style={{ color: "var(--text-muted)", ...style }}
      onMouseEnter={(event) => {
        event.currentTarget.style.backgroundColor = "var(--hover-bg)";
        event.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.backgroundColor = "transparent";
        event.currentTarget.style.color = "var(--text-muted)";
      }}
      title={accessibleLabel}
    >
      <SidebarToggleIcon collapsed={collapsed} />
    </button>
  );
}
