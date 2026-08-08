import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LARGE_DOCUMENT_SERIALIZATION_QUIET_PERIOD_MS,
  getEditorSerializationQuietPeriod,
  scheduleEditorIdleTask,
  type EditorIdleSchedulerEnvironment,
} from "./editor-large-document";

function createEnvironment(
  overrides: Partial<EditorIdleSchedulerEnvironment> = {},
): EditorIdleSchedulerEnvironment {
  return {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("large document idle scheduling", () => {
  it("runs large-document work as soon as the quiet period ends", () => {
    vi.useFakeTimers();
    const requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
      callback({ didTimeout: false, timeRemaining: () => 10 });
      return 7;
    });
    const callback = vi.fn();

    scheduleEditorIdleTask(
      callback,
      1200,
      LARGE_DOCUMENT_SERIALIZATION_QUIET_PERIOD_MS,
      createEnvironment({ requestIdleCallback }),
    );

    expect(requestIdleCallback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(LARGE_DOCUMENT_SERIALIZATION_QUIET_PERIOD_MS - 1);
    expect(requestIdleCallback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(requestIdleCallback).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledOnce();
  });

  it("cancels delayed work before it reaches the idle queue", () => {
    vi.useFakeTimers();
    const requestIdleCallback = vi.fn(() => 7);
    const callback = vi.fn();
    const cancel = scheduleEditorIdleTask(
      callback,
      1200,
      LARGE_DOCUMENT_SERIALIZATION_QUIET_PERIOD_MS,
      createEnvironment({ requestIdleCallback }),
    );

    cancel();
    vi.runAllTimers();

    expect(requestIdleCallback).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it("cancels work after it enters the idle queue", () => {
    const cancelIdleCallback = vi.fn();
    const callback = vi.fn();
    const cancel = scheduleEditorIdleTask(
      callback,
      1200,
      0,
      createEnvironment({
        requestIdleCallback: vi.fn(() => 11),
        cancelIdleCallback,
      }),
    );

    cancel();

    expect(cancelIdleCallback).toHaveBeenCalledWith(11);
    expect(callback).not.toHaveBeenCalled();
  });

  it("retains the timeout fallback when idle callbacks are unavailable", () => {
    vi.useFakeTimers();
    const callback = vi.fn();

    scheduleEditorIdleTask(callback, 1200, 0, createEnvironment());

    vi.advanceTimersByTime(1199);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledOnce();
  });

  it("uses the quiet period only at the existing large-document threshold", () => {
    expect(getEditorSerializationQuietPeriod("x".repeat(9_999))).toBe(0);
    expect(getEditorSerializationQuietPeriod("x".repeat(10_000))).toBe(
      LARGE_DOCUMENT_SERIALIZATION_QUIET_PERIOD_MS,
    );
  });
});
