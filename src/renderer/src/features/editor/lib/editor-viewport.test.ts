import { describe, expect, it, vi } from "vitest";

import {
  chooseCapturedEditorViewport,
  chooseRestoredEditorScrollTop,
  completeEditorViewportPreservation,
  readEditorViewportPreservation,
  readEditorViewportAnchor,
  readEditorScrollTop,
  requestEditorViewportPreservation,
  restoreEditorScrollTop,
  resolveEditorViewportTargetOffset,
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

  it("preserves the current scroll offset for a requested live reload", () => {
    expect(
      chooseRestoredEditorScrollTop({
        currentPath: "a.md",
        nextPath: "a.md",
        currentScrollTop: 420,
        cachedScrollTop: null,
        preserveCurrentScroll: true,
      }),
    ).toBe(420);
  });

  it("keeps a newer viewport preservation request pending", () => {
    const firstVersion = requestEditorViewportPreservation("C:\\notes\\a.md");
    const secondVersion = requestEditorViewportPreservation("C:/notes/a.md");

    completeEditorViewportPreservation("C:/notes/a.md", firstVersion);
    expect(readEditorViewportPreservation("C:/notes/a.md")).toBe(secondVersion);

    completeEditorViewportPreservation("C:/notes/a.md", secondVersion);
    expect(readEditorViewportPreservation("C:/notes/a.md")).toBeNull();
  });

  it("keeps the requested viewport while a pane restore is still settling", () => {
    const live = {
      scrollTop: 940,
      topBlockId: "code-block",
      topBlockOffset: 210,
      topBlockRatio: 0.4,
      topCodeLine: 12,
      topCodeLineOffset: -8,
    };
    const pending = {
      scrollTop: 720,
      topBlockId: "code-block",
      topBlockOffset: 130,
      topBlockRatio: 0.25,
      topCodeLine: 8,
      topCodeLineOffset: -4,
    };

    expect(
      chooseCapturedEditorViewport({
        live,
        now: 150,
        pending,
        suppressUntil: 250,
      }),
    ).toEqual(pending);
    expect(
      chooseCapturedEditorViewport({
        live,
        now: 251,
        pending,
        suppressUntil: 250,
      }),
    ).toEqual(live);
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
      topCodeLine: null,
      topCodeLineOffset: 0,
      topBlockId: "block-b",
      topBlockOffset: 30,
      topBlockRatio: 0.375,
    });
  });

  it("restores the same relative position when live and preview block heights differ", () => {
    const previewBlock = {
      getBoundingClientRect: () => ({ top: -380, bottom: 420, height: 800 }),
    };

    expect(
      resolveEditorViewportTargetOffset(previewBlock, {
        topCodeLine: null,
        topCodeLineOffset: 0,
        topBlockId: "code-block",
        topBlockOffset: 250,
        topBlockRatio: 0.25,
      }),
    ).toBe(200);
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

  it("keeps aligning while embedded editor geometry changes across frames", () => {
    const scheduledFrames: Array<() => void> = [];
    const container = {
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 0 }),
    };
    let layoutShift = 0;
    const target = {
      getBoundingClientRect: () => ({
        top: 400 + layoutShift - container.scrollTop,
      }),
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

    layoutShift = 80;
    scheduledFrames.shift()?.();
    expect(container.scrollTop).toBe(480);
    expect(scheduledFrames).toHaveLength(1);

    layoutShift = 160;
    scheduledFrames.shift()?.();
    expect(container.scrollTop).toBe(560);
    expect(scheduledFrames).toHaveLength(1);

    scheduledFrames.shift()?.();
    scheduledFrames.shift()?.();
    expect(container.scrollTop).toBe(560);
    expect(scheduledFrames).toHaveLength(0);
  });

  it("recalculates a proportional target offset while block height settles", () => {
    const scheduledFrames: Array<() => void> = [];
    const container = {
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 0 }),
    };
    let height = 400;
    const target = {
      getBoundingClientRect: () => ({
        bottom: 400 - container.scrollTop + height,
        height,
        top: 400 - container.scrollTop,
      }),
    };
    const anchor = {
      topCodeLine: null,
      topCodeLineOffset: 0,
      topBlockId: "code-block",
      topBlockOffset: 100,
      topBlockRatio: 0.25,
    };

    scheduleStableEditorBlockScroll({
      container,
      getTarget: () => target,
      getTargetOffset: (candidate) =>
        resolveEditorViewportTargetOffset(candidate, anchor),
      schedule: (callback) => scheduledFrames.push(callback),
    });
    expect(container.scrollTop).toBe(500);

    height = 800;
    scheduledFrames.shift()?.();
    expect(container.scrollTop).toBe(600);
  });
});
