import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorView as CodeMirrorView } from "@codemirror/view";

import {
  normalizeRichDocumentPath,
  RichDocumentSurfaceRegistry,
} from "./rich-document-surface-registry";

afterEach(() => {
  document.body.replaceChildren();
  Reflect.deleteProperty(document, "elementsFromPoint");
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

  it("moves one stable body surface between pane positions with transforms", () => {
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
    expect(surface.style.position).toBe("fixed");
    expect(surface.style.transform).toBe("translate3d(20px, 50px, 0)");
    expect(surface.style.width).toBe("300px");
    expect(surface.style.height).toBe("200px");
    expect(registry.getActivePaneKey("C:/notes/large.md")).toBe("g1:t1");
    expect(registry.activate("C:\\notes\\large.md", "g2:t2")).toBe(true);
    expect(surface.parentElement).toBe(document.body);
    expect(secondHost.firstElementChild).toBeNull();
    expect(firstHost.firstElementChild).toBeNull();
    expect(surface.dataset.activePaneKey).toBe("g2:t2");
    expect(surface.style.transform).toBe("translate3d(340px, 120px, 0)");
    expect(surface.style.width).toBe("360px");
    expect(surface.style.height).toBe("240px");
    registry.deactivate("C:\\notes\\large.md");
    expect(surface.parentElement).toBe(document.body);
    expect(surface.style.visibility).toBe("hidden");
    expect(surface.style.transform).toBe(
      "translate3d(-100000px, -100000px, 0)",
    );
    expect(surface.dataset.activePaneKey).toBeUndefined();
    expect(registry.getActivePaneKey("C:\\notes\\large.md")).toBeNull();
    expect(registry.activate("C:\\notes\\large.md", "g1:t1")).toBe(true);
    expect(surface.style.transform).toBe("translate3d(20px, 50px, 0)");
  });

  it("parks background rich editors outside BlockNote drag target bounds", () => {
    const registry = new RichDocumentSurfaceRegistry();
    const backgroundSurface = document.createElement("div");
    const editor = document.createElement("div");
    const host = document.createElement("div");
    editor.className = "bn-editor";
    backgroundSurface.append(editor);
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue(
      rect(420, 80, 500, 600),
    );

    registry.registerSurface("background.md", backgroundSurface);
    registry.registerHost("background.md", "g1:t1", host);
    registry.activate("background.md", "g1:t1");
    registry.deactivate("background.md");

    expect(document.querySelectorAll(".bn-editor")).toHaveLength(1);
    expect(backgroundSurface.style.visibility).toBe("hidden");
    expect(backgroundSurface.style.transform).toBe(
      "translate3d(-100000px, -100000px, 0)",
    );
  });

  it("remeasures only CodeMirror instances visible after a pane move", () => {
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
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(
      rect(340, 120, 360, 240),
    );
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: vi.fn(() => [firstCodeMirror]),
    });
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

    expect(firstRequestMeasure).not.toHaveBeenCalled();
    expect(secondRequestMeasure).not.toHaveBeenCalled();
    expect(surface.style.visibility).toBe("visible");
    expect(surface.style.opacity).toBe("0");

    scheduledFrames.shift()?.(16);
    expect(firstRequestMeasure).toHaveBeenCalledOnce();
    expect(secondRequestMeasure).not.toHaveBeenCalled();
    expect(surface.style.opacity).toBe("1");

    scheduledFrames.shift()?.(32);
    expect(firstRequestMeasure).toHaveBeenCalledTimes(2);
    expect(secondRequestMeasure).not.toHaveBeenCalled();
    expect(scheduledFrames).toHaveLength(0);
  });

  it("keeps equal-sized pane moves visible while only translating the surface", () => {
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
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    vi.spyOn(firstHost, "getBoundingClientRect").mockReturnValue(
      rect(20, 50, 300, 200),
    );
    vi.spyOn(secondHost, "getBoundingClientRect").mockReturnValue(
      rect(340, 50, 300, 200),
    );

    registry.registerSurface("note.md", surface);
    registry.registerHost("note.md", "g1:t1", firstHost);
    registry.registerHost("note.md", "g2:t2", secondHost);
    registry.activate("note.md", "g1:t1");
    registry.activate("note.md", "g2:t2");

    expect(surface.style.transform).toBe("translate3d(340px, 50px, 0)");
    expect(surface.style.opacity).toBe("1");
    expect(surface.style.pointerEvents).toBe("auto");
    expect(scheduledFrames).toHaveLength(1);
  });

  it("returns false when the document surface or requested host is missing", () => {
    const registry = new RichDocumentSurfaceRegistry();

    expect(registry.activate("missing.md", "g1:t1")).toBe(false);

    registry.registerSurface("surface-only.md", document.createElement("div"));
    expect(registry.activate("surface-only.md", "g1:t1")).toBe(false);
  });

  it("restores the surface to its configured appearance opacity", () => {
    const registry = new RichDocumentSurfaceRegistry();
    const surface = document.createElement("div");
    const host = document.createElement("div");
    surface.dataset.richSurfaceOpacity = "0.6";
    vi.spyOn(host, "getBoundingClientRect").mockReturnValue(
      rect(0, 0, 300, 200),
    );

    registry.registerSurface("note.md", surface);
    registry.registerHost("note.md", "g1:t1", host);

    expect(registry.activate("note.md", "g1:t1")).toBe(true);
    expect(surface.style.opacity).toBe("0.6");
  });

  it("tracks the active host size while keeping the surface in body", () => {
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
    vi.spyOn(host, "getBoundingClientRect")
      .mockReturnValueOnce(rect(10, 20, 300, 200))
      .mockReturnValue(rect(30, 40, 420, 260));

    registry.registerSurface("note.md", surface);
    registry.registerHost("note.md", "g1:t1", host);
    registry.activate("note.md", "g1:t1");
    expect(surface.parentElement).toBe(document.body);
    expect(surface.style.transform).toBe("translate3d(10px, 20px, 0)");
    expect(observe).toHaveBeenCalledWith(host);

    resizeCallback?.([] as ResizeObserverEntry[], {} as ResizeObserver);

    expect(surface.style.transform).toBe("translate3d(30px, 40px, 0)");
    expect(surface.style.width).toBe("420px");
    expect(surface.style.height).toBe("260px");
    registry.deactivate("note.md");
    expect(surface.parentElement).toBe(document.body);
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

  it("preserves focus across moves and restores it after deactivation", () => {
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

    expect(focusSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);

    registry.deactivate("note.md");
    input.blur();
    expect(surface.parentElement).toBe(document.body);
    expect(surface.style.visibility).toBe("hidden");
    expect(registry.activate("note.md", "g1:t1")).toBe(true);
    expect(focusSpy).toHaveBeenCalledOnce();
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
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
