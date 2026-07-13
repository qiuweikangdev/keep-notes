import { EditorView as CodeMirrorView } from "@codemirror/view";

import type { RichPaneKey } from "./rich-pane-view-state";

export function normalizeRichDocumentPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function requestEmbeddedCodeMirrorMeasurements(surface: HTMLElement): void {
  for (const editorElement of surface.querySelectorAll<HTMLElement>(
    ".cm-editor",
  )) {
    CodeMirrorView.findFromDOM(editorElement)?.requestMeasure();
  }
}

interface SurfaceEntry {
  surface: HTMLElement | null;
  hosts: Map<RichPaneKey, HTMLElement>;
  activePaneKey: RichPaneKey | null;
  focusTarget: HTMLElement | null;
  measurementGeneration: number;
  resizeObserver: ResizeObserver | null;
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
    this.mountSurface(surface);

    const activePaneKey = entry.activePaneKey;
    const activeHost = activePaneKey
      ? entry.hosts.get(activePaneKey)
      : undefined;
    if (activeHost && activePaneKey) {
      this.showAtHost(entry, activeHost, activePaneKey);
    }

    return () => {
      // Strict Mode 可能重放注册流程，旧清理函数不得移除后来注册的表面。
      if (
        this.entries.get(normalizedPath) !== entry ||
        entry.surface !== surface
      ) {
        return;
      }

      this.captureFocus(entry);
      this.stopObservingHost(entry);
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

    if (entry.activePaneKey === paneKey) {
      this.showAtHost(entry, host, paneKey);
    }

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
        this.stopObservingHost(entry);
        this.hideSurface(entry.surface);
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

    // 表面始终挂在稳定的 body 容器，只更新定位，避免重挂完整编辑器触发所有块重排。
    this.captureFocus(entry);
    const movedBetweenPanes =
      entry.activePaneKey !== null && entry.activePaneKey !== paneKey;
    entry.activePaneKey = paneKey;
    this.showAtHost(entry, host, paneKey, movedBetweenPanes);
    return true;
  }

  deactivate(path: string): void {
    const entry = this.entries.get(normalizeRichDocumentPath(path));
    if (!entry) return;

    // 停用仅隐藏稳定表面，不销毁也不重新挂载其 ProseMirror DOM。
    this.captureFocus(entry);
    this.stopObservingHost(entry);
    this.hideSurface(entry.surface);
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
      measurementGeneration: 0,
      resizeObserver: null,
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

  private mountSurface(surface: HTMLElement): void {
    surface.style.position = "fixed";
    surface.style.zIndex = "1";
    this.hideSurface(surface);
    if (surface.parentElement !== document.body) document.body.append(surface);
  }

  private showAtHost(
    entry: SurfaceEntry,
    host: HTMLElement,
    paneKey: RichPaneKey,
    settleMeasurements = false,
  ): void {
    const surface = entry.surface;
    if (!surface) return;

    const rect = host.getBoundingClientRect();
    surface.style.left = `${rect.left}px`;
    surface.style.top = `${rect.top}px`;
    surface.style.width = `${rect.width}px`;
    surface.style.height = `${rect.height}px`;
    surface.style.visibility = "visible";
    surface.style.pointerEvents = "auto";
    surface.setAttribute("aria-hidden", "false");
    surface.dataset.activePaneKey = paneKey;
    // 固定表面换到另一个 pane 后尺寸可能相同，但视口位置已变化，需主动刷新 gutter 的行号和折叠标记。
    requestEmbeddedCodeMirrorMeasurements(surface);
    entry.measurementGeneration += 1;
    if (settleMeasurements) {
      this.scheduleSettledCodeMirrorMeasurements(entry, surface);
    }
    this.observeHost(entry, host, paneKey);

    if (entry.focusTarget?.isConnected && surface.contains(entry.focusTarget)) {
      entry.focusTarget.focus({ preventScroll: true });
    }
    entry.focusTarget = null;
  }

  private hideSurface(surface: HTMLElement | null): void {
    if (!surface) return;
    surface.style.visibility = "hidden";
    surface.style.pointerEvents = "none";
    surface.setAttribute("aria-hidden", "true");
    delete surface.dataset.activePaneKey;
  }

  private scheduleSettledCodeMirrorMeasurements(
    entry: SurfaceEntry,
    surface: HTMLElement,
  ): void {
    if (typeof requestAnimationFrame !== "function") return;
    const generation = entry.measurementGeneration;
    let remainingFrames = 2;
    const measure = () => {
      if (
        entry.surface !== surface ||
        entry.measurementGeneration !== generation
      ) {
        return;
      }

      requestEmbeddedCodeMirrorMeasurements(surface);
      remainingFrames -= 1;
      if (remainingFrames > 0) requestAnimationFrame(measure);
    };
    requestAnimationFrame(measure);
  }

  private observeHost(
    entry: SurfaceEntry,
    host: HTMLElement,
    paneKey: RichPaneKey,
  ): void {
    this.stopObservingHost(entry);
    if (typeof ResizeObserver === "undefined") return;

    entry.resizeObserver = new ResizeObserver(() => {
      if (
        entry.activePaneKey !== paneKey ||
        entry.hosts.get(paneKey) !== host
      ) {
        return;
      }
      this.positionSurface(entry.surface, host);
    });
    entry.resizeObserver.observe(host);
  }

  private positionSurface(
    surface: HTMLElement | null,
    host: HTMLElement,
  ): void {
    if (!surface) return;
    const rect = host.getBoundingClientRect();
    surface.style.left = `${rect.left}px`;
    surface.style.top = `${rect.top}px`;
    surface.style.width = `${rect.width}px`;
    surface.style.height = `${rect.height}px`;
    requestEmbeddedCodeMirrorMeasurements(surface);
  }

  private stopObservingHost(entry: SurfaceEntry): void {
    entry.resizeObserver?.disconnect();
    entry.resizeObserver = null;
  }

  private deleteEmptyEntry(normalizedPath: string, entry: SurfaceEntry): void {
    if (!entry.surface && entry.hosts.size === 0) {
      this.stopObservingHost(entry);
      this.entries.delete(normalizedPath);
    }
  }
}
