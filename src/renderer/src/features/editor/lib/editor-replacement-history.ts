export class EditorReplacementHistory {
  private snapshots: Array<{ before: string; after: string }> = [];

  get size(): number {
    return this.snapshots.length;
  }

  push(before: string, after: string): void {
    this.snapshots.push({ before, after });
  }

  pop(currentContent: string): string | null {
    const latest = this.snapshots.at(-1);
    // 替换后若还有其他编辑或外部同步，旧整篇快照不能覆盖这些更新。
    if (!latest || latest.after !== currentContent) return null;
    this.snapshots.pop();
    return latest.before;
  }

  clear(): void {
    this.snapshots.length = 0;
  }
}
