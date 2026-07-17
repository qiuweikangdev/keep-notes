type FindWidgetOpenHandler = () => void;

function createFindWidgetKey(groupId: string, tabId: string) {
  return `${groupId}\u0000${tabId}`;
}

class EditorFindController {
  private readonly handlers = new Map<string, FindWidgetOpenHandler>();

  register(
    groupId: string,
    tabId: string,
    handler: FindWidgetOpenHandler,
  ): () => void {
    const key = createFindWidgetKey(groupId, tabId);
    this.handlers.set(key, handler);

    return () => {
      if (this.handlers.get(key) === handler) {
        this.handlers.delete(key);
      }
    };
  }

  open(groupId: string, tabId: string): void {
    this.handlers.get(createFindWidgetKey(groupId, tabId))?.();
  }
}

/** 管理活动编辑器的文件内搜索浮窗，避免每个面板重复监听全局事件。 */
export const editorFindController = new EditorFindController();
