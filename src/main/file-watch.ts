import fs from "node:fs";
import path from "node:path";

const IGNORED_EXACT_NAMES = new Set([
  ".git",
  "node_modules",
  ".DS_Store",
  ".tolaria-rename-txn",
]);

interface WatchHandle {
  close: () => void;
}

type WatchCallback = (
  eventType: string,
  fileName: string | Buffer | null,
) => void;

type WatchFunction = (
  targetPath: string,
  options: { recursive?: boolean },
  callback: WatchCallback,
) => WatchHandle;

interface WorkspaceWatchRegistryOptions {
  watch?: WatchFunction;
  debounceMs?: number;
}

interface WorkspaceWatchEntry {
  watcher: WatchHandle;
  onChange: (rootPath: string) => void;
  debounceTimer: ReturnType<typeof setTimeout> | null;
}

export function shouldIgnoreFsWatchPath(targetPath: string): boolean {
  return targetPath
    .split(/[\\/]+/)
    .filter(Boolean)
    .some((segment) => {
      if (IGNORED_EXACT_NAMES.has(segment)) return true;
      if (segment.startsWith(".#")) return true;
      if (segment.endsWith("~")) return true;
      if (segment.endsWith(".tmp")) return true;
      if (segment.endsWith(".swp") || segment.endsWith(".swx")) return true;
      if (segment.endsWith(".icloud")) return true;
      return false;
    });
}

export function resolveWatchEventPath(
  rootPath: string,
  fileName?: string | Buffer | null,
): string {
  if (!fileName) return rootPath;
  return path.join(rootPath, fileName.toString());
}

export class WorkspaceWatchRegistry {
  private readonly watchers = new Map<string, WorkspaceWatchEntry>();
  private readonly watch: WatchFunction;
  private readonly debounceMs: number;

  constructor(options: WorkspaceWatchRegistryOptions = {}) {
    this.watch =
      options.watch ??
      ((targetPath, watchOptions, callback) =>
        fs.watch(targetPath, watchOptions, callback));
    this.debounceMs = options.debounceMs ?? 120;
  }

  watchWorkspace(rootPath: string, onChange: (rootPath: string) => void): void {
    this.unwatchWorkspace(rootPath);

    const watcher = this.watch(
      rootPath,
      { recursive: true },
      (_eventType, fileName) => {
        const eventPath = resolveWatchEventPath(rootPath, fileName);
        if (shouldIgnoreFsWatchPath(eventPath)) return;

        const entry = this.watchers.get(rootPath);
        if (!entry) return;
        if (entry.debounceTimer) clearTimeout(entry.debounceTimer);

        // 文件系统会为一次保存触发多次事件，短窗口内合并刷新能避免侧栏抖动。
        entry.debounceTimer = setTimeout(() => {
          entry.debounceTimer = null;
          entry.onChange(rootPath);
        }, this.debounceMs);
      },
    );

    this.watchers.set(rootPath, {
      watcher,
      onChange,
      debounceTimer: null,
    });
  }

  unwatchWorkspace(rootPath: string): void {
    const entry = this.watchers.get(rootPath);
    if (!entry) return;

    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.watcher.close();
    this.watchers.delete(rootPath);
  }

  unwatchAll(): void {
    [...this.watchers.keys()].forEach((rootPath) =>
      this.unwatchWorkspace(rootPath),
    );
  }
}
