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
    return this.active.get(this.getKey(token.groupId, token.tabId)) === token;
  }

  cancel(groupId: string, tabId: string): void {
    this.active.delete(this.getKey(groupId, tabId));
  }

  private getKey(groupId: string, tabId: string): string {
    return `${groupId}:${tabId}`;
  }
}
