export interface QuickEditorOutlineHeading {
  id: string;
  level: number;
  text: string;
}

interface QuickEditorOutlineBlock {
  id: string;
  type: string;
  props?: { level?: number };
  content?: unknown;
  children?: QuickEditorOutlineBlock[];
}

function readInlineText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      return record.type === "text" && typeof record.text === "string"
        ? record.text
        : "";
    })
    .join("");
}

export function extractQuickEditorOutlineHeadings(
  blocks: readonly QuickEditorOutlineBlock[],
): QuickEditorOutlineHeading[] {
  const headings: QuickEditorOutlineHeading[] = [];
  // 深度优先遍历以保持父标题先于子标题的文档顺序。
  const visit = (items: readonly QuickEditorOutlineBlock[]) => {
    for (const block of items) {
      if (block.type === "heading") {
        headings.push({
          id: block.id,
          level: block.props?.level ?? 1,
          text: readInlineText(block.content),
        });
      }
      if (block.children?.length) visit(block.children);
    }
  };
  visit(blocks);
  return headings;
}

interface QuickEditorOutlineProps {
  headings: QuickEditorOutlineHeading[];
  activeHeadingId: string | null;
  onHeadingSelect: (id: string) => void;
}

export function QuickEditorOutline(props: QuickEditorOutlineProps) {
  return (
    <nav aria-label="文档大纲" className="quick-editor-outline">
      <div className="quick-editor-outline__header">大纲</div>
      <div className="quick-editor-outline__list">
        {props.headings.length === 0 ? (
          <div className="quick-editor-outline__empty">暂无标题</div>
        ) : (
          props.headings.map((heading) => (
            <button
              key={heading.id}
              type="button"
              className="quick-editor-outline__item"
              data-active={heading.id === props.activeHeadingId || undefined}
              style={{ paddingLeft: `${12 + (heading.level - 1) * 16}px` }}
              onClick={() => props.onHeadingSelect(heading.id)}
            >
              <span>{heading.text || "未命名标题"}</span>
            </button>
          ))
        )}
      </div>
    </nav>
  );
}
