import fs from "node:fs";
import path from "node:path";
import type {
  WorkspaceChangeBatch,
  WorkspaceChangeEvent,
} from "../shared/types";

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

interface FileContentWatchRegistryOptions {
  watch?: WatchFunction;
  readFile?: (targetPath: string) => Promise<string>;
  debounceMs?: number;
}

interface WorkspaceWatchEntry {
  watcher: WatchHandle;
  onChange: (batch: WorkspaceChangeBatch) => void;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  pendingEvents: Map<string, WorkspaceChangeEvent>;
  hasUnknownPath: boolean;
}

interface FileContentWatchEntry {
  watcher: WatchHandle;
  onChange: (filePath: string, content: string) => void | Promise<void>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
}

function isFileMissingError(error: unknown): boolean {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export function shouldIgnoreFsWatchPath(targetPath: string): boolean {
  return targetPath
    .split(/[\\/]+/)
    .filter(Boolean)
    .some((segment) => {
      if (IGNORED_EXACT_NAMES.has(segment)) return true;
      if (segment.startsWith(".tolaria-rename-txn-")) return true;
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

  watchWorkspace(
    rootPath: string,
    onChange: (batch: WorkspaceChangeBatch) => void,
  ): void {
    this.unwatchWorkspace(rootPath);

    const watcher = this.watch(
      rootPath,
      { recursive: true },
      (eventType, fileName) => {
        const eventPath = resolveWatchEventPath(rootPath, fileName);
        if (shouldIgnoreFsWatchPath(eventPath)) return;

        const entry = this.watchers.get(rootPath);
        if (!entry) return;
        if (fileName) {
          const normalizedEventType =
            eventType === "rename" ? "rename" : "change";
          const existingEvent = entry.pendingEvents.get(eventPath);
          entry.pendingEvents.set(eventPath, {
            path: eventPath,
            eventType:
              existingEvent?.eventType === "rename"
                ? "rename"
                : normalizedEventType,
          });
        } else {
          entry.hasUnknownPath = true;
        }
        if (entry.debounceTimer) clearTimeout(entry.debounceTimer);

        // 文件系统会为一次保存触发多次事件，保留变化路径并在短窗口内批量通知。
        entry.debounceTimer = setTimeout(() => {
          entry.debounceTimer = null;
          const batch: WorkspaceChangeBatch = {
            rootPath,
            events: [...entry.pendingEvents.values()],
            hasUnknownPath: entry.hasUnknownPath,
          };
          entry.pendingEvents.clear();
          entry.hasUnknownPath = false;
          entry.onChange(batch);
        }, this.debounceMs);
      },
    );

    this.watchers.set(rootPath, {
      watcher,
      onChange,
      debounceTimer: null,
      pendingEvents: new Map(),
      hasUnknownPath: false,
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

export class FileContentWatchRegistry {
  private readonly watchers = new Map<string, FileContentWatchEntry>();
  private readonly watch: WatchFunction;
  private readonly readFile: (targetPath: string) => Promise<string>;
  private readonly debounceMs: number;

  constructor(options: FileContentWatchRegistryOptions = {}) {
    this.watch =
      options.watch ??
      ((targetPath, watchOptions, callback) =>
        fs.watch(targetPath, watchOptions, callback));
    this.readFile =
      options.readFile ??
      ((targetPath) => fs.promises.readFile(targetPath, "utf-8"));
    this.debounceMs = options.debounceMs ?? 80;
  }

  watchFile(
    filePath: string,
    onChange: (filePath: string, content: string) => void | Promise<void>,
  ): void {
    if (shouldIgnoreFsWatchPath(filePath)) return;

    this.unwatchFile(filePath);

    const directoryPath = path.dirname(filePath);
    const targetName = path.basename(filePath);
    const watcher = this.watch(directoryPath, {}, (_eventType, fileName) => {
      const eventPath = resolveWatchEventPath(directoryPath, fileName);
      if (shouldIgnoreFsWatchPath(eventPath)) return;
      if (fileName && path.basename(eventPath) !== targetName) return;

      const entry = this.watchers.get(filePath);
      if (!entry) return;
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);

      // macOS 上很多编辑器会用 rename/replace 完成保存，监听父目录能避免文件 inode 替换后丢事件。
      entry.debounceTimer = setTimeout(() => {
        entry.debounceTimer = null;
        void this.emitFileContent(filePath, entry);
      }, this.debounceMs);
    });

    this.watchers.set(filePath, {
      watcher,
      onChange,
      debounceTimer: null,
    });
  }

  unwatchFile(filePath: string): void {
    const entry = this.watchers.get(filePath);
    if (!entry) return;

    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.watcher.close();
    this.watchers.delete(filePath);
  }

  unwatchAll(): void {
    [...this.watchers.keys()].forEach((filePath) => this.unwatchFile(filePath));
  }

  private async emitFileContent(
    filePath: string,
    entry: FileContentWatchEntry,
  ): Promise<void> {
    if (this.watchers.get(filePath) !== entry) return;

    try {
      const content = await this.readFile(filePath);
      if (this.watchers.get(filePath) !== entry) return;
      await entry.onChange(filePath, content);
    } catch (error) {
      // 文件替换过程中可能短暂不存在，等待下一次 rename/change 事件再同步即可。
      if (isFileMissingError(error)) return;
      console.error("Failed to read changed file:", error);
    }
  }
}
