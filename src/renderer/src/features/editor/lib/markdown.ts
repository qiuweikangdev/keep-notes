export interface MarkdownParser<TBlock> {
  tryParseMarkdownToBlocks(markdown: string): Promise<TBlock[]> | TBlock[];
}

export interface MarkdownSerializer<TBlock> {
  blocksToMarkdownLossy(blocks: TBlock[]): Promise<string> | string;
}

export function normalizeMarkdownListMarkers(markdown: string): string {
  return markdown.replace(/^(\s*)\*(?=\s)/gm, "$1-");
}

export function normalizeMarkdown(markdown: string): string {
  const normalized = normalizeMarkdownListMarkers(markdown)
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n+$/g, "");

  return normalized ? `${normalized}\n` : "";
}

export function markdownEquals(left: string, right: string): boolean {
  return normalizeMarkdown(left) === normalizeMarkdown(right);
}

export async function parseMarkdown<TBlock>(
  parser: MarkdownParser<TBlock>,
  markdown: string,
): Promise<TBlock[]> {
  return parser.tryParseMarkdownToBlocks(normalizeMarkdown(markdown));
}

export async function serializeMarkdown<TBlock>(
  serializer: MarkdownSerializer<TBlock>,
  blocks: TBlock[],
): Promise<string> {
  const markdown = await serializer.blocksToMarkdownLossy(blocks);

  return normalizeMarkdown(markdown);
}
