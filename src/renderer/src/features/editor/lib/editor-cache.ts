interface EditorCacheOptions {
  maxEntries: number;
}

interface CachedEditorEntry<TBlocks> {
  content: string | null;
  parsed: {
    source: string;
    parserVersion?: string;
    blocks: TBlocks;
    serializedBaseline?: string;
  } | null;
}

export class EditorCache<TBlocks> {
  private readonly entries = new Map<string, CachedEditorEntry<TBlocks>>();

  constructor(private readonly options: EditorCacheOptions) {}

  getContent(path: string): string | null {
    const entry = this.touch(path);
    return entry?.content ?? null;
  }

  setContent(path: string, content: string): void {
    const entry = this.entries.get(path);
    this.write(path, {
      content,
      parsed:
        entry?.parsed && entry.parsed.source === content ? entry.parsed : null,
    });
  }

  getBlocks(
    path: string,
    source: string,
    parserVersion?: string,
  ): { blocks: TBlocks; serializedBaseline?: string } | null {
    const entry = this.touch(path);
    if (
      !entry?.parsed ||
      entry.parsed.source !== source ||
      entry.parsed.parserVersion !== parserVersion
    ) {
      return null;
    }

    const result: { blocks: TBlocks; serializedBaseline?: string } = {
      blocks: entry.parsed.blocks,
    };
    if (entry.parsed.serializedBaseline !== undefined) {
      result.serializedBaseline = entry.parsed.serializedBaseline;
    }
    return result;
  }

  setBlocks(
    path: string,
    source: string,
    blocks: TBlocks,
    parserVersion?: string,
    serializedBaseline?: string,
  ): void {
    const entry = this.entries.get(path);
    this.write(path, {
      content: entry?.content ?? source,
      parsed: { source, parserVersion, blocks, serializedBaseline },
    });
  }

  setScrollTop(_path: string, _scrollTop: number): void {
    // 编辑器打开文件时始终从顶部开始，解析缓存不再记录滚动位置。
  }

  delete(path: string): void {
    this.entries.delete(path);
  }

  clear(): void {
    this.entries.clear();
  }

  private touch(path: string): CachedEditorEntry<TBlocks> | null {
    const entry = this.entries.get(path);
    if (!entry) {
      return null;
    }

    // Map 保留插入顺序，重新插入即可把本次读取提升为最近使用项。
    this.entries.delete(path);
    this.entries.set(path, entry);
    return entry;
  }

  private write(path: string, entry: CachedEditorEntry<TBlocks>): void {
    this.entries.delete(path);
    this.entries.set(path, entry);

    // 只淘汰最久未使用的完整文件条目，避免内容与解析块分属不同生命周期。
    while (this.entries.size > this.options.maxEntries) {
      const oldestPath = this.entries.keys().next().value;
      if (oldestPath === undefined) {
        break;
      }
      this.entries.delete(oldestPath);
    }
  }
}
