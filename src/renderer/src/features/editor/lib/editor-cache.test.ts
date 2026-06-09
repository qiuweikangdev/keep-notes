import { describe, expect, it } from "vitest";

import { EditorCache } from "./editor-cache";

describe("EditorCache", () => {
  it("returns content only when the stored source matches", () => {
    const cache = new EditorCache<string>({ maxEntries: 2 });
    cache.setContent("a.md", "alpha");
    cache.setBlocks("a.md", "alpha", "parsed-alpha", 24);

    expect(cache.getContent("a.md")).toBe("alpha");
    expect(cache.getBlocks("a.md", "alpha")).toEqual({
      blocks: "parsed-alpha",
      scrollTop: 24,
    });
    expect(cache.getBlocks("a.md", "changed")).toBeNull();
  });

  it("evicts the least recently used path", () => {
    const cache = new EditorCache<string>({ maxEntries: 2 });
    cache.setContent("a.md", "a");
    cache.setContent("b.md", "b");
    cache.getContent("a.md");
    cache.setContent("c.md", "c");

    expect(cache.getContent("a.md")).toBe("a");
    expect(cache.getContent("b.md")).toBeNull();
    expect(cache.getContent("c.md")).toBe("c");
  });

  it("updates scroll position without affecting another file", () => {
    const cache = new EditorCache<string>({ maxEntries: 2 });
    cache.setBlocks("a.md", "a", "blocks-a", 12);
    cache.setBlocks("b.md", "b", "blocks-b", 24);

    cache.setScrollTop("a.md", 96);

    expect(cache.getBlocks("a.md", "a")?.scrollTop).toBe(96);
    expect(cache.getBlocks("b.md", "b")?.scrollTop).toBe(24);
  });
});
