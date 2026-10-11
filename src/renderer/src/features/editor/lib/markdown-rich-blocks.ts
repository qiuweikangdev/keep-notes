import MarkdownIt from "markdown-it";
import type { MarkdownParser, MarkdownSerializer } from "./markdown";

const START = "<!-- keep-notes:rich-block -->";
const END = "<!-- keep-notes:rich-block-end -->";
const parser = new MarkdownIt({ html: false });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function needsRichMarkdownHTML(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(needsRichMarkdownHTML);
  if (!isRecord(value)) return false;
  const styles = isRecord(value.styles) ? value.styles : {};
  const props = isRecord(value.props) ? value.props : {};
  return (
    styles.underline === true ||
    [
      styles.textColor,
      styles.backgroundColor,
      props.textColor,
      props.backgroundColor,
    ].some((color) => typeof color === "string" && color !== "default") ||
    (value.type !== "tableCell" &&
      typeof props.textAlignment === "string" &&
      props.textAlignment !== "left") ||
    needsRichMarkdownHTML(value.content) ||
    needsRichMarkdownHTML(value.children)
  );
}

export async function serializeRichMarkdownHTML<TBlock>(
  serializer: MarkdownSerializer<TBlock>,
  block: TBlock,
): Promise<string | null> {
  if (!serializer.blocksToFullHTML || !needsRichMarkdownHTML(block))
    return null;
  const template = document.createElement("template");
  template.innerHTML = await serializer.blocksToFullHTML([block]);
  // 文档身份属于会话，不写入源码，避免重开后仅因随机 ID 产生 Git 差异。
  for (const element of template.content.querySelectorAll("[data-id]"))
    element.removeAttribute("data-id");
  if (serializer.blocksToHTMLLossy) {
    const external = document.createElement("template");
    external.innerHTML = await serializer.blocksToHTMLLossy([block]);
    const styles = new Map<string, string>();
    for (const element of external.content.querySelectorAll<HTMLElement>(
      "[data-style-type][data-value]",
    )) {
      styles.set(
        `${element.dataset.styleType}:${element.dataset.value}`,
        element.style.cssText,
      );
    }
    for (const element of template.content.querySelectorAll<HTMLElement>(
      "[data-style-type][data-value]",
    )) {
      const style = styles.get(
        `${element.dataset.styleType}:${element.dataset.value}`,
      );
      if (style) element.style.cssText = style;
    }
  }
  for (const element of template.content.querySelectorAll<HTMLElement>(
    "[data-text-alignment]",
  )) {
    element.style.textAlign = element.dataset.textAlignment ?? "left";
  }
  return `${START}\n${template.innerHTML}\n${END}`;
}

export async function parseRichMarkdownHTML<TBlock>(
  markdownParser: MarkdownParser<TBlock>,
  markdown: string,
  parsePlain: (source: string) => Promise<TBlock[]>,
): Promise<TBlock[] | null> {
  if (!markdownParser.tryParseHTMLToBlocks || !markdown.includes(START))
    return null;
  const offsets = [0];
  for (let index = 0; index < markdown.length; index++)
    if (markdown[index] === "\n") offsets.push(index + 1);
  const codeRanges = parser
    .parse(markdown, {})
    .filter(
      (token) =>
        (token.type === "fence" || token.type === "code_block") && token.map,
    )
    .map((token) => [
      offsets[token.map![0]],
      offsets[token.map![1]] ?? markdown.length,
    ]);
  const matches = [
    ...markdown.matchAll(
      /^<!-- keep-notes:rich-block -->\r?\n([\s\S]*?)\r?\n<!-- keep-notes:rich-block-end -->[ \t]*(?:\r?\n|$)/gmu,
    ),
  ].filter(
    (match) =>
      !codeRanges.some(
        ([start, end]) => match.index >= start && match.index < end,
      ),
  );
  if (!matches.length) return null;
  const blocks: TBlock[] = [];
  let cursor = 0;
  for (const match of matches) {
    const before = markdown.slice(cursor, match.index);
    if (before.trim()) blocks.push(...(await parsePlain(before)));
    // 仅解析本应用明确标记的富文本 HTML；普通 JSX/HTML 源码仍保持原有字面显示。
    blocks.push(...(await markdownParser.tryParseHTMLToBlocks(match[1])));
    cursor = match.index + match[0].length;
  }
  const trailing = markdown.slice(cursor);
  if (trailing.trim()) blocks.push(...(await parsePlain(trailing)));
  return blocks;
}
