import { describe, expect, it, vi } from "vitest";

import { FileWatchRegistry } from "./file-watch-registry";

describe("FileWatchRegistry", () => {
  it("shares one path watch and one global listener across subscribers", () => {
    let emit: ((path: string, content: string) => void) | undefined;
    const watch = vi.fn();
    const unwatch = vi.fn();
    const unsubscribeGlobal = vi.fn();
    const registry = new FileWatchRegistry({
      watch,
      unwatch,
      subscribeGlobal: (listener) => {
        emit = listener;
        return unsubscribeGlobal;
      },
      isOwnWrite: () => false,
    });
    const first = vi.fn();
    const second = vi.fn();

    const releaseFirst = registry.subscribe("a.md", first);
    const releaseSecond = registry.subscribe("a.md", second);
    emit?.("a.md", "external");

    expect(watch).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith("external");
    expect(second).toHaveBeenCalledWith("external");

    releaseFirst();
    expect(unwatch).not.toHaveBeenCalled();
    releaseSecond();
    expect(unwatch).toHaveBeenCalledWith("a.md");
    expect(unsubscribeGlobal).toHaveBeenCalledTimes(1);
  });

  it("checks an own write once before notifying any subscriber", () => {
    let emit: ((path: string, content: string) => void) | undefined;
    const isOwnWrite = vi.fn().mockReturnValue(true);
    const registry = new FileWatchRegistry({
      watch: vi.fn(),
      unwatch: vi.fn(),
      subscribeGlobal: (listener) => {
        emit = listener;
        return vi.fn();
      },
      isOwnWrite,
    });
    const first = vi.fn();
    const second = vi.fn();
    registry.subscribe("a.md", first);
    registry.subscribe("a.md", second);

    emit?.("a.md", "saved");

    expect(isOwnWrite).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });
});
