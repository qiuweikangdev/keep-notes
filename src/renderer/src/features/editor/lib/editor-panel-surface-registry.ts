interface EditorPanelSurfaceEntry {
  surface: HTMLElement | null;
  host: HTMLElement | null;
  focusTarget: HTMLElement | null;
}

export class EditorPanelSurfaceRegistry {
  private readonly entries = new Map<string, EditorPanelSurfaceEntry>();

  registerSurface(groupId: string, surface: HTMLElement): () => void {
    const entry = this.getEntry(groupId);
    entry.surface = surface;
    this.attach(entry);

    return () => {
      // Strict Mode 可能重放注册流程，旧清理函数不能移除较新的面板容器。
      if (entry.surface !== surface) return;
      entry.surface = null;
      entry.focusTarget = null;
      surface.remove();
      this.deleteEmptyEntry(groupId, entry);
    };
  }

  registerHost(groupId: string, host: HTMLElement): () => void {
    const entry = this.getEntry(groupId);
    entry.host = host;
    this.attach(entry);

    return () => {
      // 嵌套布局替换叶子节点时，只允许当前宿主清理自己的引用。
      if (entry.host !== host) return;
      const activeElement = document.activeElement;
      if (
        entry.surface &&
        activeElement instanceof HTMLElement &&
        entry.surface.contains(activeElement)
      ) {
        entry.focusTarget = activeElement;
      }
      entry.host = null;
      this.deleteEmptyEntry(groupId, entry);
    };
  }

  private getEntry(groupId: string): EditorPanelSurfaceEntry {
    const existing = this.entries.get(groupId);
    if (existing) return existing;

    const entry: EditorPanelSurfaceEntry = {
      surface: null,
      host: null,
      focusTarget: null,
    };
    this.entries.set(groupId, entry);
    return entry;
  }

  private attach(entry: EditorPanelSurfaceEntry): void {
    if (!entry.surface || !entry.host) return;
    if (entry.surface.parentElement !== entry.host) {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof HTMLElement &&
        entry.surface.contains(activeElement)
      ) {
        entry.focusTarget = activeElement;
      }
      entry.host.append(entry.surface);
    }

    // DOM 重新挂载后恢复原焦点，避免拆分或关闭面板打断键盘输入。
    if (entry.focusTarget?.isConnected) {
      entry.focusTarget.focus({ preventScroll: true });
    }
    entry.focusTarget = null;
  }

  private deleteEmptyEntry(
    groupId: string,
    entry: EditorPanelSurfaceEntry,
  ): void {
    if (!entry.surface && !entry.host) {
      this.entries.delete(groupId);
    }
  }
}
