import { describe, expect, it, vi } from "vitest";

import {
  chooseRestoredEditorScrollTop,
  readEditorViewportAnchor,
  readEditorScrollTop,
  restoreEditorScrollTop,
  scheduleStableEditorBlockScroll,
  scrollEditorBlockIntoView,
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

  it("starts at the top when refreshing the same file", () => {
    expect(
      chooseRestoredEditorScrollTop({
        currentPath: "a.md",
        nextPath: "a.md",
        currentScrollTop: 420,
        cachedScrollTop: null,
      }),
    ).toBe(0);
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

  it("scrolls a target block by updating the editor scroll container", () => {
    const container = {
      scrollTop: 200,
      getBoundingClientRect: () => ({ top: 100 }),
    };
    const target = {
      getBoundingClientRect: () => ({ top: 360 }),
      scrollIntoView: vi.fn(),
    };

    expect(scrollEditorBlockIntoView(container, target)).toBe(true);

    expect(container.scrollTop).toBe(460);
    expect(target.scrollIntoView).not.toHaveBeenCalled();
  });

  it("reads the first visible block as a renderer-independent viewport anchor", () => {
    const container = {
      scrollTop: 480,
      getBoundingClientRect: () => ({ top: 100 }),
    };
    const blocks = [
      {
        id: "block-a",
        getBoundingClientRect: () => ({ top: 20, bottom: 80 }),
      },
      {
        id: "block-b",
        getBoundingClientRect: () => ({ top: 70, bottom: 150 }),
      },
      {
        id: "block-c",
        getBoundingClientRect: () => ({ top: 150, bottom: 210 }),
      },
    ];

    expect(
      readEditorViewportAnchor(container, blocks, (block) => block.id),
    ).toEqual({
      topBlockId: "block-b",
      topBlockOffset: 30,
    });
  });

  it("restores the same block offset across different renderer heights", () => {
    const container = {
      scrollTop: 900,
      getBoundingClientRect: () => ({ top: 100 }),
    };
    const target = {
      getBoundingClientRect: () => ({ top: 360, bottom: 440 }),
    };

    expect(scrollEditorBlockIntoView(container, target, 30)).toBe(true);
    expect(container.scrollTop).toBe(1190);
  });

  it("reports when a target block cannot be found", () => {
    const container = {
      scrollTop: 200,
      getBoundingClientRect: () => ({ top: 100 }),
    };

    expect(scrollEditorBlockIntoView(container, null)).toBe(false);
    expect(container.scrollTop).toBe(200);
  });

  it("keeps a target block aligned on the next frame after scroll restoration", () => {
    const scheduledFrames: Array<() => void> = [];
    const container = {
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 0 }),
    };
    const target = {
      getBoundingClientRect: () => ({ top: 400 - container.scrollTop }),
    };

    expect(
      scheduleStableEditorBlockScroll({
        container,
        getTarget: () => target,
        schedule: (callback) => {
          scheduledFrames.push(callback);
        },
      }),
    ).toBe(true);
    expect(container.scrollTop).toBe(400);

    container.scrollTop = 0;
    scheduledFrames.shift()?.();

    expect(container.scrollTop).toBe(400);
  });
});
