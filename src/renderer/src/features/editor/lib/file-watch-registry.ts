type FileContentListener = (content: string) => void;
type GlobalFileListener = (path: string, content: string) => void;

interface FileWatchRegistryOptions {
  watch: (path: string) => void;
  unwatch: (path: string) => void;
  subscribeGlobal: (listener: GlobalFileListener) => () => void;
  isOwnWrite: (path: string, content: string) => boolean;
}

export class FileWatchRegistry {
  private readonly subscribers = new Map<string, Set<FileContentListener>>();
  private unsubscribeGlobal: (() => void) | null = null;

  constructor(private readonly options: FileWatchRegistryOptions) {}

  subscribe(path: string, listener: FileContentListener): () => void {
    const subscribers = this.subscribers.get(path) ?? new Set();
    const registeredListener: FileContentListener = (content) =>
      listener(content);
    const isFirstPathSubscriber = subscribers.size === 0;

    subscribers.add(registeredListener);
    this.subscribers.set(path, subscribers);
    this.ensureGlobalSubscription();
    if (isFirstPathSubscriber) {
      this.options.watch(path);
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;

      const currentSubscribers = this.subscribers.get(path);
      currentSubscribers?.delete(registeredListener);
      if (currentSubscribers && currentSubscribers.size > 0) return;

      // 同一路径最后一个编辑器卸载时，才释放主进程中的文件监听器。
      this.subscribers.delete(path);
      this.options.unwatch(path);
      this.releaseGlobalSubscriptionIfIdle();
    };
  }

  private ensureGlobalSubscription(): void {
    if (this.unsubscribeGlobal) return;

    // 所有编辑器共享一个 IPC 入口，保证自身写盘判断只执行一次。
    this.unsubscribeGlobal = this.options.subscribeGlobal((path, content) => {
      const subscribers = this.subscribers.get(path);
      if (!subscribers || this.options.isOwnWrite(path, content)) return;

      // 使用快照分发，避免某个回调在执行中取消订阅影响后续回调。
      [...subscribers].forEach((listener) => listener(content));
    });
  }

  private releaseGlobalSubscriptionIfIdle(): void {
    if (this.subscribers.size > 0 || !this.unsubscribeGlobal) return;

    this.unsubscribeGlobal();
    this.unsubscribeGlobal = null;
  }
}
