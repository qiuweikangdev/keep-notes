import { forwardRef, useCallback } from "react";

interface OutlineHeadingItemProps {
  id: string;
  text: string;
  level: number;
  isActive: boolean;
  onClick: (id: string) => void;
}

export const OutlineHeadingItem = forwardRef<
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
      className="flex w-full items-center py-1.5 text-left text-[13px] transition-all duration-200"
      style={{
        paddingLeft: `${12 + indent}px`,
        paddingRight: "12px",
        color: isActive ? "var(--accent-color)" : "var(--text-secondary)",
        backgroundColor: isActive
          ? "color-mix(in srgb, var(--accent-color) 10%, transparent)"
          : "transparent",
        fontWeight: isActive ? 500 : 400,
        borderRight: isActive
          ? "2px solid var(--accent-color)"
          : "2px solid transparent",
      }}
      onClick={handleClick}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "var(--hover-bg)";
          e.currentTarget.style.color = "var(--text-primary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "transparent";
          e.currentTarget.style.color = "var(--text-secondary)";
        }
      }}
    >
      <span className="truncate">{text}</span>
    </button>
  );
});
