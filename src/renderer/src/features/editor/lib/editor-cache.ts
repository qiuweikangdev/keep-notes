interface EditorCacheOptions {
  maxEntries: number;
}

interface CachedEditorEntry<TBlocks> {
  content: string | null;
  parsed: {
    source: string;
    blocks: TBlocks;
    scrollTop: number;
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
  ): { blocks: TBlocks; scrollTop: number } | null {
    const entry = this.touch(path);
    if (!entry?.parsed || entry.parsed.source !== source) {
      return null;
    }

    return {
      blocks: entry.parsed.blocks,
      scrollTop: entry.parsed.scrollTop,
    };
  }

  setBlocks(
    path: string,
    source: string,
    blocks: TBlocks,
    scrollTop: number,
  ): void {
    const entry = this.entries.get(path);
    this.write(path, {
      content: entry?.content ?? source,
      parsed: { source, blocks, scrollTop },
    });
  }

  setScrollTop(path: string, scrollTop: number): void {
    const entry = this.entries.get(path);
    if (!entry?.parsed) {
      return;
    }

    this.write(path, {
      ...entry,
      parsed: { ...entry.parsed, scrollTop },
    });
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
