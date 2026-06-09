import { describe, expect, it, vi } from "vitest";

import {
  createFileOpenController,
  EditorLoadSession,
} from "./editor-load-session";

describe("EditorLoadSession", () => {
  it("accepts only the latest request for a tab", () => {
    const session = new EditorLoadSession();
    const first = session.begin("group-1", "tab-1", "a.md");
    const second = session.begin("group-1", "tab-1", "b.md");

    expect(session.isCurrent(first)).toBe(false);
    expect(session.isCurrent(second)).toBe(true);
  });

  it("does not mix requests between tabs", () => {
    const session = new EditorLoadSession();
    const left = session.begin("left", "tab", "a.md");
    const right = session.begin("right", "tab", "b.md");

    expect(session.isCurrent(left)).toBe(true);
    expect(session.isCurrent(right)).toBe(true);
  });

  it("keeps the second file when the first read resolves last", async () => {
    const first = createDeferred<string>();
    const second = createDeferred<string>();
    const read = vi.fn((path: string) =>
      path === "a.md" ? first.promise : second.promise,
    );
    const applied: Array<{ path: string; content: string }> = [];
    const controller = createFileOpenController({ read });

    const openA = controller.open({
      groupId: "group",
      tabId: "tab",
      path: "a.md",
      onSuccess: (content) => applied.push({ path: "a.md", content }),
    });
    const openB = controller.open({
      groupId: "group",
      tabId: "tab",
      path: "b.md",
      onSuccess: (content) => applied.push({ path: "b.md", content }),
    });

    second.resolve("B");
    await openB;
    first.resolve("A");
    await openA;

    expect(applied).toEqual([{ path: "b.md", content: "B" }]);
  });

  it("shows cached content first and then refreshes it from disk", async () => {
    const applied: string[] = [];
    const setContent = vi.fn();
    const controller = createFileOpenController({
      read: vi.fn().mockResolvedValue("fresh"),
      cache: {
        getContent: () => "cached",
        setContent,
      },
    });

    await controller.open({
      groupId: "group",
      tabId: "tab",
      path: "a.md",
      onSuccess: (content) => applied.push(content),
    });

    expect(applied).toEqual(["cached", "fresh"]);
    expect(setContent).toHaveBeenCalledWith("a.md", "fresh");
  });
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
