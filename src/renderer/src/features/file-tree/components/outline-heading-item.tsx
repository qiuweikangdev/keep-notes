import { forwardRef, memo, useCallback } from "react";
import { cn } from "@/lib/cn";

interface OutlineHeadingItemProps {
  id: string;
  text: string;
  level: number;
  isActive: boolean;
  onClick: (id: string) => void;
  compact?: boolean;
}

const OutlineHeadingItemBase = forwardRef<
  HTMLButtonElement,
  OutlineHeadingItemProps
>(function OutlineHeadingItem(
  { id, text, level, isActive, onClick, compact = false },
  ref,
) {
  const handleClick = useCallback(() => {
    onClick(id);
  }, [id, onClick]);

  const indent = (level - 1) * 16;

  return (
    <button
      ref={ref}
      type="button"
      aria-current={isActive ? "location" : undefined}
      data-selected={isActive ? "true" : undefined}
      data-selection-surface="true"
      data-selection-context="secondary"
      className={cn(
        "flex w-full items-center text-left text-[13px] transition-colors duration-200",
        compact ? "py-1" : "py-1.5",
        isActive
          ? "bg-[var(--file-tree-row-selected)] text-[var(--text-primary)] font-medium"
          : "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--file-tree-row-hover)] hover:text-[var(--text-primary)]",
      )}
      style={{
        paddingLeft: `${12 + indent}px`,
        paddingRight: "12px",
      }}
      onClick={handleClick}
    >
      <span className="truncate">{text}</span>
    </button>
  );
});

export const OutlineHeadingItem = memo(OutlineHeadingItemBase);
