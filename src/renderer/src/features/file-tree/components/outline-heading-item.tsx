import { useCallback } from "react";

interface OutlineHeadingItemProps {
  id: string;
  text: string;
  level: number;
  isActive: boolean;
  onClick: (id: string) => void;
}

export function OutlineHeadingItem({
  id,
  text,
  level,
  isActive,
  onClick,
}: OutlineHeadingItemProps) {
  const handleClick = useCallback(() => {
    onClick(id);
  }, [id, onClick]);

  const indent = (level - 1) * 16;

  return (
    <button
      type="button"
      className="flex w-full items-center py-1 text-left text-[13px] transition-colors"
      style={{
        paddingLeft: `${12 + indent}px`,
        paddingRight: "12px",
        color: isActive ? "var(--accent-color)" : "var(--text-primary)",
        backgroundColor: isActive ? "var(--hover-bg)" : "transparent",
        fontWeight: isActive ? 500 : 400,
      }}
      onClick={handleClick}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "var(--hover-bg)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      <span className="truncate">{text}</span>
    </button>
  );
}
