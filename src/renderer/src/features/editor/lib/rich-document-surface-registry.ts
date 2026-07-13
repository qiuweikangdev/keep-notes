import { EditorView as CodeMirrorView } from "@codemirror/view";

import type { RichPaneKey } from "./rich-pane-view-state";

export function normalizeRichDocumentPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function requestVisibleCodeMirrorMeasurements(surface: HTMLElement): void {
  const ownerDocument = surface.ownerDocument;
  const surfaceBounds = surface.getBoundingClientRect();
  const editorElements = new Set<HTMLElement>();
  const activeEditor =
    ownerDocument.activeElement?.closest<HTMLElement>(".cm-editor");
  if (activeEditor && surface.contains(activeEditor)) {
    editorElements.add(activeEditor);
  }

  if (
    surfaceBounds.width > 0 &&
    surfaceBounds.height > 0 &&
    typeof ownerDocument.elementsFromPoint === "function"
  ) {
    const x = surfaceBounds.left + surfaceBounds.width / 2;
    const sampleDistance = 64;
    for (
      let y = surfaceBounds.top + 1;
      y < surfaceBounds.bottom;
      y += sampleDistance
    ) {
      for (const element of ownerDocument.elementsFromPoint(x, y)) {
        const editorElement = element.closest<HTMLElement>(".cm-editor");
        if (editorElement && surface.contains(editorElement)) {
          editorElements.add(editorElement);
          break;
        }
      }
    }
  }

  for (const editorElement of editorElements) {
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
        this.parkSurface(entry.surface);
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

    // 表面节点始终留在 body，只用合成层 transform 在窗格间移动，避免大型 DOM 重挂触发黑帧。
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
    this.parkSurface(entry.surface);
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
    surface.style.left = "0";
    surface.style.top = "0";
    surface.style.transformOrigin = "0 0";
    surface.style.willChange = "transform";
    surface.style.zIndex = "1";
    this.parkSurface(surface);
  }

  private showAtHost(
    entry: SurfaceEntry,
    host: HTMLElement,
    paneKey: RichPaneKey,
    settleMeasurements = false,
  ): void {
    const surface = entry.surface;
    if (!surface) return;

    if (surface.parentElement !== document.body) document.body.append(surface);
    const sizeChanged = this.positionSurface(surface, host);
    entry.measurementGeneration += 1;
    const generation = entry.measurementGeneration;
    surface.dataset.activePaneKey = paneKey;

    if (
      settleMeasurements &&
      sizeChanged &&
      typeof requestAnimationFrame === "function"
    ) {
      // 不等宽面板切换时先由目标预览承接一帧，避免真实编辑器带着旧宽度移动后再重排。
      this.concealSurface(surface);
      entry.focusTarget = null;
      requestAnimationFrame(() => {
        if (
          entry.surface !== surface ||
          entry.activePaneKey !== paneKey ||
          entry.measurementGeneration !== generation
        ) {
          return;
        }
        this.revealSurface(entry, surface, paneKey, true);
        this.scheduleSettledMeasurement(entry, surface);
      });
      this.observeHost(entry, host, paneKey);
      return;
    }

    this.revealSurface(entry, surface, paneKey, !settleMeasurements);
    if (settleMeasurements) this.scheduleSettledMeasurement(entry, surface);
    this.observeHost(entry, host, paneKey);
  }

  private revealSurface(
    entry: SurfaceEntry,
    surface: HTMLElement,
    paneKey: RichPaneKey,
    measureImmediately: boolean,
  ): void {
    surface.style.visibility = "visible";
    surface.style.opacity = "1";
    surface.style.pointerEvents = "auto";
    surface.setAttribute("aria-hidden", "false");
    surface.dataset.activePaneKey = paneKey;
    // 表面换到另一个 pane 后只刷新当前视口命中的 CodeMirror，不能遍历大文档的全部代码块。
    if (measureImmediately) requestVisibleCodeMirrorMeasurements(surface);

    if (
      entry.focusTarget?.isConnected &&
      surface.contains(entry.focusTarget) &&
      surface.ownerDocument.activeElement !== entry.focusTarget
    ) {
      entry.focusTarget.focus({ preventScroll: true });
    }
    entry.focusTarget = null;
  }

  private hideSurface(surface: HTMLElement | null): void {
    if (!surface) return;
    surface.style.visibility = "hidden";
    surface.style.opacity = "0";
    surface.style.pointerEvents = "none";
    surface.setAttribute("aria-hidden", "true");
    delete surface.dataset.activePaneKey;
  }

  private concealSurface(surface: HTMLElement): void {
    surface.style.visibility = "visible";
    surface.style.opacity = "0";
    surface.style.pointerEvents = "none";
    surface.setAttribute("aria-hidden", "true");
  }

  private parkSurface(surface: HTMLElement | null): void {
    if (!surface) return;
    this.hideSurface(surface);
    if (surface.parentElement !== document.body) document.body.append(surface);
  }

  private scheduleSettledMeasurement(
    entry: SurfaceEntry,
    surface: HTMLElement,
  ): void {
    if (typeof requestAnimationFrame !== "function") return;
    const generation = entry.measurementGeneration;
    requestAnimationFrame(() => {
      if (
        entry.surface !== surface ||
        entry.measurementGeneration !== generation
      ) {
        return;
      }
      requestVisibleCodeMirrorMeasurements(surface);
    });
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
        entry.hosts.get(paneKey) !== host ||
        !entry.surface
      ) {
        return;
      }
      this.positionSurface(entry.surface, host);
      this.scheduleSettledMeasurement(entry, entry.surface);
    });
    entry.resizeObserver.observe(host);
  }

  private positionSurface(surface: HTMLElement, host: HTMLElement): boolean {
    const rect = host.getBoundingClientRect();
    const transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
    const width = `${rect.width}px`;
    const height = `${rect.height}px`;
    const sizeChanged =
      surface.style.width !== width || surface.style.height !== height;

    // 相同尺寸切换窗格时只更新 transform，让 Chromium 复用既有栅格层。
    if (surface.style.transform !== transform)
      surface.style.transform = transform;
    if (surface.style.width !== width) surface.style.width = width;
    if (surface.style.height !== height) surface.style.height = height;
    return sizeChanged;
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
