type FileContentListener = (content: string) => void;
type GlobalFileListener = (path: string, content: string) => void;

export interface FileWatchSubscriptionOptions {
  priority?: number;
}

interface FileContentSubscription {
  listener: FileContentListener;
  priority: number;
}

interface FileWatchRegistryOptions {
  watch: (path: string) => void;
  unwatch: (path: string) => void;
  subscribeGlobal: (listener: GlobalFileListener) => () => void;
  isOwnWrite: (path: string, content: string) => boolean;
}

export class FileWatchRegistry {
  private readonly subscribers = new Map<
    string,
    Set<FileContentSubscription>
  >();
  private unsubscribeGlobal: (() => void) | null = null;

  constructor(private readonly options: FileWatchRegistryOptions) {}

  subscribe(
    path: string,
    listener: FileContentListener,
    options?: FileWatchSubscriptionOptions,
  ): () => void {
    const subscribers = this.subscribers.get(path) ?? new Set();
    const subscription: FileContentSubscription = {
      listener: (content) => listener(content),
      priority: options?.priority ?? 0,
    };
    const isFirstPathSubscriber = subscribers.size === 0;

    subscribers.add(subscription);
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
      currentSubscribers?.delete(subscription);
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

      // 富文本需先登记视口保护再同步同路径标签；同优先级仍保持注册顺序。
      [...subscribers]
        .toSorted((left, right) => right.priority - left.priority)
        .forEach((subscription) => subscription.listener(content));
    });
  }

  private releaseGlobalSubscriptionIfIdle(): void {
    if (this.subscribers.size > 0 || !this.unsubscribeGlobal) return;

    this.unsubscribeGlobal();
    this.unsubscribeGlobal = null;
  }
}
