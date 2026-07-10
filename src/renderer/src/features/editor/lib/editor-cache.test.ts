import { describe, expect, it } from "vitest";

import { EditorCache } from "./editor-cache";

describe("EditorCache", () => {
  it("returns content only when the stored source matches", () => {
    const cache = new EditorCache<string>({ maxEntries: 2 });
    cache.setContent("a.md", "alpha");
    cache.setBlocks("a.md", "alpha", "parsed-alpha");

    expect(cache.getContent("a.md")).toBe("alpha");
    expect(cache.getBlocks("a.md", "alpha")).toEqual({
      blocks: "parsed-alpha",
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

  it("does not restore scroll position from parsed block cache", () => {
    const cache = new EditorCache<string>({ maxEntries: 2 });
    cache.setBlocks("a.md", "a", "blocks-a");
    cache.setBlocks("b.md", "b", "blocks-b");

    cache.setScrollTop("a.md", 96);

    expect(cache.getBlocks("a.md", "a")).toEqual({ blocks: "blocks-a" });
    expect(cache.getBlocks("b.md", "b")).toEqual({ blocks: "blocks-b" });
  });

  it("stores serialized baseline with parsed blocks", () => {
    const cache = new EditorCache<string>({ maxEntries: 2 });

    cache.setBlocks("a.md", "a", "blocks-a", "parser-v1", "baseline-a");

    expect(cache.getBlocks("a.md", "a", "parser-v1")).toEqual({
      blocks: "blocks-a",
      serializedBaseline: "baseline-a",
    });
    expect(cache.getBlocks("a.md", "a", "parser-v2")).toBeNull();
  });
});
