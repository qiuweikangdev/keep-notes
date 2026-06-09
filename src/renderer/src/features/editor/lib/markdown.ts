export interface MarkdownParser<TBlock> {
  tryParseMarkdownToBlocks(markdown: string): Promise<TBlock[]> | TBlock[];
}

export interface MarkdownSerializer<TBlock> {
  blocksToMarkdownLossy(blocks: TBlock[]): Promise<string> | string;
}

export function markdownEquals(left: string, right: string): boolean {
  return left === right;
}

export function ensureEditableBlocks<TBlock>(
  blocks: TBlock[],
  createBlankBlock: () => TBlock,
): TBlock[] {
  return blocks.length > 0 ? blocks : [createBlankBlock()];
}

export async function parseMarkdown<TBlock>(
  parser: MarkdownParser<TBlock>,
  markdown: string,
): Promise<TBlock[]> {
  // 解析器只读取源码，不能在打开文件时改写换行、空格或列表标记。
  return parser.tryParseMarkdownToBlocks(markdown);
}

export async function serializeMarkdown<TBlock>(
  serializer: MarkdownSerializer<TBlock>,
  blocks: TBlock[],
): Promise<string> {
  return serializer.blocksToMarkdownLossy(blocks);
}
