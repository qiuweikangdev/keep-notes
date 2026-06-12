export type EditorSaveState = "dirty" | "saving" | "clean" | "error";

interface EditorSaveCoordinatorOptions {
  delayMs: number;
  write: (path: string, content: string) => Promise<void>;
  onStateChange?: (path: string, state: EditorSaveState, error?: Error) => void;
}

interface PendingSave {
  content: string;
  revision: number;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<boolean> | null;
}

interface OwnWriteRecord {
  content: string;
  expiresAt: number;
}

const OWN_WRITE_TTL_MS = 2_000;

export class EditorSaveCoordinator {
  private revision = 0;
  private readonly pending = new Map<string, PendingSave>();
  private readonly ownWrites = new Map<string, OwnWriteRecord[]>();

  constructor(private readonly options: EditorSaveCoordinatorOptions) {}

  schedule(path: string, content: string): number {
    const revision = ++this.revision;
    const current = this.pending.get(path);
    if (current?.timer) {
      clearTimeout(current.timer);
    }

    const pending: PendingSave = current ?? {
      content,
      revision,
      timer: null,
      inFlight: null,
    };
    pending.content = content;
    pending.revision = revision;
    pending.timer = setTimeout(() => {
      pending.timer = null;
      void this.flush(path);
    }, this.options.delayMs);
    this.pending.set(path, pending);
    this.options.onStateChange?.(path, "dirty");
    return revision;
  }

  hasPending(path: string): boolean {
    return this.pending.has(path);
  }

  async flush(path: string): Promise<boolean> {
    const pending = this.pending.get(path);
    if (!pending) {
      return true;
    }

    if (pending.timer) {
      clearTimeout(pending.timer);
      pending.timer = null;
    }

    // 同一路径只允许一个写盘任务运行，显式 flush 会等待旧写入后继续保存新版本。
    if (pending.inFlight) {
      const succeeded = await pending.inFlight;
      if (!succeeded) {
        return false;
      }
      return this.pending.has(path) ? this.flush(path) : true;
    }

    const snapshot = {
      content: pending.content,
      revision: pending.revision,
    };
    this.options.onStateChange?.(path, "saving");

    const writePromise = this.persist(path, pending, snapshot);
    pending.inFlight = writePromise;
    return writePromise;
  }

  async flushAll(): Promise<void> {
    await Promise.all([...this.pending.keys()].map((path) => this.flush(path)));
  }

  cancel(path: string): void {
    const pending = this.pending.get(path);
    if (pending?.timer) {
      clearTimeout(pending.timer);
    }
    this.pending.delete(path);
  }

  isOwnWrite(path: string, content: string): boolean {
    const recentWrites = this.pruneExpiredOwnWrites(path);
    if (!recentWrites) {
      return false;
    }

    // fs.watch 可能为同一次写盘连续触发多个 change，窗口期内需保持幂等识别。
    return recentWrites.some((write) => write.content === content);
  }

  private async persist(
    path: string,
    pending: PendingSave,
    snapshot: { content: string; revision: number },
  ): Promise<boolean> {
    this.rememberOwnWrite(path, snapshot.content);

    try {
      await this.options.write(path, snapshot.content);

      const current = this.pending.get(path);
      // 只有落盘版本仍是最新版本时才能清空，防止慢写入吞掉后续编辑。
      if (
        current === pending &&
        current.revision === snapshot.revision &&
        current.content === snapshot.content
      ) {
        this.pending.delete(path);
        this.options.onStateChange?.(path, "clean");
      } else if (current) {
        this.options.onStateChange?.(path, "dirty");
      }
      return true;
    } catch (error) {
      this.forgetOwnWrite(path, snapshot.content);
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      this.options.onStateChange?.(path, "error", normalizedError);
      return false;
    } finally {
      const current = this.pending.get(path);
      if (current === pending) {
        current.inFlight = null;
      }
    }
  }

  private rememberOwnWrite(path: string, content: string): void {
    const recentWrites = this.pruneExpiredOwnWrites(path) ?? [];
    recentWrites.push({
      content,
      expiresAt: Date.now() + OWN_WRITE_TTL_MS,
    });
    // 写入前登记，避免文件系统事件先于 IPC 写入结果返回。
    if (recentWrites.length > 8) {
      recentWrites.splice(0, recentWrites.length - 8);
    }
    this.ownWrites.set(path, recentWrites);
  }

  private forgetOwnWrite(path: string, content: string): void {
    const recentWrites = this.ownWrites.get(path);
    const matchingIndex =
      recentWrites?.findLastIndex((write) => write.content === content) ?? -1;
    if (!recentWrites || matchingIndex === -1) return;

    recentWrites.splice(matchingIndex, 1);
    if (recentWrites.length === 0) {
      this.ownWrites.delete(path);
    }
  }

  private pruneExpiredOwnWrites(path: string): OwnWriteRecord[] | null {
    const recentWrites = this.ownWrites.get(path);
    if (!recentWrites) return null;

    const now = Date.now();
    const activeWrites = recentWrites.filter((write) => write.expiresAt > now);
    if (activeWrites.length === 0) {
      this.ownWrites.delete(path);
      return null;
    }
    if (activeWrites.length !== recentWrites.length) {
      this.ownWrites.set(path, activeWrites);
    }
    return activeWrites;
  }
}
