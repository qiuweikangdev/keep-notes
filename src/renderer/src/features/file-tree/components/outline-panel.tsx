import { OutlineHeadingItem } from "./outline-heading-item";

interface Heading {
  id: string;
  text: string;
  level: number;
}

interface OutlinePanelProps {
  headings: Heading[];
  onHeadingClick: (id: string) => void;
}

export function OutlinePanel({ headings, onHeadingClick }: OutlinePanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto py-2">
        {headings.length === 0 ? (
          <div
            className="px-3 py-2 text-[13px]"
            style={{ color: "var(--text-muted)" }}
          >
            暂无标题
          </div>
        ) : (
          headings.map((heading) => (
            <OutlineHeadingItem
              key={heading.id}
              id={heading.id}
              text={heading.text}
              level={heading.level}
              onClick={onHeadingClick}
            />
          ))
        )}
      </div>
    </div>
  );
}
