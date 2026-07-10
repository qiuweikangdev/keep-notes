import { afterEach, describe, expect, it, vi } from "vitest";

import {
  normalizeRichDocumentPath,
  RichDocumentSurfaceRegistry,
} from "./rich-document-surface-registry";

afterEach(() => {
  document.body.replaceChildren();
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

  it("moves one document surface between pane hosts", () => {
    const registry = new RichDocumentSurfaceRegistry();
    const surface = document.createElement("div");
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");

    registry.registerSurface("C:\\notes\\large.md", surface);
    registry.registerHost("C:\\notes\\large.md", "g1:t1", firstHost);
    registry.registerHost("C:\\notes\\large.md", "g2:t2", secondHost);

    expect(registry.activate("C:\\notes\\large.md", "g1:t1")).toBe(true);
    expect(firstHost.firstElementChild).toBe(surface);
    expect(registry.getActivePaneKey("C:/notes/large.md")).toBe("g1:t1");
    expect(registry.activate("C:\\notes\\large.md", "g2:t2")).toBe(true);
    expect(secondHost.firstElementChild).toBe(surface);
    expect(firstHost.firstElementChild).toBeNull();
    registry.deactivate("C:\\notes\\large.md");
    expect(surface.parentElement).toBeNull();
    expect(registry.getActivePaneKey("C:\\notes\\large.md")).toBeNull();
  });

  it("returns false when the document surface or requested host is missing", () => {
    const registry = new RichDocumentSurfaceRegistry();

    expect(registry.activate("missing.md", "g1:t1")).toBe(false);

    registry.registerSurface("surface-only.md", document.createElement("div"));
    expect(registry.activate("surface-only.md", "g1:t1")).toBe(false);
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
    expect(currentHost.firstElementChild).toBe(currentSurface);
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
    expect(surface.parentElement).toBeNull();
    expect(registry.activate("note.md", "g1:t1")).toBe(true);
    expect(focusSpy).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(input);
  });

  it("detaches an active surface when its current host unregisters", () => {
    const registry = new RichDocumentSurfaceRegistry();
    const surface = document.createElement("div");
    const host = document.createElement("div");
    registry.registerSurface("note.md", surface);
    const unregisterHost = registry.registerHost("note.md", "g1:t1", host);
    registry.activate("note.md", "g1:t1");

    unregisterHost();

    expect(surface.parentElement).toBeNull();
    expect(registry.getActivePaneKey("note.md")).toBeNull();
  });
});
