import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

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

  it("preserves a newer pane owner when the old path releases", () => {
    const viewStates = new RichPaneViewStateRegistry();
    const manager = createManager({ viewStates });
    const binding = {
      paneKey: "g1:t1" as const,
      groupId: "g1",
      tabId: "t1",
    };
    const releaseOld = manager.retainVisible("old.md", binding);
    const releaseNew = manager.retainVisible("new.md", binding);
    viewStates.patch("g1:t1", { scrollTop: 240 });

    releaseOld();

    expect(manager.getVisiblePaneKeys("old.md")).toEqual([]);
    expect(manager.getVisiblePaneKeys("new.md")).toEqual(["g1:t1"]);
    expect(viewStates.read("g1:t1").scrollTop).toBe(240);

    releaseNew();
    expect(viewStates.read("g1:t1").scrollTop).toBe(240);
  });

  it("defaults to four idle background sessions", () => {
    const destroyed: string[] = [];
    const manager = createManager();
    for (const path of ["a.md", "b.md", "c.md", "d.md", "e.md"]) {
      manager.registerRuntime(path, createRuntime(path, destroyed));
      const release = manager.retainBackground(path, `tab-${path}`);
      release();
    }

    expect(destroyed).toEqual(["a.md"]);
    expect(manager.getSnapshot()).toEqual(["b.md", "c.md", "d.md", "e.md"]);
  });

  it("evicts by injected last-active time instead of insertion order", () => {
    const destroyed: string[] = [];
    let currentTime = 0;
    const manager = createManager({
      maxBackgroundSessions: 2,
      now: () => currentTime,
    });
    manager.registerRuntime("a.md", createRuntime("a.md", destroyed));
    currentTime = 1;
    manager.registerRuntime("b.md", createRuntime("b.md", destroyed));
    currentTime = 2;
    const releaseA = manager.retainBackground("a.md", "tab-a");
    currentTime = 3;
    releaseA();
    currentTime = 4;

    manager.registerRuntime("c.md", createRuntime("c.md", destroyed));

    expect(destroyed).toEqual(["b.md"]);
    expect(manager.getSnapshot()).toEqual(["a.md", "c.md"]);
  });

  it("protects a held background reference from eviction", () => {
    const destroyed: string[] = [];
    const manager = createManager({ maxBackgroundSessions: 1 });
    const heldRuntime = createRuntime("held.md", destroyed);
    manager.registerRuntime("held.md", heldRuntime);
    manager.retainBackground("held.md", "tab-held");
    manager.registerRuntime("idle.md", createRuntime("idle.md", destroyed));

    manager.registerRuntime("newest.md", createRuntime("newest.md", destroyed));

    expect(destroyed).toEqual(["idle.md"]);
    expect(manager.getRuntime("held.md")).toBe(heldRuntime);
    expect(manager.getSnapshot()).toEqual(["held.md", "newest.md"]);
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
    expect(firstRuntime.surface.parentElement).toBe(document.body);
    expect(firstRuntime.surface.style.visibility).toBe("hidden");
    expect(secondRuntime.surface.parentElement).toBe(document.body);
    expect(secondRuntime.surface.dataset.activePaneKey).toBe("g2:t2");
    expect(secondHost.firstElementChild).toBeNull();
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

  it("moves a live surface between panes of the same document without hiding it", () => {
    const surfaces = new RichDocumentSurfaceRegistry();
    const viewStates = new RichPaneViewStateRegistry();
    const manager = createManager({ surfaces, viewStates });
    const runtime = createRuntime("large.md", []);
    const captureVisualSnapshot = vi.fn();
    Object.assign(runtime, { captureVisualSnapshot });
    runtime.readViewState = vi.fn(() => ({ scrollTop: 180 }));
    runtime.restoreViewState = vi.fn();
    manager.retainVisible("large.md", {
      paneKey: "g1:t1",
      groupId: "g1",
      tabId: "t1",
    });
    manager.retainVisible("large.md", {
      paneKey: "g2:t2",
      groupId: "g2",
      tabId: "t2",
    });
    manager.registerRuntime("large.md", runtime);
    surfaces.registerHost("large.md", "g1:t1", document.createElement("div"));
    surfaces.registerHost("large.md", "g2:t2", document.createElement("div"));
    viewStates.patch("g2:t2", { scrollTop: 640 });

    expect(manager.setActivePane("large.md", "g1:t1")).toBe(true);
    const deactivate = vi.spyOn(surfaces, "deactivate");
    const activate = vi.spyOn(surfaces, "activate");

    expect(manager.setActivePane("large.md", "g2:t2")).toBe(true);

    expect(captureVisualSnapshot).toHaveBeenCalledOnce();
    expect(deactivate).not.toHaveBeenCalled();
    expect(activate).toHaveBeenCalledOnce();
    expect(activate).toHaveBeenCalledWith("large.md", "g2:t2");
    expect(captureVisualSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      activate.mock.invocationCallOrder[0],
    );
    expect(runtime.readViewState).toHaveBeenCalledOnce();
    expect(runtime.restoreViewState).toHaveBeenLastCalledWith(
      expect.objectContaining({ scrollTop: 640 }),
    );
    expect(runtime.surface.style.visibility).toBe("visible");
    expect(runtime.surface.dataset.activePaneKey).toBe("g2:t2");
  });

  it("leaves no active document when a target surface or host is missing", () => {
    const surfaces = new RichDocumentSurfaceRegistry();
    const manager = createManager({ surfaces });
    const destroyed: string[] = [];
    const firstRuntime = createRuntime("first.md", destroyed);
    const firstHost = document.createElement("div");
    manager.retainVisible("first.md", {
      paneKey: "g1:t1",
      groupId: "g1",
      tabId: "t1",
    });
    manager.registerRuntime("first.md", firstRuntime);
    surfaces.registerHost("first.md", "g1:t1", firstHost);
    expect(manager.setActivePane("first.md", "g1:t1")).toBe(true);
    const deactivate = vi.spyOn(surfaces, "deactivate");
    const activate = vi.spyOn(surfaces, "activate");

    manager.retainVisible("missing-surface.md", {
      paneKey: "g2:t2",
      groupId: "g2",
      tabId: "t2",
    });
    surfaces.registerHost(
      "missing-surface.md",
      "g2:t2",
      document.createElement("div"),
    );
    expect(manager.setActivePane("missing-surface.md", "g2:t2")).toBe(false);

    expect(deactivate.mock.invocationCallOrder[0]).toBeLessThan(
      activate.mock.invocationCallOrder[0],
    );
    expect(manager.getActiveBinding()).toBeNull();
    expect(manager.getActivePane("first.md")).toBeNull();
    expect(surfaces.getActivePaneKey("first.md")).toBeNull();
    expect(surfaces.getActivePaneKey("missing-surface.md")).toBeNull();

    expect(manager.setActivePane("first.md", "g1:t1")).toBe(true);
    deactivate.mockClear();
    activate.mockClear();
    manager.retainVisible("missing-host.md", {
      paneKey: "g3:t3",
      groupId: "g3",
      tabId: "t3",
    });
    manager.registerRuntime(
      "missing-host.md",
      createRuntime("missing-host.md", destroyed),
    );
    expect(manager.setActivePane("missing-host.md", "g3:t3")).toBe(false);

    expect(deactivate.mock.invocationCallOrder[0]).toBeLessThan(
      activate.mock.invocationCallOrder[0],
    );
    expect(manager.getActiveBinding()).toBeNull();
    expect(manager.getActivePane("first.md")).toBeNull();
    expect(surfaces.getActivePaneKey("first.md")).toBeNull();
    expect(surfaces.getActivePaneKey("missing-host.md")).toBeNull();
  });

  it("deactivates only the expected active pane and preserves a newer activation", () => {
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
    manager.setActivePane("first.md", "g1:t1");
    manager.setActivePane("second.md", "g2:t2");

    expect(manager.deactivateIfActive("first.md", "g1:t1")).toBe(false);
    expect(secondRuntime.surface.parentElement).toBe(document.body);
    expect(secondRuntime.surface.dataset.activePaneKey).toBe("g2:t2");
    expect(manager.getActivePane("second.md")).toBe("g2:t2");

    expect(manager.deactivateIfActive("second.md", "g2:t2")).toBe(true);
    expect(secondRuntime.surface.parentElement).toBe(document.body);
    expect(secondRuntime.surface.style.visibility).toBe("hidden");
    expect(manager.getActiveBinding()).toBeNull();
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

  it("tears down replaced runtimes exactly once and ignores stale cleanup", () => {
    const destroyed: string[] = [];
    const manager = createManager();
    const staleRuntime = createRuntime("note.md", destroyed);
    const currentRuntime = createRuntime("note.md", destroyed);
    const unregisterStale = manager.registerRuntime(
      "C:\\notes\\note.md",
      staleRuntime,
    );

    const unregisterCurrent = manager.registerRuntime(
      "C:/notes/note.md",
      currentRuntime,
    );

    expect(staleRuntime.cancelPendingWork).toHaveBeenCalledTimes(1);
    expect(staleRuntime.destroy).toHaveBeenCalledTimes(1);
    expect(currentRuntime.cancelPendingWork).not.toHaveBeenCalled();
    expect(currentRuntime.destroy).not.toHaveBeenCalled();

    unregisterStale();
    expect(currentRuntime.cancelPendingWork).not.toHaveBeenCalled();
    expect(currentRuntime.destroy).not.toHaveBeenCalled();

    unregisterCurrent();
    unregisterCurrent();
    expect(currentRuntime.cancelPendingWork).toHaveBeenCalledTimes(1);
    expect(currentRuntime.destroy).toHaveBeenCalledTimes(1);
  });

  it("captures, replaces, attaches, and restores an active runtime in order", () => {
    const events: string[] = [];
    const surfaces = new RichDocumentSurfaceRegistry();
    const viewStates = new RichPaneViewStateRegistry();
    const manager = createManager({ surfaces, viewStates });
    const firstRuntime = createStatefulRuntime("note.md", "r1", events, 73);
    const secondRuntime = createStatefulRuntime("note.md", "r2", events, 0);
    const host = document.createElement("div");
    manager.retainVisible("note.md", {
      paneKey: "g1:t1",
      groupId: "g1",
      tabId: "t1",
    });
    surfaces.registerHost("note.md", "g1:t1", host);
    const unregisterFirst = manager.registerRuntime("note.md", firstRuntime);
    manager.setActivePane("note.md", "g1:t1");
    events.length = 0;

    const unregisterSecond = manager.registerRuntime("note.md", secondRuntime);
    manager.setActivePane("note.md", "g1:t1");

    expect(events).toEqual([
      "r1:read",
      "r1:cancel",
      "r1:destroy",
      "r2:restore:73",
    ]);
    expect(secondRuntime.surface.parentElement).toBe(document.body);
    expect(secondRuntime.surface.dataset.activePaneKey).toBe("g1:t1");
    expect(secondRuntime.restoreViewState).toHaveBeenCalledTimes(1);

    unregisterFirst();
    expect(secondRuntime.surface.parentElement).toBe(document.body);
    expect(secondRuntime.surface.dataset.activePaneKey).toBe("g1:t1");
    expect(secondRuntime.restoreViewState).toHaveBeenCalledTimes(1);
    unregisterSecond();
  });

  it("captures an active runtime across ready-null-ready and ignores stale release", () => {
    const events: string[] = [];
    const surfaces = new RichDocumentSurfaceRegistry();
    const viewStates = new RichPaneViewStateRegistry();
    const manager = createManager({ surfaces, viewStates });
    const firstRuntime = createStatefulRuntime("note.md", "r1", events, 91);
    const secondRuntime = createStatefulRuntime("note.md", "r2", events, 0);
    const host = document.createElement("div");
    manager.retainVisible("note.md", {
      paneKey: "g1:t1",
      groupId: "g1",
      tabId: "t1",
    });
    surfaces.registerHost("note.md", "g1:t1", host);
    const unregisterFirst = manager.registerRuntime("note.md", firstRuntime);
    manager.setActivePane("note.md", "g1:t1");
    events.length = 0;

    unregisterFirst();
    expect(events).toEqual(["r1:read", "r1:cancel", "r1:destroy"]);
    expect(firstRuntime.surface.parentElement).toBeNull();
    expect(manager.getActiveBinding()).toBeNull();

    events.length = 0;
    const unregisterSecond = manager.registerRuntime("note.md", secondRuntime);
    manager.setActivePane("note.md", "g1:t1");
    expect(events).toEqual(["r2:restore:91"]);
    expect(secondRuntime.surface.parentElement).toBe(document.body);
    expect(secondRuntime.surface.dataset.activePaneKey).toBe("g1:t1");

    unregisterFirst();
    expect(secondRuntime.surface.parentElement).toBe(document.body);
    expect(secondRuntime.surface.dataset.activePaneKey).toBe("g1:t1");
    expect(secondRuntime.restoreViewState).toHaveBeenCalledTimes(1);
    unregisterSecond();
  });

  it("tears down a re-registered runtime instance only from current cleanup", () => {
    const destroyed: string[] = [];
    const manager = createManager();
    const runtime = createRuntime("note.md", destroyed);
    const unregisterStale = manager.registerRuntime(
      "C:\\notes\\note.md",
      runtime,
    );
    const unregisterCurrent = manager.registerRuntime(
      "C:/notes/note.md",
      runtime,
    );

    unregisterStale();
    expect(runtime.cancelPendingWork).not.toHaveBeenCalled();
    expect(runtime.destroy).not.toHaveBeenCalled();

    unregisterCurrent();
    unregisterCurrent();
    expect(runtime.cancelPendingWork).toHaveBeenCalledTimes(1);
    expect(runtime.destroy).toHaveBeenCalledTimes(1);
  });

  it("unions and deduplicates visible and background tab ids", () => {
    const manager = createManager();
    manager.retainVisible("note.md", {
      paneKey: "g1:shared",
      groupId: "g1",
      tabId: "shared",
    });
    manager.retainVisible("note.md", {
      paneKey: "g2:visible",
      groupId: "g2",
      tabId: "visible",
    });
    manager.retainBackground("note.md", "shared");
    manager.retainBackground("note.md", "background");

    expect(manager.getBoundTabIds("note.md")).toEqual([
      "shared",
      "visible",
      "background",
    ]);
  });

  it("normalizes separator aliases across every path API", () => {
    const surfaces = new RichDocumentSurfaceRegistry();
    const manager = createManager({ surfaces });
    const destroyed: string[] = [];
    const runtime = createRuntime("C:/notes/note.md", destroyed);
    manager.retainVisible("C:\\notes\\note.md", {
      paneKey: "g1:t1",
      groupId: "g1",
      tabId: "t1",
    });
    manager.retainBackground("C:/notes/note.md", "t2");
    manager.registerRuntime("C:\\notes\\note.md", runtime);
    surfaces.registerHost(
      "C:/notes/note.md",
      "g1:t1",
      document.createElement("div"),
    );

    expect(manager.setActivePane("C:\\notes\\note.md", "g1:t1")).toBe(true);
    expect(manager.getSnapshot()).toEqual(["C:/notes/note.md"]);
    expect(manager.getVisiblePaneKeys("C:/notes/note.md")).toEqual(["g1:t1"]);
    expect(manager.getBoundTabIds("C:\\notes\\note.md")).toEqual(["t1", "t2"]);
    expect(manager.getRuntime("C:/notes/note.md")).toBe(runtime);
    expect(manager.getActivePane("C:/notes/note.md")).toBe("g1:t1");
    expect(manager.getActiveBinding()).toEqual({
      path: "C:/notes/note.md",
      binding: { paneKey: "g1:t1", groupId: "g1", tabId: "t1" },
    });
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

  it("publishes runtime changes only to the matching normalized path", () => {
    const manager = createManager();
    const noteListener = vi.fn();
    const otherListener = vi.fn();
    const retainedListener = vi.fn();
    const releaseVisible = manager.retainVisible("C:/notes/large.md", {
      paneKey: "g1:t1",
      groupId: "g1",
      tabId: "t1",
    });
    const retainedSnapshot = manager.getSnapshot();
    const unsubscribeRetained = manager.subscribe(retainedListener);
    const unsubscribeNote = manager.subscribeRuntime(
      "C:\\notes\\large.md",
      noteListener,
    );
    const unsubscribeOther = manager.subscribeRuntime(
      "C:/notes/other.md",
      otherListener,
    );
    const runtime = createRuntime("C:/notes/large.md", []);

    expect(manager.getRuntimeSnapshot("C:/notes/large.md")).toBeNull();
    const unregisterRuntime = manager.registerRuntime(
      "C:/notes/large.md",
      runtime,
    );

    expect(noteListener).toHaveBeenCalledTimes(1);
    expect(otherListener).not.toHaveBeenCalled();
    expect(retainedListener).not.toHaveBeenCalled();
    expect(manager.getSnapshot()).toBe(retainedSnapshot);
    expect(manager.getRuntimeSnapshot("C:\\notes\\large.md")).toBe(runtime);

    unregisterRuntime();
    expect(noteListener).toHaveBeenCalledTimes(2);
    expect(manager.getRuntimeSnapshot("C:/notes/large.md")).toBeNull();
    expect(retainedListener).not.toHaveBeenCalled();
    expect(manager.getSnapshot()).toBe(retainedSnapshot);

    unsubscribeNote();
    unsubscribeOther();
    unsubscribeRetained();
    releaseVisible();
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

function createStatefulRuntime(
  path: string,
  name: string,
  events: string[],
  scrollTop: number,
) {
  return {
    path,
    surface: document.createElement("div"),
    serializePendingChange: vi.fn(async () => undefined),
    cancelPendingWork: vi.fn(() => events.push(`${name}:cancel`)),
    destroy: vi.fn(() => events.push(`${name}:destroy`)),
    isDirty: () => false,
    isSaving: () => false,
    isReloading: () => false,
    readViewState: vi.fn(() => {
      events.push(`${name}:read`);
      return { scrollTop, selection: null };
    }),
    restoreViewState: vi.fn((state: { scrollTop: number }) => {
      events.push(`${name}:restore:${state.scrollTop}`);
    }),
  };
}
