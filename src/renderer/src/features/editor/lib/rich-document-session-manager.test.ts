import { describe, expect, it, vi } from "vitest";

import {
  type RichDocumentRuntime,
  RichDocumentSessionManager,
} from "./rich-document-session-manager";
import { RichDocumentSurfaceRegistry } from "./rich-document-surface-registry";
import { RichPaneViewStateRegistry } from "./rich-pane-view-state";

interface RuntimeState {
  dirty?: boolean;
  saving?: boolean;
  reloading?: boolean;
}

function createRuntime(
  path: string,
  destroyed: string[],
  state: RuntimeState = {},
): RichDocumentRuntime {
  return {
    path,
    surface: document.createElement("div"),
    serializePendingChange: vi.fn(async () => undefined),
    cancelPendingWork: vi.fn(),
    destroy: vi.fn(() => destroyed.push(path)),
    isDirty: () => state.dirty ?? false,
    isSaving: () => state.saving ?? false,
    isReloading: () => state.reloading ?? false,
  };
}

function createManager(
  options: ConstructorParameters<typeof RichDocumentSessionManager>[0] = {},
): RichDocumentSessionManager {
  return new RichDocumentSessionManager(options);
}

describe("RichDocumentSessionManager", () => {
  it("deduplicates repeated visible bindings by normalized path", () => {
    const manager = createManager();
    manager.retainVisible("C:\\notes\\large.md", {
      paneKey: "g1:t1",
      groupId: "g1",
      tabId: "t1",
    });
    manager.retainVisible("C:/notes/large.md", {
      paneKey: "g2:t2",
      groupId: "g2",
      tabId: "t2",
    });

    expect(manager.getSnapshot()).toEqual(["C:/notes/large.md"]);
    expect(manager.getVisiblePaneKeys("C:/notes/large.md")).toEqual([
      "g1:t1",
      "g2:t2",
    ]);
    expect(manager.getBoundTabIds("C:\\notes\\large.md")).toEqual(["t1", "t2"]);
  });

  it("evicts only the oldest idle background session beyond four", () => {
    const destroyed: string[] = [];
    const manager = createManager({ maxBackgroundSessions: 4 });
    for (const path of ["a.md", "b.md", "c.md", "d.md", "e.md"]) {
      manager.registerRuntime(path, createRuntime(path, destroyed));
      const release = manager.retainBackground(path, `tab-${path}`);
      release();
    }

    expect(destroyed).toEqual(["a.md"]);
    expect(manager.getSnapshot()).toEqual(["b.md", "c.md", "d.md", "e.md"]);
  });

  it("keeps visible, dirty, saving, and reloading sessions during eviction", () => {
    const destroyed: string[] = [];
    const manager = createManager({ maxBackgroundSessions: 0 });
    manager.retainVisible("visible.md", {
      paneKey: "g1:visible",
      groupId: "g1",
      tabId: "visible",
    });
    manager.registerRuntime(
      "visible.md",
      createRuntime("visible.md", destroyed),
    );
    manager.registerRuntime(
      "dirty.md",
      createRuntime("dirty.md", destroyed, { dirty: true }),
    );
    manager.registerRuntime(
      "saving.md",
      createRuntime("saving.md", destroyed, { saving: true }),
    );
    manager.registerRuntime(
      "reloading.md",
      createRuntime("reloading.md", destroyed, { reloading: true }),
    );
    manager.registerRuntime("idle.md", createRuntime("idle.md", destroyed));

    expect(destroyed).toEqual(["idle.md"]);
    expect(manager.getSnapshot()).toEqual([
      "visible.md",
      "dirty.md",
      "saving.md",
      "reloading.md",
    ]);
  });

  it("scopes pane activation by path and deactivates before switching", () => {
    const surfaces = new RichDocumentSurfaceRegistry();
    const manager = createManager({ surfaces });
    const destroyed: string[] = [];
    const firstRuntime = createRuntime("first.md", destroyed);
    const secondRuntime = createRuntime("second.md", destroyed);
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    manager.retainVisible("first.md", {
      paneKey: "g1:t1",
      groupId: "g1",
      tabId: "t1",
    });
    manager.retainVisible("second.md", {
      paneKey: "g2:t2",
      groupId: "g2",
      tabId: "t2",
    });
    manager.registerRuntime("first.md", firstRuntime);
    manager.registerRuntime("second.md", secondRuntime);
    surfaces.registerHost("first.md", "g1:t1", firstHost);
    surfaces.registerHost("second.md", "g2:t2", secondHost);
    const deactivate = vi.spyOn(surfaces, "deactivate");
    const activate = vi.spyOn(surfaces, "activate");

    expect(manager.setActivePane("first.md", "g1:t1")).toBe(true);
    deactivate.mockClear();
    activate.mockClear();
    expect(manager.setActivePane("second.md", "g2:t2")).toBe(true);

    expect(deactivate).toHaveBeenCalledWith("first.md");
    expect(activate).toHaveBeenCalledWith("second.md", "g2:t2");
    expect(deactivate.mock.invocationCallOrder[0]).toBeLessThan(
      activate.mock.invocationCallOrder[0],
    );
    expect(firstRuntime.surface.parentElement).toBeNull();
    expect(secondHost.firstElementChild).toBe(secondRuntime.surface);
    expect(manager.getActivePane("first.md")).toBeNull();
    expect(manager.getActivePane("second.md")).toBe("g2:t2");
    expect(manager.getActiveBinding()).toEqual({
      path: "second.md",
      binding: {
        paneKey: "g2:t2",
        groupId: "g2",
        tabId: "t2",
      },
    });
  });

  it("does not destroy a shared runtime when one duplicate pane releases", () => {
    const destroyed: string[] = [];
    const manager = createManager({ maxBackgroundSessions: 0 });
    const releaseFirst = manager.retainVisible("C:\\notes\\large.md", {
      paneKey: "g1:t1",
      groupId: "g1",
      tabId: "t1",
    });
    manager.retainVisible("C:/notes/large.md", {
      paneKey: "g2:t2",
      groupId: "g2",
      tabId: "t2",
    });
    const runtime = createRuntime("C:/notes/large.md", destroyed);
    manager.registerRuntime("C:\\notes\\large.md", runtime);

    releaseFirst();

    expect(destroyed).toEqual([]);
    expect(manager.getRuntime("C:/notes/large.md")).toBe(runtime);
    expect(manager.getVisiblePaneKeys("C:\\notes\\large.md")).toEqual([
      "g2:t2",
    ]);
  });

  it("publishes one notification per retained-path change with stable snapshots", () => {
    const manager = createManager();
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);
    const emptySnapshot = manager.getSnapshot();
    const releaseFirst = manager.retainVisible("C:\\notes\\large.md", {
      paneKey: "g1:t1",
      groupId: "g1",
      tabId: "t1",
    });
    const retainedSnapshot = manager.getSnapshot();
    const releaseSecond = manager.retainVisible("C:/notes/large.md", {
      paneKey: "g2:t2",
      groupId: "g2",
      tabId: "t2",
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(retainedSnapshot).not.toBe(emptySnapshot);
    expect(manager.getSnapshot()).toBe(retainedSnapshot);

    releaseFirst();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot()).toBe(retainedSnapshot);

    releaseSecond();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(manager.getSnapshot()).toEqual([]);

    unsubscribe();
    manager.retainBackground("other.md", "tab-other");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("ignores stale visible and runtime cleanup callbacks", () => {
    const destroyed: string[] = [];
    const viewStates = new RichPaneViewStateRegistry();
    const manager = createManager({ viewStates });
    const binding = {
      paneKey: "g1:t1" as const,
      groupId: "g1",
      tabId: "t1",
    };
    const releaseStaleBinding = manager.retainVisible("note.md", binding);
    manager.retainVisible("note.md", binding);
    const staleRuntime = createRuntime("note.md", destroyed);
    const currentRuntime = createRuntime("note.md", destroyed);
    const unregisterStaleRuntime = manager.registerRuntime(
      "note.md",
      staleRuntime,
    );
    manager.registerRuntime("note.md", currentRuntime);

    releaseStaleBinding();
    unregisterStaleRuntime();

    expect(manager.getVisiblePaneKeys("note.md")).toEqual(["g1:t1"]);
    expect(manager.getRuntime("note.md")).toBe(currentRuntime);
  });
});
