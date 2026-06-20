import { describe, expect, it, vi } from "vitest";

import {
  chooseRestoredEditorScrollTop,
  readEditorScrollTop,
  restoreEditorScrollTop,
} from "./editor-viewport";

describe("editor viewport", () => {
  it("normalizes invalid scroll offsets", () => {
    expect(readEditorScrollTop({ scrollTop: 48 })).toBe(48);
    expect(readEditorScrollTop({ scrollTop: -12 })).toBe(0);
    expect(readEditorScrollTop(null)).toBe(0);
  });

  it("restores scroll on the scheduled frame", () => {
    const element = { scrollTop: 0 };
    const schedule = vi.fn<(callback: () => void) => void>();

    restoreEditorScrollTop(element, 96, schedule);

    expect(element.scrollTop).toBe(0);
    expect(schedule).toHaveBeenCalledTimes(1);
    schedule.mock.calls[0][0]();
    expect(element.scrollTop).toBe(96);
  });

  it("keeps the current viewport when refreshing the same file", () => {
    expect(
      chooseRestoredEditorScrollTop({
        currentPath: "a.md",
        nextPath: "a.md",
        currentScrollTop: 420,
        cachedScrollTop: null,
      }),
    ).toBe(420);
  });

  it("starts at the top when switching to another cached file", () => {
    expect(
      chooseRestoredEditorScrollTop({
        currentPath: "a.md",
        nextPath: "b.md",
        currentScrollTop: 420,
        cachedScrollTop: 88,
      }),
    ).toBe(0);
  });
});
