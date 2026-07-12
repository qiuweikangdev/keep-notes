import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EDITOR_PERFORMANCE_OPERATIONS,
  EditorPerformanceSpanRegistry,
  EditorResizeFrameCoordinator,
  EditorSplitPaintCoordinator,
  createEditorPerformanceContext,
  measureEditorOperation,
  observeEditorLongTasks,
} from "./editor-performance";

interface MockPerformanceObserverInstance {
  callback: PerformanceObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
}

const originalPerformanceDescriptors = new Map<
  "clearMarks" | "mark" | "measure",
  PropertyDescriptor | undefined
>();
const originalPerformanceObserverDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "PerformanceObserver",
);

function installPerformanceSpies() {
  const mark = vi.fn();
  const measure = vi.fn();
  const clearMarks = vi.fn();

  for (const [name, value] of Object.entries({
    mark,
    measure,
    clearMarks,
  }) as Array<["clearMarks" | "mark" | "measure", ReturnType<typeof vi.fn>]>) {
    originalPerformanceDescriptors.set(
      name,
      Object.getOwnPropertyDescriptor(performance, name),
    );
    Object.defineProperty(performance, name, {
      configurable: true,
      value,
    });
  }

  return { clearMarks, mark, measure };
}

function installPerformanceObserver(
  options: {
    observeError?: Error;
    supportedEntryTypes?: string[];
  } = {},
) {
  const instances: MockPerformanceObserverInstance[] = [];

  class MockPerformanceObserver {
    static supportedEntryTypes = options.supportedEntryTypes ?? ["longtask"];
    callback: PerformanceObserverCallback;
    disconnect = vi.fn();
    observe = options.observeError
      ? vi.fn(() => {
          throw options.observeError;
        })
      : vi.fn();

    constructor(callback: PerformanceObserverCallback) {
      this.callback = callback;
      instances.push(this);
    }
  }

  Object.defineProperty(globalThis, "PerformanceObserver", {
    configurable: true,
    value: MockPerformanceObserver,
  });

  return instances;
}

describe("editor performance diagnostics", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    for (const [name, descriptor] of originalPerformanceDescriptors) {
      if (descriptor) {
        Object.defineProperty(performance, name, descriptor);
      } else {
        Reflect.deleteProperty(performance, name);
      }
    }
    originalPerformanceDescriptors.clear();
    if (originalPerformanceObserverDescriptor) {
      Object.defineProperty(
        globalThis,
        "PerformanceObserver",
        originalPerformanceObserverDescriptor,
      );
    } else {
      Reflect.deleteProperty(globalThis, "PerformanceObserver");
    }
  });

  it("keeps only three numeric counters and an allowlisted operation", () => {
    const context = createEditorPerformanceContext({
      documentLength: 24_000,
      visiblePaneCount: 3,
      mountedPreviewBlockCount: 28,
      operation: "editor:pane-activate",
      path: "C:/notes/large.md",
      content: "# private content",
      html: "<p>private</p>",
      title: "Secret note",
    });

    expect(context).toEqual({
      documentLength: 24_000,
      visiblePaneCount: 3,
      mountedPreviewBlockCount: 28,
      operation: "editor:pane-activate",
    });
    expect(Object.keys(context)).toEqual([
      "documentLength",
      "visiblePaneCount",
      "mountedPreviewBlockCount",
      "operation",
    ]);
    expect(JSON.stringify(context)).not.toMatch(
      /large\.md|private content|<p>|Secret note/,
    );
  });

  it("drops non-allowlisted operation names and normalizes unsafe counters", () => {
    expect(
      createEditorPerformanceContext({
        documentLength: Number.POSITIVE_INFINITY,
        visiblePaneCount: -3,
        mountedPreviewBlockCount: 2.9,
        operation: "editor:private-path" as "editor:transaction",
      }),
    ).toEqual({
      documentLength: 0,
      visiblePaneCount: 0,
      mountedPreviewBlockCount: 2,
    });
    expect(EDITOR_PERFORMANCE_OPERATIONS).toEqual([
      "editor:split-to-paint",
      "editor:pane-activate",
      "editor:transaction",
      "editor:preview-frame",
      "editor:resize-frame",
    ]);
  });

  it("uses unique marks for concurrent operations and closes them independently", async () => {
    const { clearMarks, mark, measure } = installPerformanceSpies();
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;

    const first = measureEditorOperation(
      "editor:transaction",
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const second = measureEditorOperation(
      "editor:transaction",
      () =>
        new Promise<void>((resolve) => {
          resolveSecond = resolve;
        }),
    );
    const startMarks = mark.mock.calls.map(([name]) => name as string);

    expect(startMarks).toHaveLength(2);
    expect(new Set(startMarks).size).toBe(2);
    expect(startMarks.every((name) => name.endsWith(":start"))).toBe(true);

    resolveSecond();
    await second;
    resolveFirst();
    await first;

    expect(measure).toHaveBeenCalledTimes(2);
    for (const [operation, start, end] of measure.mock.calls) {
      expect(operation).toBe("editor:transaction");
      expect(startMarks).toContain(start);
      expect(end).toBe((start as string).replace(/:start$/, ":end"));
    }
    expect(clearMarks).toHaveBeenCalledTimes(4);
  });

  it("finishes measurements for sync returns, throws, resolves, and rejects", async () => {
    const { measure } = installPerformanceSpies();

    expect(
      measureEditorOperation("editor:resize-frame", () => "complete"),
    ).toBe("complete");
    expect(() =>
      measureEditorOperation("editor:pane-activate", () => {
        throw new Error("sync failure");
      }),
    ).toThrow("sync failure");
    await expect(
      measureEditorOperation("editor:preview-frame", async () => "complete"),
    ).resolves.toBe("complete");
    await expect(
      measureEditorOperation("editor:transaction", async () => {
        throw new Error("async failure");
      }),
    ).rejects.toThrow("async failure");

    expect(measure).toHaveBeenCalledTimes(4);
  });

  it("aborts a rejected sample without publishing a measurement", () => {
    const { mark, measure } = installPerformanceSpies();

    expect(
      measureEditorOperation("editor:pane-activate", () => false, Boolean),
    ).toBe(false);

    expect(mark).toHaveBeenCalledTimes(1);
    expect(measure).not.toHaveBeenCalled();
  });

  it("matches long tasks to bounded overlapping spans without stale attribution", () => {
    const spans = new EditorPerformanceSpanRegistry({ maxSpans: 2 });
    const transaction = spans.begin("editor:transaction", 10);
    spans.finish(transaction, 100);
    const resize = spans.begin("editor:resize-frame", 40);
    spans.finish(resize, 60);

    expect(spans.match(20, 5)).toBe("editor:transaction");
    expect(spans.match(45, 5)).toBe("editor:resize-frame");
    expect(spans.match(101, 50)).toBeNull();

    const preview = spans.begin("editor:preview-frame", 120);
    spans.finish(preview, 140);
    expect(spans.size).toBe(2);
    expect(spans.match(20, 5)).toBeNull();
  });

  it("executes an invalid operation without creating diagnostics", () => {
    const { mark, measure } = installPerformanceSpies();

    expect(
      measureEditorOperation(
        "editor:document:C:/notes/private.md" as "editor:transaction",
        () => 42,
      ),
    ).toBe(42);
    expect(mark).not.toHaveBeenCalled();
    expect(measure).not.toHaveBeenCalled();
  });

  it("observes long tasks with a redacted context and disconnects on cleanup", () => {
    const instances = installPerformanceObserver();
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const spans = new EditorPerformanceSpanRegistry();
    const resize = spans.begin("editor:resize-frame", 100);
    spans.finish(resize, 200);
    const cleanup = observeEditorLongTasks(
      () => ({
        documentLength: 50_000,
        visiblePaneCount: 6,
        mountedPreviewBlockCount: 40,
        operation: "editor:transaction",
        path: "C:/notes/large.md",
        content: "# private content",
        html: "<p>private</p>",
        title: "Secret note",
      }),
      { spans },
    );

    expect(instances).toHaveLength(1);
    expect(instances[0].observe).toHaveBeenCalledWith({
      buffered: true,
      type: "longtask",
    });
    instances[0].callback(
      {
        getEntries: () =>
          [
            { duration: 49, startTime: 110 },
            { duration: 51, startTime: 120 },
            { duration: 51, startTime: 300 },
          ] as PerformanceEntry[],
      } as PerformanceObserverEntryList,
      instances[0] as unknown as PerformanceObserver,
    );

    expect(debug).toHaveBeenCalledOnce();
    expect(debug).toHaveBeenCalledWith("[editor-performance] longtask", {
      documentLength: 50_000,
      visiblePaneCount: 6,
      mountedPreviewBlockCount: 40,
      operation: "editor:resize-frame",
    });
    expect(JSON.stringify(debug.mock.calls)).not.toMatch(
      /large\.md|private content|<p>|Secret note/,
    );

    cleanup();
    expect(instances[0].disconnect).toHaveBeenCalledOnce();
  });

  it("coordinates split commit-to-paint completion and cleanup without hanging", async () => {
    const scheduled: FrameRequestCallback[] = [];
    const deferred: Array<() => void> = [];
    const cancelFrame = vi.fn();
    const measure = vi.fn(<T>(_operation: string, callback: () => T) =>
      callback(),
    );
    const coordinator = new EditorSplitPaintCoordinator({
      cancelFrame,
      defer: (callback) => deferred.push(callback),
      measure,
      scheduleFrame: (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
    });

    const token = coordinator.begin();
    const firstMeasurement = measure.mock.results[0].value as Promise<void>;
    expect(coordinator.bindPane(token, "group-2")).toBe(true);
    const cleanup = coordinator.commitPane("group-2");
    expect(scheduled).toHaveLength(1);
    scheduled[0](16);
    expect(scheduled).toHaveLength(2);
    let settled = false;
    void firstMeasurement.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    scheduled[1](32);
    await expect(firstMeasurement).resolves.toBeUndefined();
    expect(coordinator.pendingCount).toBe(0);

    const cleanupToken = coordinator.begin();
    const cleanupMeasurement = measure.mock.results[1].value as Promise<void>;
    coordinator.bindPane(cleanupToken, "group-3");
    const cleanupPendingPane = coordinator.commitPane("group-3");
    cleanupPendingPane();
    expect(deferred).toHaveLength(1);
    deferred[0]();
    await expect(cleanupMeasurement).resolves.toBeUndefined();
    expect(cancelFrame).toHaveBeenCalledOnce();
    expect(coordinator.pendingCount).toBe(0);

    cleanup();
  });

  it("coalesces resize frames and settles a canceled pending measurement", async () => {
    const scheduled: FrameRequestCallback[] = [];
    const cancelFrame = vi.fn();
    const measure = vi.fn(<T>(_operation: string, callback: () => T) =>
      callback(),
    );
    const coordinator = new EditorResizeFrameCoordinator({
      cancelFrame,
      measure,
      scheduleFrame: (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
    });

    coordinator.handleLayout();
    coordinator.handleLayout();
    expect(measure).toHaveBeenCalledOnce();
    expect(scheduled).toHaveLength(1);
    const measurement = measure.mock.results[0].value as Promise<void>;
    coordinator.cancel();

    await expect(measurement).resolves.toBeUndefined();
    expect(cancelFrame).toHaveBeenCalledOnce();
  });

  it("is safe when long-task observation is unsupported or observe throws", () => {
    const unsupported = installPerformanceObserver({
      supportedEntryTypes: ["resource"],
    });
    expect(() => observeEditorLongTasks(() => ({}))()).not.toThrow();
    expect(unsupported).toHaveLength(0);

    const failed = installPerformanceObserver({
      observeError: new Error("unsupported entry type"),
    });
    expect(() => observeEditorLongTasks(() => ({}))()).not.toThrow();
    expect(failed[0].disconnect).toHaveBeenCalledOnce();
  });

  it("does not create marks, observers, or logs outside development", () => {
    vi.stubEnv("DEV", false);
    const { mark, measure } = installPerformanceSpies();
    const instances = installPerformanceObserver();
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

    expect(
      measureEditorOperation("editor:transaction", () => "production"),
    ).toBe("production");
    expect(() => observeEditorLongTasks(() => ({}))()).not.toThrow();

    expect(mark).not.toHaveBeenCalled();
    expect(measure).not.toHaveBeenCalled();
    expect(instances).toHaveLength(0);
    expect(debug).not.toHaveBeenCalled();
  });
});
