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
  private parsedHits = 0;
  private parsedMisses = 0;
  private readonly invalidatedPaths = new Set<string>();

  constructor(private readonly options: EditorCacheOptions) {}

  getContent(path: string): string | null {
    path = path.replaceAll("\\", "/");
    const entry = this.touch(path);
    return entry?.content ?? null;
  }

  setContent(path: string, content: string): void {
    path = path.replaceAll("\\", "/");
    const entry = this.entries.get(path);
    this.write(path, {
      content,
      parsed:
        entry?.parsed && entry.parsed.source === content ? entry.parsed : null,
    });
  }

  hasParsedSource(path: string, source: string): boolean {
    path = path.replaceAll("\\", "/");
    const entry = this.touch(path);
    return !this.invalidatedPaths.has(path) && entry?.parsed?.source === source;
  }

  invalidateBlocks(path: string): void {
    path = path.replaceAll("\\", "/");
    this.invalidatedPaths.add(path);
    const entry = this.entries.get(path);
    if (entry) this.entries.set(path, { ...entry, parsed: null });
  }

  finishReparse(path: string): void {
    path = path.replaceAll("\\", "/");
    this.invalidatedPaths.delete(path);
  }

  getBlocks(
    path: string,
    source: string,
    parserVersion?: string,
  ): { blocks: TBlocks; serializedBaseline?: string } | null {
    path = path.replaceAll("\\", "/");
    const entry = this.touch(path);
    if (
      this.invalidatedPaths.has(path) ||
      !entry?.parsed ||
      entry.parsed.source !== source ||
      entry.parsed.parserVersion !== parserVersion
    ) {
      this.parsedMisses += 1;
      return null;
    }

    this.parsedHits += 1;
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
    path = path.replaceAll("\\", "/");
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
    path = path.replaceAll("\\", "/");
    this.entries.delete(path);
    this.invalidatedPaths.delete(path);
  }

  clear(): void {
    this.entries.clear();
    this.invalidatedPaths.clear();
    this.parsedHits = 0;
    this.parsedMisses = 0;
  }

  getDiagnostics() {
    return {
      entries: this.entries.size,
      parsedHits: this.parsedHits,
      parsedMisses: this.parsedMisses,
      sourceCharacters: [...this.entries.values()].reduce(
        (count, entry) => count + (entry.content?.length ?? 0),
        0,
      ),
    };
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
      this.invalidatedPaths.delete(oldestPath);
    }
  }
}
