import { beforeEach, describe, expect, it, vi } from "vitest";

import { EditorSaveCoordinator } from "./editor-save-coordinator";

describe("EditorSaveCoordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("persists only the latest revision after the idle delay", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const coordinator = new EditorSaveCoordinator({ delayMs: 800, write });

    coordinator.schedule("a.md", "one");
    coordinator.schedule("a.md", "two");
    await vi.advanceTimersByTimeAsync(800);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith("a.md", "two");
  });

  it("flushes one path without clearing another", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const coordinator = new EditorSaveCoordinator({ delayMs: 800, write });

    coordinator.schedule("a.md", "a");
    coordinator.schedule("b.md", "b");
    await coordinator.flush("a.md");

    expect(write).toHaveBeenCalledWith("a.md", "a");
    expect(coordinator.hasPending("b.md")).toBe(true);
  });

  it("keeps a newer revision pending when an older write finishes later", async () => {
    let resolveFirstWrite: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => {
      resolveFirstWrite = resolve;
    });
    const write = vi
      .fn()
      .mockReturnValueOnce(firstWrite)
      .mockResolvedValue(undefined);
    const coordinator = new EditorSaveCoordinator({ delayMs: 800, write });

    coordinator.schedule("a.md", "one");
    const flushing = coordinator.flush("a.md");
    coordinator.schedule("a.md", "two");
    resolveFirstWrite?.();
    await flushing;

    expect(coordinator.hasPending("a.md")).toBe(true);
    await coordinator.flush("a.md");
    expect(write).toHaveBeenLastCalledWith("a.md", "two");
    expect(coordinator.hasPending("a.md")).toBe(false);
  });

  it("recognizes matching filesystem events during the recent-write window", async () => {
    const coordinator = new EditorSaveCoordinator({
      delayMs: 800,
      write: vi.fn().mockResolvedValue(undefined),
    });

    coordinator.schedule("a.md", "saved");
    await coordinator.flush("a.md");

    expect(coordinator.isOwnWrite("a.md", "saved")).toBe(true);
    await vi.advanceTimersByTimeAsync(2_001);
    expect(coordinator.isOwnWrite("a.md", "saved")).toBe(false);
  });

  it("recognizes repeated filesystem events from the same recent write", async () => {
    const coordinator = new EditorSaveCoordinator({
      delayMs: 800,
      write: vi.fn().mockResolvedValue(undefined),
    });

    coordinator.schedule("a.md", "saved");
    await coordinator.flush("a.md");

    expect(coordinator.isOwnWrite("a.md", "saved")).toBe(true);
    expect(coordinator.isOwnWrite("a.md", "saved")).toBe(true);
  });

  it("marks a write before the filesystem event can arrive", async () => {
    let coordinator: EditorSaveCoordinator;
    const observedOwnWrites: boolean[] = [];
    const write = vi.fn(async (path: string, content: string) => {
      observedOwnWrites.push(coordinator.isOwnWrite(path, content));
    });
    coordinator = new EditorSaveCoordinator({ delayMs: 800, write });

    coordinator.schedule("a.md", "saved");
    const succeeded = await coordinator.flush("a.md");

    expect(succeeded).toBe(true);
    expect(observedOwnWrites).toEqual([true]);
    expect(write).toHaveBeenCalledWith("a.md", "saved");
  });

  it("recognizes multiple recent writes when filesystem events arrive out of order", async () => {
    const coordinator = new EditorSaveCoordinator({
      delayMs: 800,
      write: vi.fn().mockResolvedValue(undefined),
    });

    coordinator.schedule("a.md", "one");
    await coordinator.flush("a.md");
    coordinator.schedule("a.md", "two");
    await coordinator.flush("a.md");

    expect(coordinator.isOwnWrite("a.md", "one")).toBe(true);
    expect(coordinator.isOwnWrite("a.md", "two")).toBe(true);
  });
});
