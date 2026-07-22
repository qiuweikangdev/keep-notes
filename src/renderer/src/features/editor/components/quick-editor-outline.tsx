import { OutlinePanel } from "@/features/file-tree/components/outline-panel";

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
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "string") {
        return record.text;
      }
      return readInlineText(record.content);
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
  resetKey: string | null;
  onHeadingSelect: (id: string) => void;
}

export function QuickEditorOutline(props: QuickEditorOutlineProps) {
  return (
    <nav aria-label="文档大纲" className="quick-editor-outline">
      <div className="quick-editor-outline__header">
        <span>大纲</span>
      </div>
      <div className="quick-editor-outline__content">
        <OutlinePanel
          headings={props.headings}
          activeHeadingId={props.activeHeadingId}
          resetKey={props.resetKey}
          onHeadingClick={props.onHeadingSelect}
        />
      </div>
    </nav>
  );
}
