export interface EditorLoadToken {
  groupId: string;
  tabId: string;
  path: string;
  requestId: number;
}

export class EditorLoadSession {
  private requestId = 0;
  private readonly active = new Map<string, EditorLoadToken>();

  begin(groupId: string, tabId: string, path: string): EditorLoadToken {
    const token = {
      groupId,
      tabId,
      path,
      requestId: ++this.requestId,
    };
    this.active.set(this.getKey(groupId, tabId), token);
    return token;
  }

  isCurrent(token: EditorLoadToken): boolean {
    // 每个标签只保留最后一次令牌，旧请求即使更晚返回也不能覆盖新文件。
    return this.active.get(this.getKey(token.groupId, token.tabId)) === token;
  }

  cancel(groupId: string, tabId: string): void {
    this.active.delete(this.getKey(groupId, tabId));
  }

  private getKey(groupId: string, tabId: string): string {
    return `${groupId}:${tabId}`;
  }
}

interface FileOpenControllerOptions {
  read: (path: string) => Promise<string>;
  cache?: {
    getContent(path: string): string | null;
    setContent(path: string, content: string): void;
  };
  session?: EditorLoadSession;
}

interface FileOpenRequest {
  groupId: string;
  tabId: string;
  path: string;
  onSuccess: (content: string) => void;
  onError?: (error: Error) => void;
}

export function createFileOpenController(options: FileOpenControllerOptions) {
  const session = options.session ?? new EditorLoadSession();

  return {
    async open(request: FileOpenRequest): Promise<void> {
      const token = session.begin(request.groupId, request.tabId, request.path);

      try {
        const cached = options.cache?.getContent(request.path);
        if (cached !== null && cached !== undefined) {
          request.onSuccess(cached);
        }
        const content = await options.read(request.path);

        // 读取期间标签可能已经切换文件，过期结果必须静默丢弃。
        if (!session.isCurrent(token)) {
          return;
        }

        options.cache?.setContent(request.path, content);
        if (content !== cached) {
          request.onSuccess(content);
        }
      } catch (error) {
        if (!session.isCurrent(token)) {
          return;
        }
        request.onError?.(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    },
  };
}
