import { forwardRef, memo, useCallback } from "react";
import { cn } from "@/lib/cn";

interface OutlineHeadingItemProps {
  id: string;
  text: string;
  level: number;
  isActive: boolean;
  onClick: (id: string) => void;
}

const OutlineHeadingItemBase = forwardRef<
  HTMLButtonElement,
  OutlineHeadingItemProps
>(function OutlineHeadingItem({ id, text, level, isActive, onClick }, ref) {
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
      className={cn(
        "flex w-full items-center py-1.5 text-left text-[13px] transition-colors duration-200",
        isActive
          ? "bg-[var(--file-tree-row-selected)] text-[var(--accent-color)] font-medium"
          : "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--file-tree-row-hover)] hover:text-[var(--text-primary)]",
      )}
      style={{
        paddingLeft: `${12 + indent}px`,
        paddingRight: "12px",
        borderRight: isActive
          ? "2px solid var(--accent-color)"
          : "2px solid transparent",
      }}
      onClick={handleClick}
    >
      <span className="truncate">{text}</span>
    </button>
  );
});

export const OutlineHeadingItem = memo(OutlineHeadingItemBase);
