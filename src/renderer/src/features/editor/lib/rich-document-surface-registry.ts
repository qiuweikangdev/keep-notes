import type { RichPaneKey } from "./rich-pane-view-state";

export function normalizeRichDocumentPath(path: string): string {
  return path.replaceAll("\\", "/");
}

interface SurfaceEntry {
  surface: HTMLElement | null;
  hosts: Map<RichPaneKey, HTMLElement>;
  activePaneKey: RichPaneKey | null;
  focusTarget: HTMLElement | null;
}

export class RichDocumentSurfaceRegistry {
  private readonly entries = new Map<string, SurfaceEntry>();

  registerSurface(path: string, surface: HTMLElement): () => void {
    const normalizedPath = normalizeRichDocumentPath(path);
    const entry = this.getEntry(normalizedPath);
    const previousSurface = entry.surface;

    if (previousSurface && previousSurface !== surface) {
      this.captureFocus(entry);
      previousSurface.remove();
      entry.focusTarget = null;
    }
    entry.surface = surface;

    const activeHost = entry.activePaneKey
      ? entry.hosts.get(entry.activePaneKey)
      : undefined;
    if (activeHost) this.attach(entry, activeHost);

    return () => {
      // 注册可能被 Strict Mode 重放，旧清理函数不得移除后来注册的面板。
      if (
        this.entries.get(normalizedPath) !== entry ||
        entry.surface !== surface
      ) {
        return;
      }

      this.captureFocus(entry);
      surface.remove();
      entry.surface = null;
      entry.activePaneKey = null;
      entry.focusTarget = null;
      this.deleteEmptyEntry(normalizedPath, entry);
    };
  }

  registerHost(
    path: string,
    paneKey: RichPaneKey,
    host: HTMLElement,
  ): () => void {
    const normalizedPath = normalizeRichDocumentPath(path);
    const entry = this.getEntry(normalizedPath);
    entry.hosts.set(paneKey, host);

    if (entry.activePaneKey === paneKey) this.attach(entry, host);

    return () => {
      // 同一窗格的宿主可能已被替换，清理时必须按节点身份确认归属。
      if (
        this.entries.get(normalizedPath) !== entry ||
        entry.hosts.get(paneKey) !== host
      ) {
        return;
      }

      if (entry.activePaneKey === paneKey) {
        this.captureFocus(entry);
        if (entry.surface?.parentElement === host) entry.surface.remove();
        entry.activePaneKey = null;
      }
      entry.hosts.delete(paneKey);
      this.deleteEmptyEntry(normalizedPath, entry);
    };
  }

  activate(path: string, paneKey: RichPaneKey): boolean {
    const entry = this.entries.get(normalizeRichDocumentPath(path));
    const host = entry?.hosts.get(paneKey);
    if (!entry?.surface || !host) return false;

    // DOM 节点移动前保存当前后代焦点，挂到新宿主后恢复键盘输入位置。
    this.captureFocus(entry);
    this.attach(entry, host);
    entry.activePaneKey = paneKey;
    return true;
  }

  deactivate(path: string): void {
    const entry = this.entries.get(normalizeRichDocumentPath(path));
    if (!entry) return;

    // 停用只摘除稳定节点而不销毁它，后续激活仍可恢复原焦点后代。
    this.captureFocus(entry);
    entry.surface?.remove();
    entry.activePaneKey = null;
  }

  getActivePaneKey(path: string): RichPaneKey | null {
    return (
      this.entries.get(normalizeRichDocumentPath(path))?.activePaneKey ?? null
    );
  }

  private getEntry(normalizedPath: string): SurfaceEntry {
    const existing = this.entries.get(normalizedPath);
    if (existing) return existing;

    const entry: SurfaceEntry = {
      surface: null,
      hosts: new Map(),
      activePaneKey: null,
      focusTarget: null,
    };
    this.entries.set(normalizedPath, entry);
    return entry;
  }

  private captureFocus(entry: SurfaceEntry): void {
    const activeElement = document.activeElement;
    if (
      entry.surface &&
      activeElement instanceof HTMLElement &&
      entry.surface.contains(activeElement)
    ) {
      entry.focusTarget = activeElement;
    }
  }

  private attach(entry: SurfaceEntry, host: HTMLElement): void {
    if (!entry.surface) return;
    if (entry.surface.parentElement !== host) host.append(entry.surface);

    if (
      entry.focusTarget?.isConnected &&
      entry.surface.contains(entry.focusTarget)
    ) {
      entry.focusTarget.focus({ preventScroll: true });
    }
    entry.focusTarget = null;
  }

  private deleteEmptyEntry(normalizedPath: string, entry: SurfaceEntry): void {
    if (!entry.surface && entry.hosts.size === 0) {
      this.entries.delete(normalizedPath);
    }
  }
}
