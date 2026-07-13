import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorView as CodeMirrorView } from "@codemirror/view";

import {
  normalizeRichDocumentPath,
  RichDocumentSurfaceRegistry,
} from "./rich-document-surface-registry";

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RichDocumentSurfaceRegistry", () => {
  it("normalizes separators without folding path case", () => {
    expect(normalizeRichDocumentPath("C:\\Notes\\Large.md")).toBe(
      "C:/Notes/Large.md",
    );
    expect(normalizeRichDocumentPath("c:\\notes\\large.md")).toBe(
      "c:/notes/large.md",
    );
  });

  it("keeps one document surface mounted while positioning it over pane hosts", () => {
    const registry = new RichDocumentSurfaceRegistry();
    const surface = document.createElement("div");
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    vi.spyOn(firstHost, "getBoundingClientRect").mockReturnValue({
      bottom: 250,
      height: 200,
      left: 20,
      right: 320,
      top: 50,
      width: 300,
      x: 20,
      y: 50,
      toJSON: () => ({}),
    });
    vi.spyOn(secondHost, "getBoundingClientRect").mockReturnValue({
      bottom: 360,
      height: 240,
      left: 340,
      right: 700,
      top: 120,
      width: 360,
      x: 340,
      y: 120,
      toJSON: () => ({}),
    });

    registry.registerSurface("C:\\notes\\large.md", surface);
    registry.registerHost("C:\\notes\\large.md", "g1:t1", firstHost);
    registry.registerHost("C:\\notes\\large.md", "g2:t2", secondHost);

    expect(registry.activate("C:\\notes\\large.md", "g1:t1")).toBe(true);
    expect(surface.parentElement).toBe(document.body);
    expect(firstHost.firstElementChild).toBeNull();
    expect(surface.dataset.activePaneKey).toBe("g1:t1");
    expect(surface.style.cssText).toContain("left: 20px");
    expect(surface.style.cssText).toContain("top: 50px");
    expect(surface.style.cssText).toContain("width: 300px");
    expect(surface.style.cssText).toContain("height: 200px");
    expect(registry.getActivePaneKey("C:/notes/large.md")).toBe("g1:t1");
    expect(registry.activate("C:\\notes\\large.md", "g2:t2")).toBe(true);
    expect(surface.parentElement).toBe(document.body);
    expect(secondHost.firstElementChild).toBeNull();
    expect(firstHost.firstElementChild).toBeNull();
    expect(surface.dataset.activePaneKey).toBe("g2:t2");
    expect(surface.style.cssText).toContain("left: 340px");
    expect(surface.style.cssText).toContain("top: 120px");
    registry.deactivate("C:\\notes\\large.md");
    expect(surface.parentElement).toBe(document.body);
    expect(surface.style.visibility).toBe("hidden");
    expect(surface.dataset.activePaneKey).toBeUndefined();
    expect(registry.getActivePaneKey("C:\\notes\\large.md")).toBeNull();
  });

  it("remeasures every CodeMirror gutter after moving a surface between panes", () => {
    const scheduledFrames: FrameRequestCallback[] = [];
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        scheduledFrames.push(callback);
        return scheduledFrames.length;
      }),
    );
    const registry = new RichDocumentSurfaceRegistry();
    const surface = document.createElement("div");
    const firstCodeMirror = document.createElement("div");
    const secondCodeMirror = document.createElement("div");
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    const firstRequestMeasure = vi.fn();
    const secondRequestMeasure = vi.fn();
    firstCodeMirror.className = "cm-editor";
    secondCodeMirror.className = "cm-editor";
    surface.append(firstCodeMirror, secondCodeMirror);
    vi.spyOn(firstHost, "getBoundingClientRect").mockReturnValue(
      rect(20, 50, 300, 200),
    );
    vi.spyOn(secondHost, "getBoundingClientRect").mockReturnValue(
      rect(340, 120, 360, 240),
    );
    vi.spyOn(CodeMirrorView, "findFromDOM").mockImplementation((element) => {
      if (element === firstCodeMirror) {
        return { requestMeasure: firstRequestMeasure } as never;
      }
      if (element === secondCodeMirror) {
        return { requestMeasure: secondRequestMeasure } as never;
      }
      return null;
    });

    registry.registerSurface("note.md", surface);
    registry.registerHost("note.md", "g1:t1", firstHost);
    registry.registerHost("note.md", "g2:t2", secondHost);
    registry.activate("note.md", "g1:t1");
    firstRequestMeasure.mockClear();
    secondRequestMeasure.mockClear();

    registry.activate("note.md", "g2:t2");

    expect(firstRequestMeasure).toHaveBeenCalledOnce();
    expect(secondRequestMeasure).toHaveBeenCalledOnce();

    scheduledFrames.shift()?.(16);
    expect(firstRequestMeasure).toHaveBeenCalledTimes(2);
    expect(secondRequestMeasure).toHaveBeenCalledTimes(2);

    scheduledFrames.shift()?.(32);
    expect(firstRequestMeasure).toHaveBeenCalledTimes(3);
    expect(secondRequestMeasure).toHaveBeenCalledTimes(3);
    expect(scheduledFrames).toHaveLength(0);
  });

  it("returns false when the document surface or requested host is missing", () => {
    const registry = new RichDocumentSurfaceRegistry();

    expect(registry.activate("missing.md", "g1:t1")).toBe(false);

    registry.registerSurface("surface-only.md", document.createElement("div"));
    expect(registry.activate("surface-only.md", "g1:t1")).toBe(false);
  });

  it("tracks an active host resize without reparenting the editor surface", () => {
    let resizeCallback: ResizeObserverCallback | null = null;
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }
        disconnect = disconnect;
        observe = observe;
      },
    );
    const registry = new RichDocumentSurfaceRegistry();
    const surface = document.createElement("div");
    const host = document.createElement("div");
    const readRect = vi
      .spyOn(host, "getBoundingClientRect")
      .mockReturnValueOnce(rect(10, 20, 300, 200))
      .mockReturnValue(rect(30, 40, 420, 260));

    registry.registerSurface("note.md", surface);
    registry.registerHost("note.md", "g1:t1", host);
    registry.activate("note.md", "g1:t1");
    expect(surface.parentElement).toBe(document.body);
    expect(surface.style.left).toBe("10px");
    expect(observe).toHaveBeenCalledWith(host);

    resizeCallback?.([] as ResizeObserverEntry[], {} as ResizeObserver);

    expect(readRect).toHaveBeenCalledTimes(2);
    expect(surface.parentElement).toBe(document.body);
    expect(surface.style.left).toBe("30px");
    expect(surface.style.top).toBe("40px");
    expect(surface.style.width).toBe("420px");
    expect(surface.style.height).toBe("260px");
    registry.deactivate("note.md");
    expect(disconnect).toHaveBeenCalled();
  });

  it("ignores stale surface and host cleanup", () => {
    const registry = new RichDocumentSurfaceRegistry();
    const staleSurface = document.createElement("div");
    const currentSurface = document.createElement("div");
    const staleHost = document.createElement("div");
    const currentHost = document.createElement("div");
    const unregisterStaleSurface = registry.registerSurface(
      "C:\\notes\\large.md",
      staleSurface,
    );
    const unregisterStaleHost = registry.registerHost(
      "C:\\notes\\large.md",
      "g1:t1",
      staleHost,
    );

    registry.registerSurface("C:/notes/large.md", currentSurface);
    registry.registerHost("C:/notes/large.md", "g1:t1", currentHost);
    unregisterStaleSurface();
    unregisterStaleHost();

    expect(registry.activate("C:\\notes\\large.md", "g1:t1")).toBe(true);
    expect(currentSurface.parentElement).toBe(document.body);
    expect(currentSurface.dataset.activePaneKey).toBe("g1:t1");
    expect(currentHost.firstElementChild).toBeNull();
    expect(staleHost.firstElementChild).toBeNull();
  });

  it("restores a focused descendant after activation and deactivation", () => {
    const registry = new RichDocumentSurfaceRegistry();
    const surface = document.createElement("div");
    const input = document.createElement("input");
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    surface.append(input);
    document.body.append(firstHost, secondHost);
    registry.registerSurface("note.md", surface);
    registry.registerHost("note.md", "g1:t1", firstHost);
    registry.registerHost("note.md", "g2:t2", secondHost);
    registry.activate("note.md", "g1:t1");
    input.focus();
    const focusSpy = vi.spyOn(input, "focus");

    registry.activate("note.md", "g2:t2");

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(input);

    registry.deactivate("note.md");
    expect(surface.parentElement).toBe(document.body);
    expect(surface.style.visibility).toBe("hidden");
    expect(registry.activate("note.md", "g1:t1")).toBe(true);
    expect(focusSpy).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(input);
  });

  it("hides an active surface when its current host unregisters", () => {
    const registry = new RichDocumentSurfaceRegistry();
    const surface = document.createElement("div");
    const host = document.createElement("div");
    registry.registerSurface("note.md", surface);
    const unregisterHost = registry.registerHost("note.md", "g1:t1", host);
    registry.activate("note.md", "g1:t1");

    unregisterHost();

    expect(surface.parentElement).toBe(document.body);
    expect(surface.style.visibility).toBe("hidden");
    expect(registry.getActivePaneKey("note.md")).toBeNull();
  });
});

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}
