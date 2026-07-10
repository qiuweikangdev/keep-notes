import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorPanelSurfaceRegistry } from "./editor-panel-surface-registry";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("EditorPanelSurfaceRegistry", () => {
  it("moves one stable surface between replacement hosts", () => {
    const registry = new EditorPanelSurfaceRegistry();
    const surface = document.createElement("div");
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    const unregisterSurface = registry.registerSurface("group-1", surface);
    const unregisterFirstHost = registry.registerHost("group-1", firstHost);

    expect(firstHost.firstElementChild).toBe(surface);

    unregisterFirstHost();
    const unregisterSecondHost = registry.registerHost("group-1", secondHost);

    expect(secondHost.firstElementChild).toBe(surface);

    unregisterSecondHost();
    unregisterSurface();
  });

  it("ignores stale host cleanup and leaves other groups untouched", () => {
    const registry = new EditorPanelSurfaceRegistry();
    const firstSurface = document.createElement("div");
    const secondSurface = document.createElement("div");
    const staleHost = document.createElement("div");
    const currentHost = document.createElement("div");
    const otherHost = document.createElement("div");

    registry.registerSurface("group-1", firstSurface);
    registry.registerSurface("group-2", secondSurface);
    const unregisterStaleHost = registry.registerHost("group-1", staleHost);
    registry.registerHost("group-1", currentHost);
    registry.registerHost("group-2", otherHost);

    unregisterStaleHost();

    expect(currentHost.firstElementChild).toBe(firstSurface);
    expect(otherHost.firstElementChild).toBe(secondSurface);
  });

  it("restores focus after a focused surface is reattached", () => {
    const registry = new EditorPanelSurfaceRegistry();
    const surface = document.createElement("div");
    const input = document.createElement("input");
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    document.body.append(firstHost, secondHost);
    surface.append(input);
    registry.registerSurface("group-1", surface);
    registry.registerHost("group-1", firstHost);
    input.focus();
    const focusSpy = vi.spyOn(input, "focus");

    registry.registerHost("group-1", secondHost);

    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(input);
  });
});
