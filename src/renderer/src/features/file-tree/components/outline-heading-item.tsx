import { useCallback } from "react";

interface OutlineHeadingItemProps {
  id: string;
  text: string;
  level: number;
  onClick: (id: string) => void;
}

export function OutlineHeadingItem({
  id,
  text,
  level,
  onClick,
}: OutlineHeadingItemProps) {
  const handleClick = useCallback(() => {
    onClick(id);
  }, [id, onClick]);

  const indent = (level - 1) * 16;

  return (
    <button
      type="button"
      className="flex w-full items-center py-1 text-left text-[13px] transition-colors hover:bg-[var(--hover-bg)]"
      style={{
        paddingLeft: `${12 + indent}px`,
        paddingRight: "12px",
        color: "var(--text-primary)",
      }}
      onClick={handleClick}
    >
      <span className="truncate">{text}</span>
    </button>
  );
}
